import { Hono } from 'hono'

const upload = new Hono()

async function getUser(c) {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!token) return null
    const userStr = await c.env.suyuankv.get(token)
    return userStr ? JSON.parse(userStr) : null
}

// 允许的图片类型
const ALLOWED_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
}

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// 上传图片
upload.post('/', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '请先登录' }, 401)

    const formData = await c.req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
        return c.json({ error: '请选择文件' }, 400)
    }

    // 检查文件类型
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
        return c.json({ error: '不支持的文件格式，仅支持 JPG/PNG/GIF/WebP/SVG' }, 400)
    }

    // 检查文件大小
    if (file.size > MAX_SIZE) {
        return c.json({ error: '文件大小不能超过 10MB' }, 400)
    }

    // 生成唯一文件名: 年月日/uuid.ext
    const now = new Date()
    const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
    const fileName = `${datePath}/${crypto.randomUUID()}.${ext}`

    // 上传到 R2
    await c.env.R2_BUCKET.put(fileName, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: {
            uploadedBy: String(user.id),
            originalName: file.name
        }
    })

    // 返回可访问的 URL
    const url = `/api/upload/${fileName}`

    return c.json({ success: true, url, fileName })
})

// 读取图片（公开访问）
upload.get('/:year/:month/:name', async (c) => {
    const { year, month, name } = c.req.param()
    const key = `${year}/${month}/${name}`

    const object = await c.env.R2_BUCKET.get(key)
    if (!object) return c.json({ error: '图片不存在' }, 404)

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

    return new Response(object.body, { headers })
})

// 图片列表（仅登录用户）
upload.get('/', async (c) => {
    const user = await getUser(c)
    if (!user) return c.json({ error: '请先登录' }, 401)

    const list = await c.env.R2_BUCKET.list({ limit: 100 })
    const files = list.objects.map(obj => ({
        key: obj.key,
        url: `/api/upload/${obj.key}`,
        size: obj.size,
        uploaded: obj.uploaded
    }))

    return c.json(files)
})

// 删除图片（仅管理员）
upload.delete('/:year/:month/:name', async (c) => {
    const user = await getUser(c)
    if (!user || user.role !== 'admin') return c.json({ error: '无权限' }, 403)

    const { year, month, name } = c.req.param()
    const key = `${year}/${month}/${name}`

    await c.env.R2_BUCKET.delete(key)
    return c.json({ success: true })
})

export default upload
