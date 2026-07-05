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

// ========== 文章列表（支持多维度筛选 + 关键词搜索） ==========
posts.get('/', async (c) => {
    const tag = c.req.query('tag')
    const category = c.req.query('category')
    const source = c.req.query('source')
    const keyword = c.req.query('keyword')
    const sortBy = c.req.query('sort') || 'created_at'    // created_at | hot_score
    const order = c.req.query('order') || 'DESC'
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50)
    const offset = parseInt(c.req.query('offset') || '0', 10)

    const db = getDb(c)
    const result = await db.findAllPosts(tag, category, source, keyword, sortBy, order, limit, offset)
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

// 手动采集 RSS 新闻（后台异步执行，立即返回）
posts.post('/collect', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    c.executionCtx.waitUntil(collectNews(c.env))
    return c.json({ success: true, message: 'RSS 采集任务已启动，将在后台执行' })
})

// 手动采集热搜（后台异步执行，立即返回）
posts.post('/collect-hot', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    c.executionCtx.waitUntil(collectHotSearch(c.env))
    return c.json({ success: true, message: '热搜采集任务已启动，将在后台执行' })
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

// ========== 评论接口 ==========

// 获取文章评论
posts.get('/:id/comments', async (c) => {
    const postId = parseInt(c.req.param('id'))
    const db = getDb(c)
    const comments = await db.findCommentsByPostId(postId)
    const count = await db.getPostCommentCount(postId)
    return c.json({ comments, count })
})

// 发表评论（需登录）
posts.post('/:id/comments', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '请先登录' }, 401)

    const postId = parseInt(c.req.param('id'))
    const { content } = await c.req.json()
    if (!content || content.trim().length === 0) {
        return c.json({ error: '评论内容不能为空' }, 400)
    }
    if (content.length > 500) {
        return c.json({ error: '评论内容不能超过 500 字' }, 400)
    }

    const db = getDb(c)
    const post = await db.findPostById(postId)
    if (!post) return c.json({ error: '文章不存在' }, 404)

    const commentId = await db.createComment(postId, user.id, user.username, content.trim())
    return c.json({
        success: true,
        comment: {
            id: commentId,
            post_id: postId,
            user_id: user.id,
            username: user.username,
            content: content.trim(),
            created_at: new Date().toISOString()
        }
    }, 201)
})

// 删除评论（仅评论作者或管理员可删）
posts.delete('/:id/comments/:commentId', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '请先登录' }, 401)

    const db = getDb(c)
    const commentId = parseInt(c.req.param('commentId'))
    
    const comment = await db.findCommentById(commentId)
    if (!comment) return c.json({ error: '评论不存在' }, 404)

    // 仅评论作者或管理员可删除
    if (comment.user_id !== user.id && user.role !== 'admin') {
        return c.json({ error: '无权限删除此评论' }, 403)
    }

    await db.deleteComment(commentId)
    return c.json({ success: true })
})

export default posts
