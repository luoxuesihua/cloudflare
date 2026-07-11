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

// ========== 需要在写操作后失效的缓存标签 ==========
// 每类缓存对应一个失效标签（tag），写操作时删除对应 KV key 即可
export const CACHE_TAGS = {
  POSTS: 'posts',         // 文章列表 + 统计
  POST_DETAIL: 'post',    // 单篇文章
  COMMENTS: 'comments',   // 评论
  SOURCES: 'sources',     // 源列表
}

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

    const cache = caches.default
    const cacheKey = new Request(c.req.url, c.req.raw)

    // 1. 尝试从 Cache API 读取
    try {
      const cachedResponse = await cache.match(cacheKey)
      if (cachedResponse) {
        // 添加 X-Cache 头方便调试
        const headers = new Headers(cachedResponse.headers)
        headers.set('X-Cache', 'HIT')
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
export async function invalidateCacheAPI(c, urlPatterns) {
  const cache = caches.default
  // Cache API 没有 list/keys 方法，无法枚举
  // 但我们可以通过构造常见的查询变体来尝试删除
  for (const urlStr of urlPatterns) {
    try {
      const url = new URL(urlStr)
      // 尝试删除不带参数的基础 URL
      await cache.delete(new Request(url.toString(), { method: 'GET' }))
    } catch (e) {
      // 静默失败
    }
  }
}

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

/**
 * 失效 KV 缓存（按前缀匹配删除）
 * @param {object} env - Worker env
 * @param {string} tag - CACHE_TAGS 中的标签
 * @param {object} ctx - executionCtx
 */
export function invalidateKVCacheByTag(env, tag, ctx) {
  // KV 没有 delete by prefix，我们用版本号机制：
  // 存储 `cache:version:{tag}` 作为版本号
  // 读缓存时检查版本号是否匹配
  // 失效时递增版本号
  const versionKey = `${KV_CACHE_PREFIX}version:${tag}`
  const newVersion = Date.now().toString()
  if (ctx) {
    ctx.waitUntil(env.suyuankv.put(versionKey, newVersion, { expirationTtl: 86400 }))
  }
}

/**
 * 获取缓存版本号（用于验证 KV 缓存是否有效）
 * @param {object} env
 * @param {string} tag 
 * @returns {Promise<string>}
 */
export async function getKVCacheVersion(env, tag) {
  try {
    const v = await env.suyuankv.get(`${KV_CACHE_PREFIX}version:${tag}`)
    return v || '0'
  } catch {
    return '0'
  }
}

/**
 * 用 KV 版本控制的缓存辅助：读
 * @param {object} env 
 * @param {string} tag - CACHE_TAGS 标签
 * @param {string} subKey - 子键（如 queryString hash）
 * @returns {object|null}
 */
export async function getVersionedKVCache(env, tag, subKey) {
  const version = await getKVCacheVersion(env, tag)
  const fullKey = `${tag}:v${version}:${subKey}`
  const raw = await env.suyuankv.get(`${KV_CACHE_PREFIX}${fullKey}`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 用 KV 版本控制的缓存辅助：写
 * @param {object} env
 * @param {string} tag
 * @param {string} subKey
 * @param {any} data
 * @param {number} ttl
 * @param {object} ctx
 */
export async function setVersionedKVCache(env, tag, subKey, data, ttl, ctx) {
  const version = await getKVCacheVersion(env, tag)
  const fullKey = `${KV_CACHE_PREFIX}${tag}:v${version}:${subKey}`
  try {
    if (ctx) {
      ctx.waitUntil(env.suyuankv.put(fullKey, JSON.stringify(data), { expirationTtl: ttl }))
    } else {
      await env.suyuankv.put(fullKey, JSON.stringify(data), { expirationTtl: ttl })
    }
  } catch (e) {
    // 静默失败
  }
}
