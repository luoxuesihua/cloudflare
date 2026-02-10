
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
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

        // Comments table (New for Rin parity)
        await this.db.prepare(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    }

    async findAllPosts(tag = null) {
        let query = "SELECT * FROM notes ORDER BY created_at DESC";
        if (tag) {
            // Simple tag filtering (could be improved)
            const { results } = await this.db.prepare(query).all();
            return results.filter(n => (n.tags || '').includes(tag));
        }
        const { results } = await this.db.prepare(query).all();
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

    async findUserByName(username) {
        return await this.db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    }

    async createUser(username, hash, role = 'user') {
        return await this.db.prepare(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
        ).bind(username, hash, role).run();
    }
}
