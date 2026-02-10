
import { Hono } from 'hono'
import { Database } from '../db'

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

posts.get('/', async (c) => {
    const db = getDb(c)
    const posts = await db.findAllPosts()
    return c.json(posts)
})

posts.get('/:id', async (c) => {
    const id = c.req.param('id')
    const db = getDb(c)
    const post = await db.findPostById(id)
    if (!post) return c.json({ error: 'Not found' }, 404)
    return c.json(post)
})

posts.post('/', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const { title, content, tags } = await c.req.json()
    const db = getDb(c)

    await db.createPost(user.id, user.username, title, content, tags)
    return c.json({ success: true }, 201)
})

export default posts
