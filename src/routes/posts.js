import { Hono } from 'hono'
import { Database } from '../db.js'
import { collectNews, collectHotSearch } from '../services/collector.js'
import { generateAISummary, extractKeyPoints } from '../services/summarizer.js'


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

// ========== 文章列表（支持多维度筛选） ==========
posts.get('/', async (c) => {
    const tag = c.req.query('tag')
    const category = c.req.query('category')
    const source = c.req.query('source')
    const sortBy = c.req.query('sort') || 'created_at'    // created_at | hot_score
    const order = c.req.query('order') || 'DESC'
    const limit = parseInt(c.req.query('limit') || '100', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)

    const db = getDb(c)
    const result = await db.findAllPosts(tag, category, source, sortBy, order, limit, offset)
    return c.json(result)
})

// 分类统计
posts.get('/stats', async (c) => {
    const db = getDb(c)
    const stats = await db.getCategoryStats()
    return c.json(stats)
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

    const { title, content, tags, category } = await c.req.json()
    if (!title || !content) return c.json({ error: '标题和内容不能为空' }, 400)

    const db = getDb(c)

    // 规则提取摘要（用户文章也适用）
    let summary = ''
    try {
        const cleaned = content
            .replace(/<[^>]+>/g, '')
            .replace(/[#*`_>~|\[\]]/g, '')
            .replace(/\n{2,}/g, '。')
            .replace(/\s+/g, ' ').trim()
        // 取前两句
        const sentences = cleaned.split(/(?<=[。！？])/)
        for (let i = 0; i < Math.min(2, sentences.length); i++) {
            if (sentences[i].trim().length > 2) summary += sentences[i].trim()
        }
        if (summary.length > 150) {
            const lastPeriod = summary.substring(0, 150).lastIndexOf('。')
            summary = lastPeriod > 40 ? summary.substring(0, lastPeriod + 1) : summary.substring(0, 150) + '…'
        }
    } catch { /* 提取失败不影响主流程 */ }

    await db.createPost(user.id, user.username, title, content, tags || '', 50, category || 'general', '', summary)
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

// 批量删除文章（仅限管理员）
posts.post('/bulk-delete', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const { ids } = await c.req.json()
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return c.json({ error: '请选择要删除的文章' }, 400)
    }

    const db = getDb(c)
    await db.deletePostsByIds(ids)
    return c.json({ success: true, deleted: ids.length })
})

// 手动采集 RSS 新闻（仅限管理员）
posts.post('/collect', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const result = await collectNews(c.env)
    return c.json(result)
})

// 手动采集热搜（仅限管理员）
posts.post('/collect-hot', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const result = await collectHotSearch(c.env)
    return c.json(result)
})

// 为指定文章生成 AI 摘要 + 要点（仅限管理员）
posts.post('/:id/summarize', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const id = c.req.param('id')
    const db = getDb(c)
    const post = await db.findPostById(id)
    if (!post) return c.json({ error: '文章不存在' }, 404)

    const [summary, keyPoints] = await Promise.all([
        generateAISummary(c.env, post.title, post.content),
        extractKeyPoints(c.env, post.title, post.content)
    ])

    if (summary) {
        await db.updatePostAISummary(id, summary)
    }

    return c.json({
        success: true,
        ai_summary: summary,
        key_points: keyPoints
    })
})

export default posts
