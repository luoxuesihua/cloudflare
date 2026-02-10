import { Hono } from 'hono'
import { Database } from '../db.js'

const posts = new Hono()

function getDb(c) {
    return new Database(c.env)
}

async function getUser(c) {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const userStr = await c.env.suyuankv.get(token);
    return userStr ? JSON.parse(userStr) : null;
}

// 获取文章列表（支持标签过滤）
posts.get('/', async (c) => {
    const tag = c.req.query('tag')
    const db = getDb(c)
    const list = await db.findAllPosts(tag)
    return c.json(list)
})

// 获取单篇文章
posts.get('/:id', async (c) => {
    const id = c.req.param('id')
    const db = getDb(c)
    const post = await db.findPostById(id)
    if (!post) return c.json({ error: '文章不存在' }, 404)
    return c.json(post)
})

// 创建文章
posts.post('/', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '请先登录' }, 401)

    const { title, content, tags } = await c.req.json()
    if (!title || !content) return c.json({ error: '标题和内容不能为空' }, 400)

    const db = getDb(c)
    await db.createPost(user.id, user.username, title, content, tags || '')
    return c.json({ success: true }, 201)
})

// 删除文章（仅管理员）
posts.delete('/:id', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const id = c.req.param('id')
    const db = getDb(c)
    await db.deletePost(id)
    return c.json({ success: true })
})

export default posts
