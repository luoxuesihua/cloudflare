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
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

        // 兼容旧表结构：添加新字段
        const alterCols = [
            "ALTER TABLE notes ADD COLUMN category TEXT DEFAULT 'general'",
            "ALTER TABLE notes ADD COLUMN hot_score INTEGER DEFAULT 50",
            "ALTER TABLE notes ADD COLUMN source_name TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN email TEXT",
            "ALTER TABLE users ADD COLUMN phone TEXT"
        ];
        for (const sql of alterCols) {
            try { await this.db.prepare(sql).run(); } catch (e) { /* 列已存在 */ }
        }
    }

    // ========== 文章相关 ==========
    async findAllPosts(tag = null, category = null, source = null, sortBy = 'created_at', order = 'DESC', limit = 100, offset = 0) {
        let { results } = await this.db.prepare(
            "SELECT id, title, username, tags, category, hot_score, source_name, created_at, SUBSTR(content, 1, 200) AS snippet FROM notes ORDER BY created_at DESC"
        ).all();

        if (tag) {
            results = results.filter(n => (n.tags || '').split(',').map(t => t.trim()).includes(tag));
        }
        if (category) {
            results = results.filter(n => (n.category || 'general') === category);
        }
        if (source) {
            results = results.filter(n => {
                const sn = n.source_name || extractSourceFromUsername(n.username);
                return sn && sn.includes(source);
            });
        }

        // 按热度排序或时间排序
        if (sortBy === 'hot_score') {
            results.sort((a, b) => (b.hot_score || 50) - (a.hot_score || 50));
        }

        const total = results.length;
        const paged = results.slice(offset, offset + limit);

        return { posts: paged, total };
    }

    async findPostById(id) {
        return await this.db.prepare("SELECT * FROM notes WHERE id = ?").bind(id).first();
    }

    async createPost(userId, username, title, content, tags, hotScore = 50, category = 'general', sourceName = '') {
        return await this.db.prepare(
            "INSERT INTO notes (user_id, username, title, content, tags, hot_score, category, source_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(userId, username, title, content, tags, hotScore, category, sourceName).run();
    }

    async deletePost(id) {
        return await this.db.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
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
