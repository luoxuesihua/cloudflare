import { Hono } from 'hono'
import { Database } from '../db.js'
import { generateCode, sendVerificationCode } from '../email.js'

const auth = new Hono()

function getDb(c) {
    return new Database(c.env)
}

async function hashPassword(password) {
    const msg = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msg);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// 密码复杂度校验：至少8位，包含大小写字母和数字
function validatePassword(password) {
    if (password.length < 8) return '密码长度至少 8 位'
    if (!/[a-z]/.test(password)) return '密码需包含小写字母'
    if (!/[A-Z]/.test(password)) return '密码需包含大写字母'
    if (!/[0-9]/.test(password)) return '密码需包含数字'
    return null
}

async function getUser(c) {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const userStr = await c.env.suyuankv.get(token);
    return userStr ? JSON.parse(userStr) : null;
}

// ========== 验证码相关 ==========

// 发送验证码（通用：注册/登录共用）
auth.post('/send-code', async (c) => {
    const { email, type } = await c.req.json()
    if (!email) return c.json({ error: '请填写邮箱' }, 400)

    // type: 'register' | 'login'
    const db = getDb(c)
    const existingUser = await db.findUserByEmail(email)

    if (type === 'register' && existingUser) {
        return c.json({ error: '该邮箱已被注册' }, 409)
    }
    if (type === 'login' && !existingUser) {
        return c.json({ error: '该邮箱未注册' }, 404)
    }

    // 防止频繁发送：检查是否 60 秒内已发送
    const rateLimitKey = `code_rate:${email}`
    const lastSent = await c.env.suyuankv.get(rateLimitKey)
    if (lastSent) {
        return c.json({ error: '请求过于频繁，请稍后再试' }, 429)
    }

    const code = generateCode()

    try {
        await sendVerificationCode(c.env, email, code)
    } catch (e) {
        return c.json({ error: '验证码发送失败，请稍后重试' }, 500)
    }

    // 存储验证码到 KV，5 分钟过期
    await c.env.suyuankv.put(`code:${email}`, code, { expirationTtl: 300 })
    // 频率限制标记，60 秒过期
    await c.env.suyuankv.put(rateLimitKey, '1', { expirationTtl: 60 })

    return c.json({ success: true, message: '验证码已发送' })
})

// ========== 注册（需验证码）==========
auth.post('/register', async (c) => {
    const { email, password, phone, username, code } = await c.req.json()
    if (!email || !password || !code) return c.json({ error: '请填写邮箱、密码和验证码' }, 400)

    // 密码复杂度校验
    const pwdError = validatePassword(password)
    if (pwdError) return c.json({ error: pwdError }, 400)

    // 校验验证码
    const storedCode = await c.env.suyuankv.get(`code:${email}`)
    if (!storedCode || storedCode !== code) {
        return c.json({ error: '验证码错误或已过期' }, 400)
    }

    const db = getDb(c)

    // 检查邮箱唯一性
    const existingEmail = await db.findUserByEmail(email)
    if (existingEmail) return c.json({ error: '该邮箱已被注册' }, 409)

    // 用户名默认使用邮箱前缀
    const finalUsername = username || email.split('@')[0]
    // 检查用户名唯一性
    const existingName = await db.findUserByUsername(finalUsername)
    if (existingName) return c.json({ error: '用户名已被占用' }, 409)

    // 检查手机号唯一性
    if (phone) {
        const existingPhone = await db.findUserByPhone(phone)
        if (existingPhone) return c.json({ error: '该手机号已被注册' }, 409)
    }

    const hash = await hashPassword(password)
    const userCount = await db.getUserCount()
    const role = userCount === 0 ? 'admin' : 'user'
    await db.createUser(finalUsername, email, phone || '', hash, role)

    // 验证码用完即删
    await c.env.suyuankv.delete(`code:${email}`)

    return c.json({ success: true }, 201)
})

// ========== 密码登录 ==========
auth.post('/login', async (c) => {
    const { username, password } = await c.req.json()
    const db = getDb(c)

    const hash = await hashPassword(password)
    const user = await db.findUserByName(username)

    if (!user || user.password_hash !== hash) {
        return c.json({ error: '账号或密码错误' }, 401)
    }

    const token = crypto.randomUUID()
    const userData = { id: user.id, username: user.username, email: user.email, phone: user.phone, role: user.role }
    await c.env.suyuankv.put(token, JSON.stringify(userData), { expirationTtl: 86400 })

    return c.json({ token, ...userData })
})

