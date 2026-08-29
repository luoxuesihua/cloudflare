import { Hono } from 'hono'
import { Database } from '../db.js'
import { generateCode, sendVerificationCode } from '../email.js'
import { withCache, CACHE_TTL } from '../cache.js'
import { getUser, issueToken } from '../session.js'

const auth = new Hono()

function getDb(c) {
    return new Database(c.env)
}

// PBKDF2 密码哈希（100000 次迭代，256 位输出，带随机盐）
async function hashPassword(password) {
    const encoder = new TextEncoder()
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    )
    const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    )
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
    const hashHex = Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('')
    return `pbkdf2:${saltHex}:${hashHex}`
}

// 兼容旧版 SHA-256（纯哈希，无盐）
async function legacySHA256(password) {
    const msg = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msg);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// 密码验证：自动检测格式，兼容旧版 SHA-256
async function verifyPassword(password, storedHash) {
    if (!storedHash) return false
    // PBKDF2 格式：pbkdf2:saltHex:hashHex
    if (storedHash.startsWith('pbkdf2:')) {
        const [, saltHex, hashHex] = storedHash.split(':')
        const encoder = new TextEncoder()
        const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)))
        const keyMaterial = await crypto.subtle.importKey(
            'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
        )
        const derived = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial, 256
        )
        const newHashHex = Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('')
        return newHashHex === hashHex
    }
    // 兼容旧版纯 SHA-256
    return await legacySHA256(password) === storedHash
}

// 判断是否为旧版 SHA-256 格式（需要升级）
function isLegacyHash(storedHash) {
    return storedHash && !storedHash.startsWith('pbkdf2:')
}

// 密码复杂度校验：至少8位，包含大小写字母和数字
function validatePassword(password) {
    if (password.length < 8) return '密码长度至少 8 位'
    if (!/[a-z]/.test(password)) return '密码需包含小写字母'
    if (!/[A-Z]/.test(password)) return '密码需包含大写字母'
    if (!/[0-9]/.test(password)) return '密码需包含数字'
    return null
}

// 校验验证码并防暴破（失败 5 次作废）。namespace 区分注册/登录，避免互相覆盖
async function verifyCode(c, namespace, email, code) {
    const failKey = `code_fail:${namespace}:${email}`;
    const failCount = parseInt(await c.env.suyuankv.get(failKey) || '0', 10);
    if (failCount >= 5) {
        await c.env.suyuankv.delete(`code:${namespace}:${email}`);
        await c.env.suyuankv.delete(failKey);
        return { ok: false, error: '验证码尝试次数过多，请重新获取', status: 429 };
    }
    const storedCode = await c.env.suyuankv.get(`code:${namespace}:${email}`);
    if (!storedCode || storedCode !== code) {
        await c.env.suyuankv.put(failKey, String(failCount + 1), { expirationTtl: 300 });
        return { ok: false, error: '验证码错误或已过期', status: 400 };
    }
    return { ok: true };
}

// ========== 验证码相关 ==========

// 发送验证码（通用：注册/登录共用）
auth.post('/send-code', async (c) => {
    const { email, type } = await c.req.json()
    const cleanEmail = email ? email.trim().toLowerCase() : ''
    if (!cleanEmail) return c.json({ error: '请填写邮箱' }, 400)

    // type: 'register' | 'login'
    const db = getDb(c)
    const existingUser = await db.findUserByEmail(cleanEmail)

    if (type === 'register' && existingUser) {
        return c.json({ error: '该邮箱已被注册' }, 409)
    }
    if (type === 'login' && !existingUser) {
        return c.json({ error: '该邮箱未注册' }, 404)
    }

    // 防止频繁发送：检查是否 60 秒内已发送
    const rateLimitKey = `code_rate:${type}:${cleanEmail}`
    const lastSent = await c.env.suyuankv.get(rateLimitKey)
    if (lastSent) {
        return c.json({ error: '请求过于频繁，请稍后再试' }, 429)
    }

    const code = generateCode()

    try {
        await sendVerificationCode(c.env, cleanEmail, code)
    } catch (e) {
        return c.json({ error: '验证码发送失败，请稍后重试' }, 500)
    }

    // 存储验证码到 KV，5 分钟过期（按 type 命名空间隔离注册/登录）
    await c.env.suyuankv.put(`code:${type}:${cleanEmail}`, code, { expirationTtl: 300 })
    // 重置失败计数（防止暴力破解）
    await c.env.suyuankv.put(`code_fail:${type}:${cleanEmail}`, '0', { expirationTtl: 300 })
    // 频率限制标记，60 秒过期
    await c.env.suyuankv.put(rateLimitKey, '1', { expirationTtl: 60 })

    return c.json({ success: true, message: '验证码已发送' })
})

