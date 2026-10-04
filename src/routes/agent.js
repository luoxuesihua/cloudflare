import { Hono } from 'hono'
import { Database } from '../db.js'

const agent = new Hono()

function getDb(c) {
    return new Database(c.env)
}

function cleanMarkdown(text) {
    if (!text) return ''
    return text
        .replace(/<[^>]+>/g, '')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/**
 * GET /api/v1/agent
 * 专为 AI Agent（LLM 上下文）设计的超纯净 Markdown 资讯流
 * 参数：
 *  - category: 领域分类 (ai | dev | ops | product | biz | general)
 *  - limit: 数量 (1-50，默认 20)
 *  - keyword: 搜索词
 */
agent.get('/', async (c) => {
    const category = c.req.query('category') || null
    const keyword = c.req.query('keyword') || null
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50)

    const db = getDb(c)
    const { posts, total } = await db.findAllPosts(null, category, null, keyword, 'created_at', 'DESC', limit, 0)

    const categoryNames = {
        ai: 'AI 前沿',
        dev: '编程开发',
        ops: '运维架构',
        product: '产品设计',
        biz: '财经商业',
        general: '综合资讯'
    }

    let md = `# 万象资讯 · 实时行业情报流 (AI Agent Feed)\n\n`
    md += `> 更新时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (北京时间) · 来源: 40+ 聚合源 · 总收录: ${total} 条\n`
    if (category) {
        md += `> 当前筛选分类: ${categoryNames[category] || category}\n`
    }
    md += `\n---\n\n`

    if (!posts || posts.length === 0) {
        md += `暂无符合条件的资讯。\n`
    } else {
        posts.forEach((post, idx) => {
            const catName = categoryNames[post.category] || post.category || '综合'
            const source = post.source_name || post.username?.replace(/^(NewsBot|热搜Bot)\s*\((.+)\)$/, '$2') || '综合'
            const num = String(idx + 1).padStart(2, '0')

            md += `### ${num}. [${post.title}](https://m.suyuank.top/post/${post.id})\n`
            md += `- **分类**: ${catName} | **信源**: ${source} | **发布时间**: ${post.created_at}\n`
            if (post.hot_score) {
                md += `- **热度指数**: ${post.hot_score}/100\n`
            }
            if (post.takeaway) {
                md += `- **🎯 核心看点**: ${post.takeaway}\n`
            }
            if (post.target_audience) {
                md += `- **👥 适合人群**: ${post.target_audience}\n`
            }
            const summary = post.ai_summary || post.summary || cleanMarkdown(post.snippet)
            if (summary) {
                md += `- **📝 导读摘要**: ${summary.trim()}\n`
            }
            md += `\n`
        })
    }

    md += `---\n\n*提示: 本出口遵循 Agent-Friendly 规范，无 HTML 冗余，可直接并入 LLM 上下文作为实时检索数据。更多分类可请求 ?category=ai|dev|ops|product|biz*\n`

    c.header('Content-Type', 'text/markdown; charset=utf-8')
    c.header('Cache-Control', 'public, max-age=120, stale-while-revalidate=60')
    return c.text(md)
})

export default agent
