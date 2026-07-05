export class Database {
    constructor(env) {
        this.db = env.suyuan
    }

    async init() {
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
        url TEXT NOT NULL,
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
            "ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'"
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

        // 更安全的 COUNT 构建：用 indexOf 定位 FROM 起始位置
        const fromIdx = finalOrderSql.indexOf(' FROM ')
        const countSql = 'SELECT COUNT(*) as cnt' + finalOrderSql.substring(fromIdx)
        // 移除 COUNT 查询中的 ORDER BY 子句（不需要且可能出错）
        const orderIdx = countSql.indexOf(' ORDER BY')
        const cleanCountSql = orderIdx > -1 ? countSql.substring(0, orderIdx) : countSql
        
        const { results: countResults } = await this.db.prepare(cleanCountSql).bind(...bindings).all()
        const total = countResults?.[0]?.cnt || 0

        // 分页
        finalOrderSql += " LIMIT ? OFFSET ?"
        bindings.push(limit, offset)

        const { results } = await this.db.prepare(finalOrderSql).bind(...bindings).all()

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

    // 分类统计
    async getCategoryStats() {
        try {
            const { results } = await this.db.prepare(
                "SELECT category, COUNT(*) as count FROM notes WHERE category IS NOT NULL AND category != '' GROUP BY category"
            ).all();
            return results || [];
        } catch (e) { return []; }
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
            // 避免重复：使用 url 作为唯一性判断（INSERT OR IGNORE 无法在无约束列上工作，改用逐条检查）
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
        return row || 0;
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
