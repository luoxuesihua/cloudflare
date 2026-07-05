

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from './routes/auth'
import posts from './routes/posts'
import { Database } from './db'
import { collectNews, collectHotSearch } from './services/collector.js'
import { asyncAISummarize } from './services/summarizer.js'


const app = new Hono()

// Middleware
app.use('/*', cors())
app.use('*', async (c, next) => {
  const db = new Database(c.env)
  await db.init()
  await next()
})

// API 路由
app.route('/api/auth', auth)
app.route('/api/posts', posts)

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

