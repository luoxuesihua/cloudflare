
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from './routes/auth'
import posts from './routes/posts'
import { Database } from './db'

const app = new Hono()

// Middleware
app.use('/*', cors())

// Initialize DB on first request (lazy init)
app.use('*', async (c, next) => {
  const db = new Database(c.env)
  await db.init() // Ensure tables exist
  await next()
})

// API 路由
app.route('/api/auth', auth)
app.route('/api/posts', posts)

// 所有非 API 请求交给前端静态资源处理 (Vue SPA)
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
