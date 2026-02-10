import { Hono } from 'hono'
import { Database } from '../db.js'

const auth = new Hono()

function getDb(c) {
    return new Database(c.env)
}

async function hashPassword(password) {
    const msg = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msg);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getUser(c) {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const userStr = await c.env.suyuankv.get(token);
    return userStr ? JSON.parse(userStr) : null;
}

// 注册
auth.post('/register', async (c) => {
    const { username, password } = await c.req.json()
    if (!username || !password) return c.json({ error: '请填写所有字段' }, 400)

    const db = getDb(c)
    const existing = await db.findUserByName(username)
    if (existing) return c.json({ error: '用户名已被占用' }, 409)

    const hash = await hashPassword(password)
    const userCount = await db.getUserCount()
    const role = userCount === 0 ? 'admin' : 'user'
    await db.createUser(username, hash, role)
    return c.json({ success: true }, 201)
})

// 登录
auth.post('/login', async (c) => {
    const { username, password } = await c.req.json()
    const db = getDb(c)

    const hash = await hashPassword(password)
    const user = await db.findUserByName(username)

    if (!user || user.password_hash !== hash) {
        return c.json({ error: '用户名或密码错误' }, 401)
    }

    const token = crypto.randomUUID()
    const userData = { id: user.id, username: user.username, role: user.role }
    await c.env.suyuankv.put(token, JSON.stringify(userData), { expirationTtl: 86400 })

    return c.json({ token, ...userData })
})

// 获取当前用户信息
auth.get('/me', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '未登录' }, 401)
    return c.json(user)
})

// 修改密码
auth.post('/password', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '未登录' }, 401)

    const { oldPassword, newPassword } = await c.req.json()
    if (!oldPassword || !newPassword) return c.json({ error: '请填写所有字段' }, 400)

    const db = getDb(c)
    const fullUser = await db.findUserById(user.id)
    const currentHash = await hashPassword(oldPassword)

    if (fullUser.password_hash !== currentHash) {
        return c.json({ error: '原密码不正确' }, 400)
    }

    const newHash = await hashPassword(newPassword)
    await db.updatePassword(user.id, newHash)
    return c.json({ success: true })
})

// 管理员：获取用户列表
auth.get('/users', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const db = getDb(c)
    const users = await db.findAllUsers()
    return c.json(users)
})

// 管理员：添加用户
auth.post('/users/add', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const { username, password, role } = await c.req.json()
    if (!username || !password) return c.json({ error: '请填写所有字段' }, 400)

    const db = getDb(c)
    const existing = await db.findUserByName(username)
    if (existing) return c.json({ error: '用户名已被占用' }, 409)

    const hash = await hashPassword(password)
    await db.createUser(username, hash, role === 'admin' ? 'admin' : 'user')
    return c.json({ success: true }, 201)
})

export default auth
