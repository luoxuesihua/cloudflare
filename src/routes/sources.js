import { Hono } from 'hono'
import { Database } from '../db.js'
import { collectSingleSource, collectAllDynamicSources } from '../services/collector.js'

const sources = new Hono()

function getDb(c) {
    return new Database(c.env)
}

async function getUser(c) {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const userStr = await c.env.suyuankv.get(token);
    return userStr ? JSON.parse(userStr) : null;
}

// ========== 获取所有源 ==========
sources.get('/', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const db = getDb(c)
    const list = await db.findAllSources()
    // 解析 url_backup JSON
    const parsed = list.map(s => ({
        ...s,
        url_backup: JSON.parse(s.url_backup || '[]'),
        is_active: !!s.is_active
    }))
    return c.json(parsed)
})

// ========== 获取所有分类 ==========
sources.get('/categories', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)
    return c.json([
        { id: 'general', name: '综合资讯' },
        { id: 'ai', name: 'AI 前沿' },
        { id: 'dev', name: '编程开发' },
        { id: 'ops', name: '运维架构' },
        { id: 'product', name: '产品设计' },
        { id: 'biz', name: '财经商业' }
    ])
})

// ========== 添加源 ==========
sources.post('/', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const { url, name, category, hotScore, lang, description, urlBackup, isActive, sortOrder } = await c.req.json()
    if (!url || !name) return c.json({ error: 'URL 和名称为必填项' }, 400)

    const db = getDb(c)
    const id = await db.createSource({ url, name, category, hotScore, lang, description, urlBackup, isActive, sortOrder })
    return c.json({ success: true, id }, 201)
})

// ========== 更新源 ==========
sources.put('/:id', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const id = c.req.param('id')
    const source = await getDb(c).findSourceById(id)
    if (!source) return c.json({ error: '源不存在' }, 404)

    const { url, name, category, hotScore, lang, description, urlBackup, isActive, sortOrder } = await c.req.json()
    if (!url || !name) return c.json({ error: 'URL 和名称为必填项' }, 400)

    const db = getDb(c)
    await db.updateSource(id, { url, name, category, hotScore, lang, description, urlBackup, isActive, sortOrder })
    return c.json({ success: true })
})

// ========== 切换启用/停用 ==========
sources.put('/:id/toggle', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const id = c.req.param('id')
    const source = await getDb(c).findSourceById(id)
    if (!source) return c.json({ error: '源不存在' }, 404)

    const newActive = source.is_active ? 0 : 1
    const db = getDb(c)
    await db.toggleSourceActive(id, newActive)
    return c.json({ success: true, is_active: !!newActive })
})

// ========== 删除源 ==========
sources.delete('/:id', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const id = c.req.param('id')
    const db = getDb(c)
    await db.deleteSource(id)
    return c.json({ success: true })
})

// ========== 手动同步单个源 ==========
sources.post('/:id/sync', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const id = c.req.param('id')
    const db = getDb(c)
    const source = await db.findSourceById(id)
    if (!source) return c.json({ error: '源不存在' }, 404)

    try {
        const result = await collectSingleSource(c.env, {
            url: source.url,
            name: source.name,
            category: source.category,
            hotScore: source.hot_score,
            lang: source.lang,
            desc: source.description,
            urlBackup: JSON.parse(source.url_backup || '[]')
        })
        return c.json({ success: true, ...result })
    } catch (e) {
        return c.json({ success: false, error: e.message, collected: 0 }, 500)
    }
})

// ========== 同步全部动态源 ==========
sources.post('/sync-all', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    try {
        const db = getDb(c)
        const dynamicSources = await db.findActiveSources()
        const parsedSources = dynamicSources.map(s => ({
            url: s.url,
            name: s.name,
            category: s.category,
            hotScore: s.hot_score,
            lang: s.lang,
            desc: s.description,
            urlBackup: JSON.parse(s.url_backup || '[]')
        }))
        const result = await collectAllDynamicSources(c.env, parsedSources)
        return c.json({ success: true, ...result })
    } catch (e) {
        return c.json({ success: false, error: e.message, totalCollected: 0 }, 500)
    }
})

export default sources
