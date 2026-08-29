/**
 * 多级缓存策略：
 * 1. Cache API (CDN 边缘缓存) - 对整个 Response 缓存，TTL 短
 * 2. KV 缓存 - 对 JSON 数据缓存，TTL 长，支持主动失效
 */

// ========== 缓存 TTL 配置（秒） ==========
export const CACHE_TTL = {
  // 文章列表 - 实时性要求低，但内容会定期更新
  POSTS_LIST: 120,       // 2分钟
  // 文章详情 - 发布后基本不变
  POST_DETAIL: 300,      // 5分钟
  // 评论 - 变化较少
  COMMENTS: 60,          // 1分钟
  // 分类统计 - 变化缓慢
  STATS: 300,            // 5分钟
  // 分类列表 - 几乎是静态数据
  CATEGORIES: 600,       // 10分钟
  // 源列表 - 管理员操作频率低
  SOURCES: 300,          // 5分钟
  // 源分类
  SOURCE_CATEGORIES: 600,// 10分钟
}

// KV 缓存键前缀（用于主动失效）
export const KV_CACHE_PREFIX = 'cache:'

// Origin 来自 CORS 中间件；Authorization 防止浏览器/中间代理跨登录态复用响应
const VARY = 'Origin, Authorization'

// ========== Cache API 缓存中间件 ==========
// 使用 Cloudflare Cache API (caches.default) 缓存 GET 请求响应
// 缓存键 = 完整请求 URL（含 query string）

/**
 * 为 Hono handler 添加 Cache API 缓存层
 * @param {number} ttl - 缓存秒数
 * @param {Function} handler - 原 handler 函数
 * @returns {Function} 包装后的 handler
 */
export function withCache(ttl, handler) {
  return async (c) => {
    // 仅缓存 GET 请求
    if (c.req.method.toUpperCase() !== 'GET') {
      return handler(c)
    }

    // 携带 Authorization 的响应可能是个性化内容（如首页按兴趣加权排序），
    // 而 Cache API 只按 URL 建 key，缓存后会跨用户串号，故整体绕过
    if (c.req.header('Authorization')) {
      const personalized = await handler(c)
      personalized.headers.set('Cache-Control', 'private, no-store')
      personalized.headers.set('Vary', VARY)
      personalized.headers.set('X-Cache', 'BYPASS')
      return personalized
    }

    const cache = caches.default
    const cacheKey = new Request(c.req.url, c.req.raw)

    // 1. 尝试从 Cache API 读取
    try {
      const cachedResponse = await cache.match(cacheKey)
      if (cachedResponse) {
        // 添加 X-Cache 头方便调试
        const headers = new Headers(cachedResponse.headers)
        headers.set('X-Cache', 'HIT')
        headers.set('Vary', VARY)
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          headers
        })
      }
    } catch (e) {
      // cache.match 失败降级：继续执行 handler
      console.error('Cache match error:', e)
    }

    // 2. 执行原 handler
    const response = await handler(c)
    
    // 3. 仅缓存成功的 JSON 响应
    if (response.status === 200) {
      const contentType = response.headers.get('Content-Type') || ''
      if (contentType.includes('application/json')) {
        try {
          const clonedResponse = response.clone()
          // 清除可能影响缓存的头
          clonedResponse.headers.delete('Set-Cookie')
          clonedResponse.headers.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`)
          clonedResponse.headers.set('X-Cache', 'MISS')
          // 使用 ctx.waitUntil 避免阻塞响应
          c.executionCtx.waitUntil(cache.put(cacheKey, clonedResponse))
        } catch (e) {
          console.error('Cache put error:', e)
        }
      }
    }

    // 添加 Cache-Control 头（即使没进 Cache API，也告诉浏览器/CDN）
    response.headers.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`)
    response.headers.set('Vary', VARY)
    response.headers.set('X-Cache', 'MISS')
    return response
  }
}

/**
 * 批量失效 Cache API 中匹配 URL 前缀的缓存
 * 注意：Cache API 不支持批量删除，需要逐个已知的 URL 删除。
 * 这里提供一个辅助函数，通过构造可能的 URL 来尝试失效。
 * 
 * @param {object} c - Hono Context
 * @param {string[]} urlPatterns - 要失效的 URL 前缀列表
 */
// ========== KV 数据缓存（用于高频 + 重计算数据） ==========

/**
 * 从 KV 读取缓存数据
 * @param {object} env - Worker env
 * @param {string} key - 缓存键
 * @returns {object|null} 缓存数据或 null
 */
export async function getKVCache(env, key) {
  try {
    const raw = await env.suyuankv.get(`${KV_CACHE_PREFIX}${key}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 写入 KV 缓存
 * @param {object} env - Worker env
 * @param {string} key - 缓存键
 * @param {any} data - 要缓存的数据
 * @param {number} ttl - 过期秒数
 * @param {object} ctx - executionCtx (用于 waitUntil)
 */
export async function setKVCache(env, key, data, ttl, ctx) {
  const fullKey = `${KV_CACHE_PREFIX}${key}`
  try {
    if (ctx) {
      ctx.waitUntil(env.suyuankv.put(fullKey, JSON.stringify(data), { expirationTtl: ttl }))
    } else {
      await env.suyuankv.put(fullKey, JSON.stringify(data), { expirationTtl: ttl })
    }
  } catch (e) {
    console.error('KV cache set error:', e)
  }
}

// ========== 真实缓存失效（Cache API） ==========
// 说明：withCache 使用 Cloudflare Cache API 缓存 GET 响应（按完整 URL 作为 key）。
// Cache API 无法按前缀批量枚举删除，因此写操作后只能删除「已知的、无查询参数」的
// 基础 URL。带查询参数的列表接口由于 URL 多变，依赖 withCache 设置的较短 TTL
// （见 CACHE_TTL）自然过期，max-age 已在响应头中暴露给浏览器/CDN。

/**
 * 通过 Cache API 删除指定的 URL 缓存（不抛错）
 * @param {object} c - Hono Context（提供 req.url 的 origin 与 executionCtx）
 * @param {string[]} paths - 要失效的路径列表，如 ['/api/posts/stats']
 */
export async function invalidateCacheAPI(c, paths) {
  const cache = caches.default
  const origin = new URL(c.req.url).origin
  for (const p of paths) {
    try {
      await cache.delete(new Request(origin + p))
    } catch (e) {
      // 静默失败：缓存删除失败不影响主流程，短 TTL 会兜底
      console.warn('cache delete failed for', p, e)
    }
  }
}
