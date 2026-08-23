// schema 初始化记忆化：D1 schema 是持久化的，幂等操作只需在整个 isolate 生命周期内执行一次
// 避免每个请求（含首页每个 API 调用）都白白发起 18 条 CREATE/ALTER/INDEX 语句
let schemaInitPromise = null

export class Database {
    constructor(env) {
        this.db = env.suyuan
    }

    async init() {
        if (!schemaInitPromise) {
            schemaInitPromise = this._ensureSchema().catch((e) => {
                schemaInitPromise = null // 初始化失败时允许下次重试
                throw e
            })
        }
        return schemaInitPromise
    }

    async _ensureSchema() {
        await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '',
        category TEXT DEFAULT 'general',
        hot_score INTEGER DEFAULT 50,
        source_name TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

        await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        phone TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

        await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL DEFAULT 0,
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

        await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        hot_score INTEGER DEFAULT 60,
        lang TEXT DEFAULT 'zh',
        description TEXT DEFAULT '',
        url_backup TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

        // 为已存在的 sources 表补充 url 唯一约束（旧部署兼容）
        try {
            await this.db.prepare(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_url ON sources(url)
            `).run();
        } catch (e) { /* 索引已存在 */ }

        // 兼容旧表结构：添加新字段
        const alterCols = [
            "ALTER TABLE notes ADD COLUMN category TEXT DEFAULT 'general'",
            "ALTER TABLE notes ADD COLUMN hot_score INTEGER DEFAULT 50",
            "ALTER TABLE notes ADD COLUMN source_name TEXT DEFAULT ''",
            "ALTER TABLE notes ADD COLUMN summary TEXT DEFAULT ''",
            "ALTER TABLE notes ADD COLUMN ai_summary TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN email TEXT",
            "ALTER TABLE users ADD COLUMN phone TEXT",
            "ALTER TABLE comments ADD COLUMN user_id INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN interests TEXT DEFAULT '[]'",
            "ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'",
            "ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1"
        ];
        for (const sql of alterCols) {
            try { await this.db.prepare(sql).run(); } catch (e) { /* 列已存在 */ }
        }

        // 阅读历史表
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS reading_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                post_id INTEGER NOT NULL,
                read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, post_id)
            )
        `).run();

        // 创建索引以优化查询性能
        const indexes = [
            "CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_notes_source ON notes(source_name)",
            "CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)",
            "CREATE INDEX IF NOT EXISTS idx_notes_hot_score ON notes(hot_score DESC)",
            "CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)"
        ];
        for (const sql of indexes) {
            try { await this.db.prepare(sql).run(); } catch (e) { /* 索引已存在 */ }
        }
    }

    // ========== 文章相关 ==========
    async findAllPosts(tag = null, category = null, source = null, keyword = null, sortBy = 'created_at', order = 'DESC', limit = 20, offset = 0, userInterests = []) {
        // 构建带搜索条件的 SQL 查询
        let sql = "SELECT id, title, username, tags, category, hot_score, source_name, summary, ai_summary, created_at, SUBSTR(content, 1, 200) AS snippet FROM notes WHERE 1=1"
        const bindings = []

        if (keyword) {
            sql += " AND (title LIKE ? OR content LIKE ? OR summary LIKE ?)"
            const kw = `%${keyword}%`
            bindings.push(kw, kw, kw)
        }
        if (category) {
            sql += " AND category = ?"
            bindings.push(category)
        }
        if (source) {
            sql += " AND (source_name LIKE ? OR username LIKE ?)"
            const s = `%${source}%`
            bindings.push(s, s)
        }
        // 标签筛选也放进 SQL，保证 total 计数准确
        if (tag) {
            sql += " AND tags LIKE ?"
            bindings.push(`%${tag}%`)
        }

        // 排序（安全性：sortBy 和 order 已经在路由层通过白名单校验）
        const sortCol = sortBy === 'hot_score' ? 'hot_score' : 'created_at'
        
        // 个性化推荐：如果用户有设置兴趣标签，对匹配分类的文章加权排序
        let finalOrderSql
        if (userInterests && userInterests.length > 0 && sortBy === 'created_at') {
            // 使用 CASE WHEN 为兴趣分类文章赋予更高的排序权重
            const interestCases = userInterests.map(() => 
                `WHEN category = ? THEN 0`
            ).join(' ')
            
            sql += ` ORDER BY (CASE ${interestCases} ELSE 1 END), ${sortCol} ${order === 'ASC' ? 'ASC' : 'DESC'}, created_at DESC`
            // 将 interests 绑定参数加入
            bindings.push(...userInterests)
            finalOrderSql = sql
        } else {
            const secondarySort = sortCol === 'hot_score' ? ', created_at DESC' : ''
            sql += ` ORDER BY ${sortCol} ${order === 'ASC' ? 'ASC' : 'DESC'}${secondarySort}`
            finalOrderSql = sql
        }

        // 1) 先 COUNT 总数：D1 对 COUNT(*) 有优化，比窗口函数全表扫描快得多
        const countSql = "SELECT COUNT(*) AS total_count FROM notes WHERE 1=1" +
            (keyword ? " AND (title LIKE ? OR content LIKE ? OR summary LIKE ?)" : "") +
            (category ? " AND category = ?" : "") +
            (source ? " AND (source_name LIKE ? OR username LIKE ?)" : "") +
            (tag ? " AND tags LIKE ?" : "")
        const countBindings = []
        if (keyword) { countBindings.push(...bindings.slice(0, 3)) }
        if (category) { countBindings.push(category) }
        if (source) { countBindings.push(`%${source}%`, `%${source}%`) }
        if (tag) { countBindings.push(`%${tag}%`) }

        const total = await this.db.prepare(countSql).bind(...countBindings).first('total_count') ?? 0

        // 2) 再分页取数据（保留原排序和兴趣加权）
        const pageSql = finalOrderSql + " LIMIT ? OFFSET ?"
        const pageBindings = [...bindings, limit, offset]

        const { results } = await this.db.prepare(pageSql).bind(...pageBindings).all()

        return { posts: results || [], total };
    }

    async findPostById(id) {
        return await this.db.prepare("SELECT * FROM notes WHERE id = ?").bind(id).first();
    }

    async createPost(userId, username, title, content, tags, hotScore = 50, category = 'general', sourceName = '', summary = '') {
        const result = await this.db.prepare(
            "INSERT INTO notes (user_id, username, title, content, tags, hot_score, category, source_name, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(userId, username, title, content, tags, hotScore, category, sourceName, summary).run();
        return result.meta?.last_row_id || null;
    }

    async updatePostSummary(id, summary) {
        return await this.db.prepare(
            "UPDATE notes SET summary = ? WHERE id = ?"
        ).bind(summary, id).run();
    }

    async updatePostAISummary(id, aiSummary) {
        return await this.db.prepare(
            "UPDATE notes SET ai_summary = ? WHERE id = ?"
        ).bind(aiSummary, id).run();
    }

    async deletePost(id) {
        return await this.db.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
    }

    async deletePostsByIds(ids) {
        if (!ids || !ids.length) return null;
        // D1 每次查询最多约 100 个绑定参数，分批次执行
        const BATCH_SIZE = 100;
        let totalDeleted = 0;
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            const batch = ids.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => '?').join(',');
            const result = await this.db.prepare(
                `DELETE FROM notes WHERE id IN (${placeholders})`
            ).bind(...batch).run();
            totalDeleted += result.meta?.changes_written || batch.length;
        }
        return { total_deleted: totalDeleted };
    }

