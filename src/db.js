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

        // 尝试添加新字段（用于兼容旧表结构）
        try {
            // 注意：SQLite ALTER TABLE 添加 UNIQUE 列可能因现有数据（虽为空）或特定驱动限制而失败
            // 这里只添加列，唯一性由应用层逻辑保证
            await this.db.prepare("ALTER TABLE users ADD COLUMN email TEXT").run();
        } catch (e) { }
        try {
            await this.db.prepare("ALTER TABLE users ADD COLUMN phone TEXT").run();
        } catch (e) { }
    }

    // ========== 文章相关 ==========
    async findAllPosts(tag = null) {
        const query = "SELECT id, title, username, tags, created_at FROM notes ORDER BY created_at DESC";
        const { results } = await this.db.prepare(query).all();
        if (tag) {
            return results.filter(n => (n.tags || '').split(',').map(t => t.trim()).includes(tag));
        }
        return results;
    }

    async findPostById(id) {
        return await this.db.prepare("SELECT * FROM notes WHERE id = ?").bind(id).first();
    }

    async createPost(userId, username, title, content, tags) {
        return await this.db.prepare(
            "INSERT INTO notes (user_id, username, title, content, tags) VALUES (?, ?, ?, ?, ?)"
        ).bind(userId, username, title, content, tags).run();
    }

    async deletePost(id) {
        return await this.db.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
    }

    // ========== 用户相关 ==========
    async findUserByName(identifier) {
        // 支持用户名或邮箱查找
        return await this.db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").bind(identifier, identifier).first();
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

    async updatePassword(userId, newHash) {
        return await this.db.prepare(
            "UPDATE users SET password_hash = ? WHERE id = ?"
        ).bind(newHash, userId).run();
    }
}
