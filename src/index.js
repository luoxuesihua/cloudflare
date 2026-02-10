
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

// Routes
app.route('/api/auth', auth)
app.route('/api/posts', posts)

// Health Check
app.get('/', (c) => c.text('Rin API is running.'))

export default app