    // 分类与来源统计
    async getCategoryStats() {
        try {
            const [catRows, sourceRows] = await Promise.all([
                this.db.prepare(
                    "SELECT category, COUNT(*) as count FROM notes WHERE category IS NOT NULL AND category != '' GROUP BY category"
                ).all(),
                this.db.prepare(
                    "SELECT DISTINCT name FROM sources WHERE is_active = 1 AND name IS NOT NULL AND name != '' ORDER BY name"
                ).all()
            ]);
            return {
                categories: catRows.results || [],
                sources: (sourceRows.results || []).map(r => r.name)
            };
        } catch (e) {
            console.warn('[db] getCategoryStats 失败:', e.message);
            return { categories: [], sources: [] };
        }
    }

    // ========== 评论相关 ==========
    async findCommentsByPostId(postId) {
        const { results } = await this.db.prepare(
            "SELECT id, post_id, user_id, username, content, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC"
        ).bind(postId).all();
        return results || [];
    }

    async findCommentById(id) {
        return await this.db.prepare("SELECT * FROM comments WHERE id = ?").bind(id).first();
    }

    async createComment(postId, userId, username, content) {
        const result = await this.db.prepare(
            "INSERT INTO comments (post_id, user_id, username, content) VALUES (?, ?, ?, ?)"
        ).bind(postId, userId, username, content).run();
        return result.meta?.last_row_id || null;
    }

