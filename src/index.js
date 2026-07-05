


import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from './routes/auth'
import posts from './routes/posts'
import sources from './routes/sources'
import { Database } from './db'
import { collectNews, collectHotSearch } from './services/collector.js'
import { asyncAISummarize } from './services/summarizer.js'


const app = new Hono()

// Rate Limit 中间件：基于 KV 的滑动窗口限流
async function rateLimit(c, next) {
    const path = new URL(c.req.url).pathname
    // 仅对敏感接口限流
    const rateLimitedPaths = ['/api/auth/send-code', '/api/auth/login', '/api/auth/login-code', '/api/auth/register']
    if (!rateLimitedPaths.some(p => path.endsWith(p))) {
        return await next()
    }

    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const key = `rate_limit:${path}:${ip}`
    const now = Date.now()
    const windowMs = 60_000   // 1 分钟窗口
    const maxReq = path.includes('send-code') ? 1 : 5  // 发送验证码 1 次/分钟，登录 5 次/分钟

    const record = await c.env.suyuankv.get(key)
    const timestamps = record ? JSON.parse(record).filter(t => now - t < windowMs) : []

    if (timestamps.length >= maxReq) {
        const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000)
        c.header('Retry-After', String(retryAfter))
        return c.json({ error: '请求过于频繁，请稍后再试', retry_after: retryAfter }, 429)
    }

    timestamps.push(now)
    await c.env.suyuankv.put(key, JSON.stringify(timestamps), { expirationTtl: 120 })

    return await next()
}

// Middleware
app.use('/*', cors())
app.use('*', rateLimit)
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