// ========== 注册（需验证码）==========
auth.post('/register', async (c) => {
    const { email, password, phone, username, code } = await c.req.json()
    const cleanEmail = email ? email.trim().toLowerCase() : ''
    const cleanPhone = phone ? phone.trim() : ''
    const cleanUsername = username ? username.trim() : ''

    if (!cleanEmail || !password || !code) return c.json({ error: '请填写邮箱、密码和验证码' }, 400)

    // 密码复杂度校验
    const pwdError = validatePassword(password)
    if (pwdError) return c.json({ error: pwdError }, 400)

    // 校验验证码（含防暴破：失败 5 次即作废，需重新获取）
    const v = await verifyCode(c, 'register', cleanEmail, code)
    if (!v.ok) return c.json({ error: v.error }, v.status)

    const db = getDb(c)

    // 检查邮箱唯一性
    const existingEmail = await db.findUserByEmail(cleanEmail)
    if (existingEmail) return c.json({ error: '该邮箱已被注册' }, 409)

    // 用户名默认使用邮箱前缀
    const finalUsername = cleanUsername || cleanEmail.split('@')[0]
    // 检查用户名唯一性
    const existingName = await db.findUserByUsername(finalUsername)
    if (existingName) return c.json({ error: '用户名已被占用' }, 409)

    // 检查手机号唯一性
    if (cleanPhone) {
        const existingPhone = await db.findUserByPhone(cleanPhone)
        if (existingPhone) return c.json({ error: '该手机号已被注册' }, 409)
    }

    const hash = await hashPassword(password)
    const userCount = await db.getUserCount()
    const role = userCount === 0 ? 'admin' : 'user'
    await db.createUser(finalUsername, cleanEmail, cleanPhone, hash, role)

    // 验证码用完即删
    await c.env.suyuankv.delete(`code:register:${cleanEmail}`)

    const newUser = await db.findUserByEmail(cleanEmail)
    const { token, userData } = await issueToken(c, newUser)
    return c.json({ token, ...userData }, 201)
})

// ========== 密码登录 ==========
auth.post('/login', async (c) => {
    const { username, password } = await c.req.json()
    const cleanAccount = username ? username.trim() : ''
    const db = getDb(c)

    const user = await db.findUserByName(cleanAccount)

    if (!user || !await verifyPassword(password, user.password_hash)) {
        return c.json({ error: '账号或密码错误' }, 401)
    }

    // 旧版 SHA-256 密码自动升级为 PBKDF2
    if (isLegacyHash(user.password_hash)) {
        const newHash = await hashPassword(password)
        await db.updatePassword(user.id, newHash)
    }

    const tokenInfo = await issueToken(c, user)
    return c.json({ token: tokenInfo.token, ...tokenInfo.userData })
})

// ========== 验证码登录 ==========
auth.post('/login-code', async (c) => {
    const { email, code } = await c.req.json()
    const cleanEmail = email ? email.trim().toLowerCase() : ''
    if (!cleanEmail || !code) return c.json({ error: '请填写邮箱和验证码' }, 400)

    // 校验验证码（含防暴破：失败 5 次即作废，需重新获取）
    const v = await verifyCode(c, 'login', cleanEmail, code)
    if (!v.ok) return c.json({ error: v.error }, v.status)

    const db = getDb(c)
    const user = await db.findUserByEmail(cleanEmail)
    if (!user) return c.json({ error: '用户不存在' }, 404)

    const tokenInfo = await issueToken(c, user)

    // 验证码用完即删
    await c.env.suyuankv.delete(`code:login:${cleanEmail}`)

    return c.json({ token: tokenInfo.token, ...tokenInfo.userData })
})

// ========== 登出销毁令牌 ==========
auth.post('/logout', async (c) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    if (token) {
        await c.env.suyuankv.delete(token)
        await c.env.suyuankv.delete(`csrf:${token}`)
    }
    return c.json({ success: true, message: '已安全登出' })
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

    // 邮箱/用户名变更：提升 token 版本，使旧令牌失效，重新签发
    const db2 = getDb(c)
    await db2.bumpTokenVersion(user.id)
    const tokenInfo = await issueToken(c, { id: user.id, username, email, phone, role: user.role })

    return c.json({ success: true, token: tokenInfo.token, user: tokenInfo.userData })
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

    if (!await verifyPassword(oldPassword, fullUser.password_hash)) {
        return c.json({ error: '原密码不正确' }, 400)
    }

    const newHash = await hashPassword(newPassword)
    await db.updatePassword(user.id, newHash)
    // 修改密码：使该用户所有已签发令牌失效
    await db.bumpTokenVersion(user.id)
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

// ========== 用户偏好设置 ==========

// 获取可用分类列表（用于兴趣标签选择）— 缓存 10 分钟，纯静态数据
auth.get('/categories', withCache(CACHE_TTL.CATEGORIES, async (c) => {
    // 无需登录，公开接口
    return c.json([
        { id: 'general', name: '综合资讯', icon: 'globe' },
        { id: 'ai', name: 'AI 前沿', icon: 'cpu' },
        { id: 'dev', name: '编程开发', icon: 'code' },
        { id: 'ops', name: '运维架构', icon: 'server' },
        { id: 'product', name: '产品设计', icon: 'layout' },
        { id: 'biz', name: '财经商业', icon: 'trending-up' }
    ])
}))

// 更新用户兴趣标签
auth.put('/interests', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '未登录' }, 401)

    const { interests } = await c.req.json()
    
    // 验证 interests 格式：必须是字符串数组，且值合法
    const validCategories = ['general', 'ai', 'dev', 'ops', 'product', 'biz']
    let finalInterests = []
    
    if (Array.isArray(interests)) {
        finalInterests = interests.filter(i => 
            typeof i === 'string' && validCategories.includes(i.trim())
        ).map(i => i.trim())
    }

    const db = getDb(c)
    await db.updateUserInterests(user.id, finalInterests)

    // 更新 token 中的用户信息
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    if (token) {
        const userData = { ...user, interests: finalInterests }
        await c.env.suyuankv.put(token, JSON.stringify(userData), { expirationTtl: 86400 })
    }

    return c.json({ success: true, interests: finalInterests })
})

// 更新用户主题偏好
auth.put('/theme', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '未登录' }, 401)

    const { theme } = await c.req.json()
    
    const db = getDb(c)
    await db.updateUserTheme(user.id, theme)

    return c.json({ success: true, theme })
})

export default auth
