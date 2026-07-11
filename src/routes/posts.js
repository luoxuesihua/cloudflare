import { Hono } from 'hono'
import { Database } from '../db.js'
import { collectNews, collectHotSearch } from '../services/collector.js'
import { generateAISummary, extractKeyPoints } from '../services/summarizer.js'
import { withCache, CACHE_TTL, invalidateKVCacheByTag, CACHE_TAGS } from '../cache.js'

// 缓存失效辅助：写操作后使文章列表/统计/详情缓存失效
function invalidatePostCaches(c, env) {
  // 通过递增版本号失效 KV 缓存
  invalidateKVCacheByTag(env, CACHE_TAGS.POSTS, c.executionCtx)
  invalidateKVCacheByTag(env, CACHE_TAGS.POST_DETAIL, c.executionCtx)
}

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

// ========== 安全性：SQL 参数白名单（防止注入）==========
const ALLOWED_SORT_COLUMNS = ['created_at', 'hot_score']
const ALLOWED_SORT_ORDERS = ['ASC', 'DESC']

function validateSortParams(sortBy, order) {
    const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'created_at'
    const safeOrder = ALLOWED_SORT_ORDERS.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC'
    return { safeSortBy, safeOrder }
}

// ========== 安全性：XSS 防护（HTML 实体转义）==========
function sanitizeHtml(text) {
    if (!text) return ''
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\//g, '&#x2F;')
}

// ========== 文章列表（支持多维度筛选 + 关键词搜索 + 个性化推荐） ==========
// 缓存 2 分钟 — 实时性要求低，数据按 Cron 定时更新
posts.get('/', withCache(CACHE_TTL.POSTS_LIST, async (c) => {
    const tag = c.req.query('tag')
    const category = c.req.query('category')
    const source = c.req.query('source')
    const keyword = c.req.query('keyword')
    
    // 安全性：使用白名单校验排序参数
    let sortBy = c.req.query('sort') || 'created_at'
    let order = c.req.query('order') || 'DESC'
    const { safeSortBy, safeOrder } = validateSortParams(sortBy, order)
    
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50)
    const offset = parseInt(c.req.query('offset') || '0', 10)

    // 获取当前用户（用于个性化推荐）
    const user = await getUser(c)
    const userInterests = user?.interests || []

    const db = getDb(c)
    const result = await db.findAllPosts(tag, category, source, keyword, safeSortBy, safeOrder, limit, offset, userInterests)
    return c.json(result)
}))

// 分类统计 — 缓存 5 分钟，变化极慢
posts.get('/stats', withCache(CACHE_TTL.STATS, async (c) => {
    const db = getDb(c)
    const stats = await db.getCategoryStats()
    return c.json(stats)
}))

// 获取单篇文章 — 缓存 5 分钟，文章发布后很少修改
posts.get('/:id', withCache(CACHE_TTL.POST_DETAIL, async (c) => {
    const id = c.req.param('id')
    const db = getDb(c)
    const post = await db.findPostById(id)
    if (!post) return c.json({ error: '文章不存在' }, 404)
    return c.json(post)
}))

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
    invalidatePostCaches(c, c.env)
    return c.json({ success: true }, 201)
})

// 删除文章（仅管理员）
posts.delete('/:id', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const id = c.req.param('id')
    const db = getDb(c)
    await db.deletePost(id)
    invalidatePostCaches(c, c.env)
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
    invalidatePostCaches(c, c.env)
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

// 获取文章评论 — 缓存 1 分钟
posts.get('/:id/comments', withCache(CACHE_TTL.COMMENTS, async (c) => {
    const postId = parseInt(c.req.param('id'))
    const db = getDb(c)
    const comments = await db.findCommentsByPostId(postId)
    const count = await db.getPostCommentCount(postId)
    return c.json({ comments, count })
}))

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

    // 安全性：XSS 防护 - 转义 HTML 特殊字符
    const sanitizedContent = sanitizeHtml(content.trim())
    
    const db = getDb(c)
    const post = await db.findPostById(postId)
    if (!post) return c.json({ error: '文章不存在' }, 404)

    const commentId = await db.createComment(postId, user.id, user.username, sanitizedContent)
    invalidateKVCacheByTag(c.env, CACHE_TAGS.COMMENTS, c.executionCtx)
    return c.json({
        success: true,
        comment: {
            id: commentId,
            post_id: postId,
            user_id: user.id,
            username: user.username,
            content: sanitizedContent,
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
    invalidateKVCacheByTag(c.env, CACHE_TAGS.COMMENTS, c.executionCtx)
    return c.json({ success: true })
})

// ========== 阅读历史接口 ==========

// 记录阅读历史（用户访问文章详情时调用）
posts.post('/:id/read', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '请先登录' }, 401)

    const postId = parseInt(c.req.param('id'))
    const db = getDb(c)
    
    // 验证文章存在
    const post = await db.findPostById(postId)
    if (!post) return c.json({ error: '文章不存在' }, 404)

    await db.recordReadingHistory(user.id, postId)
    return c.json({ success: true })
})

// 获取阅读历史列表
posts.get('/history', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '请先登录' }, 401)

    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    
    const db = getDb(c)
    const history = await db.getReadingHistory(user.id, limit, offset)
    const count = await db.getReadingHistoryCount(user.id)
    
    return c.json({ history, total: count })
})

// 清空阅读历史
posts.delete('/history', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '请先登录' }, 401)

    const db = getDb(c)
    await db.clearReadingHistory(user.id)
    return c.json({ success: true })
})

export default posts
