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
    const { email, password, phone, username } = await c.req.json()
    if (!email || !password) return c.json({ error: '请填写邮箱和密码' }, 400)

    const db = getDb(c)
    // 检查邮箱或用户名是否被占用
    const existing = await db.findUserByName(email)
    if (existing) return c.json({ error: '该账号已被注册' }, 409)

    // 用户名默认使用邮箱（去重）或者用户提供的用户名
    const finalUsername = username || email.split('@')[0]
    // 再次检查用户名
    const existingName = await db.findUserByName(finalUsername)
    if (existingName && existingName.email !== email) return c.json({ error: '用户名已被占用' }, 409)

    const hash = await hashPassword(password)
    const userCount = await db.getUserCount()
    const role = userCount === 0 ? 'admin' : 'user'
    await db.createUser(finalUsername, email, phone || '', hash, role)
    return c.json({ success: true }, 201)
})

// 登录 (支持用户名或邮箱)
auth.post('/login', async (c) => {
    const { username, password } = await c.req.json()
    const db = getDb(c)

    const hash = await hashPassword(password)
    const user = await db.findUserByName(username) // findUserByName 已更新支持 email 查找

    if (!user || user.password_hash !== hash) {
        return c.json({ error: '账号或密码错误' }, 401)
    }

    const token = crypto.randomUUID()
    const userData = { id: user.id, username: user.username, email: user.email, phone: user.phone, role: user.role }
    await c.env.suyuankv.put(token, JSON.stringify(userData), { expirationTtl: 86400 })

    return c.json({ token, ...userData })
})

// 获取当前用户信息
auth.get('/me', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '未登录' }, 401)
    // 刷新一下最新的数据 (从 DB)
    const db = getDb(c)
    const freshUser = await db.findUserById(user.id)
    if (!freshUser) return c.json({ error: '用户不存在' }, 401)

    // 不返回 hash
    const { password_hash, ...safeUser } = freshUser
    return c.json(safeUser)
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

    const { username, password, email, phone, role } = await c.req.json()
    if (!username || !password || !email) return c.json({ error: '请填写必要字段 (用户名, 密码, 邮箱)' }, 400)

    const db = getDb(c)
    const existing = await db.findUserByName(email)
    if (existing) return c.json({ error: '该账号/邮箱已被占用' }, 409)

    const hash = await hashPassword(password)
    await db.createUser(username, email, phone || '', hash, role === 'admin' ? 'admin' : 'user')
    return c.json({ success: true }, 201)
})

export default auth
