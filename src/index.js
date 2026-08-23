




import { Hono } from 'hono'
import auth from './routes/auth'
import posts from './routes/posts'
import sources from './routes/sources'
import { Database } from './db'
import { collectNews, collectHotSearch } from './services/collector.js'
import { asyncAISummarize } from './services/summarizer.js'


const app = new Hono()

const DEFAULT_ALLOWED_ORIGINS = [
    'https://m.suyuank.top',
    'https://suyuank.top',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
]

const API_CORS_METHODS = 'GET,HEAD,POST,PUT,DELETE,OPTIONS'
const API_CORS_HEADERS = 'Authorization,Content-Type,X-CSRF-Token'
const CSP = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self'",
    "connect-src 'self'",
    'upgrade-insecure-requests'
].join('; ')

function allowedOrigins(env) {
    const configured = env?.CORS_ORIGINS
        ?.split(',')
        .map(origin => origin.trim())
        .filter(Boolean)

    return configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS
}

function applySecurityHeaders(headers) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    headers.set('Content-Security-Policy', CSP)
    headers.set('X-Frame-Options', 'DENY')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'same-origin')
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
}

function isAllowedOrigin(c, origin) {
    return origin && allowedOrigins(c.env).includes(origin)
}

function applyApiCors(c) {
    const origin = c.req.header('Origin')

    c.header('Vary', 'Origin')
    if (!isAllowedOrigin(c, origin)) return

    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Methods', API_CORS_METHODS)
    c.header('Access-Control-Allow-Headers', API_CORS_HEADERS)
    c.header('Access-Control-Max-Age', '86400')
}

function isSpaRoute(pathname) {
    return pathname === '/'
        || pathname === '/login'
        || pathname === '/register'
        || pathname === '/write'
        || pathname === '/admin'
        || /^\/post\/[^/]+\/?$/.test(pathname)
}

function isStaticAssetPath(pathname) {
    return pathname.startsWith('/assets/')
        || pathname.startsWith('/.well-known/')
        || pathname === '/robots.txt'
        || pathname === '/security.txt'
        || pathname === '/favicon.svg'
        || /\.[a-z0-9]{1,8}$/i.test(pathname)
}

function notFound() {
    const response = new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
    applySecurityHeaders(response.headers)
    return response
}

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
// 本项目使用 `Authorization: Bearer <token>` 作为鉴权方式（token 存于
// localStorage，而非 Cookie），因此不存在传统的 Cookie-based CSRF 风险。
// 这里额外做一层"同源 + 双重提交"校验作为纵深防御：
//   1. 仅对 /api 下的写请求（非 GET/HEAD/OPTIONS）生效；
//   2. 已登录请求需携带与 KV 中 session 绑定的 X-CSRF-Token；
//   3. 未登录请求（注册/登录）无需 CSRF（无会话凭证可被盗用），直接放行。
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

    // 未登录状态（无 Authorization）的写请求（如 send-code/register/login）
    // 不存在 CSRF 风险，直接放行
    const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!sessionId) {
        return await next()
    }

    // 已登录请求：校验双重提交的 CSRF Token
    const csrfToken = c.req.header('X-CSRF-Token')
    if (!csrfToken) {
        return c.json({ error: '缺少 CSRF Token，请刷新页面重试' }, 403)
    }

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
    }
    // 未登录用户：本项目鉴权基于 Authorization header（非 Cookie），
    // 未登录写请求（注册/登录）不存在 CSRF 风险，无需存储 token。
    
    return c.json({ csrf_token: token })
})

// Middleware
app.use('*', async (c, next) => {
    await next()
    applySecurityHeaders(c.res.headers)
})

app.use('/api/*', async (c, next) => {
    applyApiCors(c)

    if (c.req.method.toUpperCase() === 'OPTIONS') {
        const origin = c.req.header('Origin')
        return isAllowedOrigin(c, origin)
            ? c.body(null, 204)
            : c.json({ error: 'CORS origin not allowed' }, 403)
    }

    await next()
})

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
  const url = new URL(c.req.url)

  if (!isSpaRoute(url.pathname) && !isStaticAssetPath(url.pathname)) {
    return notFound()
  }

  const response = await c.env.ASSETS.fetch(c.req.raw)
  const contentType = response.headers.get('Content-Type') || ''

  if (isStaticAssetPath(url.pathname) && contentType.includes('text/html')) {
    return notFound()
  }

  // 静态资源缓存策略
  if (url.pathname.startsWith('/assets/')) {
    // Vite 构建的资源文件带有 hash，可长期缓存
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else if (isStaticAssetPath(url.pathname)) {
    // 其他静态文件缓存 1 天
    response.headers.set('Cache-Control', 'public, max-age=86400')
  } else {
    // SPA 页面入口不缓存（确保用户获取最新版本）
    response.headers.set('Cache-Control', 'no-cache')
  }

  const secured = new Response(response.body, response)
  applySecurityHeaders(secured.headers)
  return secured
})

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx)
    const secured = new Response(response.body, response)
    applySecurityHeaders(secured.headers)
    return secured
  },
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

