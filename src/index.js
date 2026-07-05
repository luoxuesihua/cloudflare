




import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from './routes/auth'
import posts from './routes/posts'
import sources from './routes/sources'
import { Database } from './db'
import { collectNews, collectHotSearch } from './services/collector.js'
import { asyncAISummarize } from './services/summarizer.js'


const app = new Hono()

// Rate Limit 中间件：基于 KV 的滑动窗口限流（简化计数器，减少竞态窗口）
async function rateLimit(c, next) {
    const path = new URL(c.req.url).pathname
    // 仅对敏感接口限流
    const rateLimitedPaths = ['/api/auth/send-code', '/api/auth/login', '/api/auth/login-code', '/api/auth/register']
    if (!rateLimitedPaths.some(p => path.endsWith(p))) {
        return await next()
    }

    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const key = `rate_limit:${path}:${ip}`
    const maxReq = path.includes('send-code') ? 1 : 5  // 发送验证码 1 次/分钟，登录 5 次/分钟

    const record = await c.env.suyuankv.get(key)
    const count = record ? parseInt(record, 10) : 0

    if (count >= maxReq) {
        c.header('Retry-After', '60')
        return c.json({ error: '请求过于频繁，请稍后再试', retry_after: 60 }, 429)
    }

    // 计数器 + 60s TTL 作为滑动窗口（读-写之间存在极小竞态窗口，最多多放行 1 个请求）
    await c.env.suyuankv.put(key, String(count + 1), { expirationTtl: 60 })

    return await next()
}

// ========== CSRF 保护中间件 ==========
// 对所有非 GET/HEAD/OPTIONS 的写操作请求进行 CSRF 验证
async function csrfProtection(c, next) {
    const method = c.req.method.toUpperCase()
    
    // 只对会改变状态的请求进行验证
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        return await next()
    }

    // 跳过 API 前缀的路径检查（只保护 /api 路径）
    const path = new URL(c.req.url).pathname
    if (!path.startsWith('/api/')) {
        return await next()
    }

    // 从 Header 获取 CSRF Token
    const csrfToken = c.req.header('X-CSRF-Token')
    if (!csrfToken) {
        return c.json({ error: '缺少 CSRF Token，请刷新页面重试' }, 403)
    }

    // 从 Cookie 或 Session 获取存储的 token 进行比对
    const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!sessionId) {
        // 未登录状态下的请求也需要验证（如注册、登录）
        // 使用 IP + User-Agent 作为 session 标识符的替代
        const ip = c.req.header('CF-Connecting-IP') || 'unknown'
        const ua = c.req.header('User-Agent') || ''
        const tempKey = `csrf:${Buffer.from(ip + ua.slice(0, 50)).toString('base64').slice(0, 32)}`
        
        const storedToken = await c.env.suyuankv.get(tempKey)
        if (storedToken !== csrfToken) {
            return c.json({ error: 'CSRF 验证失败，请刷新页面重试' }, 403)
        }
        return await next()
    }

    // 已登录用户从 KV 获取 CSRF Token
    const storedCsrf = await c.env.suyuankv.get(`csrf:${sessionId}`)
    if (!storedCsrf || storedCsrf !== csrfToken) {
        return c.json({ error: 'CSRF 验证失败，请重新登录' }, 403)
    }

    return await next()
}

// 生成 CSRF Token 的接口
app.get('/api/csrf-token', async (c) => {
    const token = crypto.randomUUID()
    
    // 尝试从 Authorization 获取 session ID
    const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
    
    if (sessionId) {
        // 已登录用户：将 CSRF Token 与 session 绑定
        await c.env.suyuankv.put(`csrf:${sessionId}`, token, { 
            expirationTtl: 7200 // 2小时有效
        })
    } else {
        // 未登录用户：使用 IP + UA 作为临时标识
        const ip = c.req.header('CF-Connecting-IP') || 'unknown'
        const ua = c.req.header('User-Agent') || ''
        const tempKey = `csrf:${Buffer.from(ip + ua.slice(0, 50)).toString('base64').slice(0, 32)}`
        await c.env.suyuankv.put(tempKey, token, { 
            expirationTtl: 3600 // 1小时有效
        })
    }
    
    return c.json({ csrf_token: token })
})

// Middleware
app.use('/*', cors())
app.use('*', rateLimit)
app.use('*', csrfProtection)  // CSRF 保护
app.use('*', async (c, next) => {
  const db = new Database(c.env)
  await db.init()
  await next()
})

// API 路由
app.route('/api/auth', auth)
app.route('/api/posts', posts)
app.route('/api/sources', sources)

// 所有非 API 请求交给前端静态资源处理 (Vue SPA)
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    // 根据 cron 表达式区分任务类型
    // RSS 新闻采集：每 4 小时
    // 热搜采集：每 30 分钟
    const cron = event.cron || ''

    // AI 摘要回调：采集到新文章后异步生成 AI 摘要
    const onNewPost = (postId, title, content) => {
      if (env.AI) {
        ctx.waitUntil(asyncAISummarize(env, postId, title, content))
      }
    }

    if (cron.includes('*/30')) {
      ctx.waitUntil(collectHotSearch(env, onNewPost))
    } else {
      ctx.waitUntil(collectNews(env, onNewPost))
    }
  }
}

