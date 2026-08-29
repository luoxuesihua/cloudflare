/**
 * 统一会话校验：所有路由必须经此获取当前用户，
 * 否则改密码后 bump 的 token_version 无法使旧令牌在该路由上失效。
 */
import { Database } from './db.js'

export async function getUser(c) {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!token) return null

    const userStr = await c.env.suyuankv.get(token)
    if (!userStr) return null

    let user
    try {
        user = JSON.parse(userStr)
    } catch {
        return null
    }

    // 令牌版本校验：修改密码/改邮箱等敏感操作后旧令牌失效
    const currentVersion = await new Database(c.env).getTokenVersion(user.id)
    if (typeof user.tokenVersion === 'number' && user.tokenVersion !== currentVersion) {
        return null
    }
    return user
}

// 签发令牌：写入当前 token_version，使旧令牌在版本变更后失效
export async function issueToken(c, user) {
    const tokenVersion = await new Database(c.env).getTokenVersion(user.id)
    const token = crypto.randomUUID()
    const userData = {
        id: user.id, username: user.username, email: user.email,
        phone: user.phone, role: user.role, tokenVersion
    }
    await c.env.suyuankv.put(token, JSON.stringify(userData), { expirationTtl: 86400 })
    return { token, userData }
}