// ========== 验证码登录 ==========
auth.post('/login-code', async (c) => {
    const { email, code } = await c.req.json()
    if (!email || !code) return c.json({ error: '请填写邮箱和验证码' }, 400)

    // 校验验证码
    const storedCode = await c.env.suyuankv.get(`code:${email}`)
    if (!storedCode || storedCode !== code) {
        return c.json({ error: '验证码错误或已过期' }, 400)
    }

    const db = getDb(c)
    const user = await db.findUserByEmail(email)
    if (!user) return c.json({ error: '用户不存在' }, 404)

    const token = crypto.randomUUID()
    const userData = { id: user.id, username: user.username, email: user.email, phone: user.phone, role: user.role }
    await c.env.suyuankv.put(token, JSON.stringify(userData), { expirationTtl: 86400 })

    // 验证码用完即删
    await c.env.suyuankv.delete(`code:${email}`)

    return c.json({ token, ...userData })
})

// ========== 用户信息 ==========
auth.get('/me', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '未登录' }, 401)
    const db = getDb(c)
    const freshUser = await db.findUserById(user.id)
    if (!freshUser) return c.json({ error: '用户不存在' }, 401)

    const { password_hash, ...safeUser } = freshUser
    return c.json(safeUser)
})

auth.put('/me', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '未登录' }, 401)

    const { username, email, phone } = await c.req.json()
    if (!username || !email) return c.json({ error: '用户名和邮箱不能为空' }, 400)

    const db = getDb(c)

    const existingName = await db.findUserByUsername(username)
    if (existingName && existingName.id !== user.id) return c.json({ error: '用户名已被占用' }, 409)

    const existingEmail = await db.findUserByEmail(email)
    if (existingEmail && existingEmail.id !== user.id) return c.json({ error: '邮箱已被占用' }, 409)

    if (phone) {
        const existingPhone = await db.findUserByPhone(phone)
        if (existingPhone && existingPhone.id !== user.id) return c.json({ error: '手机号已被占用' }, 409)
    }

    await db.updateUser(user.id, username, email, phone || '')

    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    if (token) {
        const userData = { id: user.id, username, email, phone, role: user.role }
        await c.env.suyuankv.put(token, JSON.stringify(userData), { expirationTtl: 86400 })
    }

    return c.json({ success: true, user: { id: user.id, username, email, phone, role: user.role } })
})

// ========== 修改密码 ==========
auth.post('/password', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '未登录' }, 401)

    const { oldPassword, newPassword } = await c.req.json()
    if (!oldPassword || !newPassword) return c.json({ error: '请填写所有字段' }, 400)

    // 密码复杂度校验
    const pwdError = validatePassword(newPassword)
    if (pwdError) return c.json({ error: pwdError }, 400)

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

// ========== 管理员接口 ==========
auth.get('/users', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const db = getDb(c)
    const users = await db.findAllUsers()
    return c.json(users)
})

auth.post('/users/add', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const { username, password, email, phone, role } = await c.req.json()
    if (!username || !password || !email) return c.json({ error: '请填写必要字段 (用户名, 密码, 邮箱)' }, 400)

    // 密码复杂度校验
    const pwdError = validatePassword(password)
    if (pwdError) return c.json({ error: pwdError }, 400)

    const db = getDb(c)

    const existingName = await db.findUserByUsername(username)
    if (existingName) return c.json({ error: '用户名已被占用' }, 409)

    const existingEmail = await db.findUserByEmail(email)
    if (existingEmail) return c.json({ error: '邮箱已被占用' }, 409)

    if (phone) {
        const existingPhone = await db.findUserByPhone(phone)
        if (existingPhone) return c.json({ error: '手机号已被占用' }, 409)
    }

    const hash = await hashPassword(password)
    await db.createUser(username, email, phone || '', hash, role === 'admin' ? 'admin' : 'user')
    return c.json({ success: true }, 201)
})

// 管理员：编辑用户
auth.put('/users/:id', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const targetId = parseInt(c.req.param('id'))
    const { username, email, phone, role } = await c.req.json()
    if (!username || !email) return c.json({ error: '用户名和邮箱不能为空' }, 400)

    const db = getDb(c)

    const existingName = await db.findUserByUsername(username)
    if (existingName && existingName.id !== targetId) return c.json({ error: '用户名已被占用' }, 409)

    const existingEmail = await db.findUserByEmail(email)
    if (existingEmail && existingEmail.id !== targetId) return c.json({ error: '邮箱已被占用' }, 409)

    if (phone) {
        const existingPhone = await db.findUserByPhone(phone)
        if (existingPhone && existingPhone.id !== targetId) return c.json({ error: '手机号已被占用' }, 409)
    }

    await db.updateUserAdmin(targetId, username, email, phone || '', role || 'user')
    return c.json({ success: true })
})

// 管理员：删除用户
auth.delete('/users/:id', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const targetId = parseInt(c.req.param('id'))
    // 不允许删除自己
    if (targetId === user.id) return c.json({ error: '不能删除自己' }, 400)

    const db = getDb(c)
    await db.deleteUser(targetId)
    return c.json({ success: true })
})

export default auth