    async deleteComment(id) {
        return await this.db.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
    }

    async getPostCommentCount(postId) {
        const row = await this.db.prepare(
            "SELECT COUNT(*) as count FROM comments WHERE post_id = ?"
        ).bind(postId).first();
        return row ? row.count : 0;
    }

    // ========== 用户相关 ==========
    async findUserByName(identifier) {
        // 支持用户名或邮箱查找（用于登录）
        return await this.db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").bind(identifier, identifier).first();
    }

    async findUserByUsername(username) {
        return await this.db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    }

    async findUserByEmail(email) {
        return await this.db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    }

    async findUserByPhone(phone) {
        if (!phone) return null;
        return await this.db.prepare("SELECT * FROM users WHERE phone = ?").bind(phone).first();
    }

    async findUserById(id) {
        return await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
    }

    async findAllUsers() {
        // 显式捕获可能因列不存在导致的错误
        try {
            const { results } = await this.db.prepare("SELECT id, username, email, phone, role, created_at FROM users").all();
            return results;
        } catch (e) {
            // 降级：如果 email/phone 不存在，返回基本信息
            const { results } = await this.db.prepare("SELECT id, username, role, created_at FROM users").all();
            return results.map(u => ({ ...u, email: null, phone: null }));
        }
    }

    async getUserCount() {
        return await this.db.prepare("SELECT count(*) as count FROM users").first("count");
    }

    async createUser(username, email, phone, hash, role = 'user') {
        return await this.db.prepare(
            "INSERT INTO users (username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)"
        ).bind(username, email, phone, hash, role).run();
    }

    async updateUser(id, username, email, phone) {
        return await this.db.prepare(
            "UPDATE users SET username = ?, email = ?, phone = ? WHERE id = ?"
        ).bind(username, email, phone, id).run();
    }

    async updateUserAdmin(id, username, email, phone, role) {
        return await this.db.prepare(
            "UPDATE users SET username = ?, email = ?, phone = ?, role = ? WHERE id = ?"
        ).bind(username, email, phone, role, id).run();
    }

    async deleteUser(id) {
        return await this.db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    }

    async updatePassword(userId, newHash) {
        return await this.db.prepare(
            "UPDATE users SET password_hash = ? WHERE id = ?"
        ).bind(newHash, userId).run();
    }

    // 获取用户当前 token 版本（用于校验令牌是否有效）
    async getTokenVersion(userId) {
        try {
            const row = await this.db.prepare(
                "SELECT token_version FROM users WHERE id = ?"
            ).bind(userId).first('token_version');
            return row ?? 1;
        } catch (e) {
            // token_version 列尚不存在（旧部署迁移中）：降级为不校验
            return 1;
        }
    }

    // 使该用户所有已签发令牌失效（修改密码/改邮箱等敏感操作时调用）
    async bumpTokenVersion(userId) {
        return await this.db.prepare(
            "UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?"
        ).bind(userId).run();
    }

    // ========== 源管理 ==========
    async findSourceById(id) {
        return await this.db.prepare("SELECT * FROM sources WHERE id = ?").bind(id).first();
    }

    async findAllSources() {
        const { results } = await this.db.prepare(
            "SELECT * FROM sources ORDER BY sort_order ASC, id ASC"
        ).all();
        return results || [];
    }

    async findActiveSources() {
        const { results } = await this.db.prepare(
            "SELECT * FROM sources WHERE is_active = 1 ORDER BY sort_order ASC, id ASC"
        ).all();
        return results || [];
    }

