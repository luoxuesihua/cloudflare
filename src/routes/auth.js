
import { Hono } from 'hono'
import { Database } from '../db'

const auth = new Hono()

function getDb(c) {
    return new Database(c.env)
}

async function hashPassword(password) {
    const msg = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msg);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

auth.post('/register', async (c) => {
    const { username, password } = await c.req.json()
    if (!username || !password) return c.json({ error: 'Missing fields' }, 400)

    const db = getDb(c)
    try {
        const hash = await hashPassword(password)
        // Check if first user -> admin
        // Note: This logic is simplified; real app might want better role management
        await db.createUser(username, hash, 'user')
        return c.json({ success: true }, 201)
    } catch (e) {
        return c.json({ error: 'Username likely taken' }, 409)
    }
})

auth.post('/login', async (c) => {
    const { username, password } = await c.req.json()
    const db = getDb(c)

    const hash = await hashPassword(password)
    const user = await db.findUserByName(username)

    if (!user || user.password_hash !== hash) {
        return c.json({ error: 'Invalid credentials' }, 401)
    }

    const token = crypto.randomUUID()
    // Store token in KV
    await c.env.suyuankv.put(token, JSON.stringify(user), { expirationTtl: 86400 })

    return c.json({ token, role: user.role })
})

export default auth