    async createSource({ url, name, category, hotScore, lang, description, urlBackup, isActive, sortOrder }) {
        const result = await this.db.prepare(
            `INSERT INTO sources (url, name, category, hot_score, lang, description, url_backup, is_active, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(url, name, category || 'general', hotScore || 60, lang || 'zh', description || '',
               JSON.stringify(urlBackup || []), isActive !== undefined ? isActive : 1, sortOrder || 0).run();
        return result.meta?.last_row_id || null;
    }

    async updateSource(id, { url, name, category, hotScore, lang, description, urlBackup, isActive, sortOrder }) {
        return await this.db.prepare(
            `UPDATE sources SET url = ?, name = ?, category = ?, hot_score = ?, lang = ?, description = ?,
             url_backup = ?, is_active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(url, name, category, hotScore, lang, description,
               JSON.stringify(urlBackup || []), isActive !== undefined ? isActive : 1, sortOrder || 0, id).run();
    }

    async toggleSourceActive(id, isActive) {
        return await this.db.prepare(
            "UPDATE sources SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(isActive, id).run();
    }

    async deleteSource(id) {
        return await this.db.prepare("DELETE FROM sources WHERE id = ?").bind(id).run();
    }

    async getSourceCount() {
        const row = await this.db.prepare("SELECT COUNT(*) as count FROM sources").first();
        return row ? row.count : 0;
    }

    async seedDefaultSources(feeds) {
        const stmt = this.db.prepare(
            `INSERT OR IGNORE INTO sources (url, name, category, hot_score, lang, description, url_backup, is_active, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
        );
        // D1 批量写入需要逐个执行
        const batch = [];
        let sortOrder = 0;
        for (const feed of feeds) {
            const urlBackup = feed.urlBackup || [];
            // 去重：sources.url 已设 UNIQUE 约束，INSERT OR IGNORE 会跳过已存在的源
            batch.push(stmt.bind(
                feed.url, feed.name, feed.category, feed.hotScore || 60,
                feed.lang || 'zh', feed.desc || '', JSON.stringify(urlBackup), sortOrder++
            ));
        }
        for (const b of batch) {
            try { await b.run(); } catch (e) {
                // 仅忽略 UNIQUE 约束冲突（重复源），其他错误抛出
                if (!e.message?.includes('UNIQUE')) throw e
            }
        }
        return batch.length;
    }

    // ========== 阅读历史相关 ==========
    
    async recordReadingHistory(userId, postId) {
        try {
            await this.db.prepare(
                `INSERT INTO reading_history (user_id, post_id, read_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(user_id, post_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP`
            ).bind(userId, postId).run();
            return true;
        } catch (e) {
            return false;
        }
    }

    async getReadingHistory(userId, limit = 20, offset = 0) {
        const { results } = await this.db.prepare(`
            SELECT rh.id, rh.post_id, rh.read_at,
                   n.title, n.category, n.source_name, n.summary
            FROM reading_history rh
            LEFT JOIN notes n ON rh.post_id = n.id
            WHERE rh.user_id = ?
            ORDER BY rh.read_at DESC
            LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all();
        return results || [];
    }

    async getReadingHistoryCount(userId) {
        const row = await this.db.prepare(
            'SELECT COUNT(*) as count FROM reading_history WHERE user_id = ?'
        ).bind(userId).first('count');
        return row ?? 0;
    }

    async clearReadingHistory(userId) {
        return await this.db.prepare(
            'DELETE FROM reading_history WHERE user_id = ?'
        ).bind(userId).run();
    }

    // ========== 用户兴趣/偏好 ==========

    async updateUserInterests(userId, interests) {
        return await this.db.prepare(
            "UPDATE users SET interests = ? WHERE id = ?"
        ).bind(JSON.stringify(interests || []), userId).run();
    }

    async updateUserTheme(userId, theme) {
        const validThemes = ['dark', 'light', 'system'];
        const finalTheme = validThemes.includes(theme) ? theme : 'dark';
        return await this.db.prepare(
            "UPDATE users SET theme = ? WHERE id = ?"
        ).bind(finalTheme, userId).run();
    }
}

// 从 username 提取 NewsBot 源名称
export function extractSourceFromUsername(username) {
    if (username && username.startsWith('NewsBot (')) {
        return username.substring(9, username.length - 1);
    }
    if (username && username.startsWith('热搜Bot (')) {
        return username.substring(6, username.length - 1);
    }
    return null;
}
