/**
 * 前端请求缓存工具
 * 
 * 1. 请求去重 (Request Deduplication): 
 *    相同的 GET 请求在 in-flight 时共享同一个 Promise，防止重复请求
 * 
 * 2. sessionStorage 数据缓存:
 *    对 stats/categories 等变化慢的数据使用 sessionStorage 缓存
 * 
 * 3. SWR (Stale-While-Revalidate):
 *    首页先展示缓存数据，同时在后台刷新
 */

// ========== 请求去重：in-flight 请求共享 ==========
const pendingRequests = new Map()

/**
 * 去重 fetch：同一 URL+options 的并发请求共享结果
 * @param {string} url 
 * @param {object} options 
 * @returns {Promise<Response>}
 */
export function dedupedFetch(url, options = {}) {
  // 仅对 GET 请求去重
  if (options.method && options.method.toUpperCase() !== 'GET') {
    return fetch(url, options)
  }

  const key = url + '|' + JSON.stringify(options.headers || {})
  
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)
  }

  const promise = fetch(url, options).finally(() => {
    pendingRequests.delete(key)
  })

  pendingRequests.set(key, promise)
  return promise
}

// ========== sessionStorage 缓存 ==========

const CACHE_PREFIX = '_cache_'

/**
 * 从 sessionStorage 读取缓存
 * @param {string} key 
 * @param {number} ttlMs - TTL 毫秒
 * @returns {any|null}
 */
export function getSessionCache(key, ttlMs = 60000) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (Date.now() - entry.t > ttlMs) {
      sessionStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

/**
 * 写入 sessionStorage 缓存
 * @param {string} key 
 * @param {any} data 
 */
export function setSessionCache(key, data) {
  try {
    const entry = { data, t: Date.now() }
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch {
    // 存储满时清旧缓存后重试
    try {
      clearOldCaches()
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, t: Date.now() }))
    } catch { /* 静默失败 */ }
  }
}

/**
 * 清除过期的 sessionStorage 缓存
 */
function clearOldCaches() {
  const now = Date.now()
  const keys = Object.keys(sessionStorage)
  for (const key of keys) {
    if (key.startsWith(CACHE_PREFIX)) {
      try {
        const entry = JSON.parse(sessionStorage.getItem(key))
        if (now - entry.t > 5 * 60 * 1000) {
          sessionStorage.removeItem(key)
        }
      } catch {
        sessionStorage.removeItem(key)
      }
    }
  }
}

/**
 * 带缓存的数据获取（Stale-While-Revalidate 模式）
 * 1. 立即返回缓存数据（如果有，通过 onCacheData 回调）
 * 2. 同时发起 fetch 请求
 * 3. 请求完成后通过 onFreshData 回调通知
 * 
 * @param {string} url 
 * @param {string} cacheKey 
 * @param {object} options
 * @param {number} options.ttlMs - 缓存 TTL 毫秒，默认 2 分钟
 * @param {function} options.onCacheData - 收到缓存数据时的回调
 * @param {function} options.onFreshData - 收到新数据时的回调
 * @returns {Promise<any>} 新数据的解析结果
 */
export async function fetchWithSWR(url, cacheKey, { ttlMs = 120000, onCacheData, onFreshData, headers } = {}) {
  // 1. 检查 sessionStorage 缓存
  const cached = getSessionCache(cacheKey, ttlMs)
  if (cached && onCacheData) {
    onCacheData(cached)
  }

  // 2. 发起网络请求（去重）
  try {
    const res = await dedupedFetch(url, headers ? { headers } : {})
    if (res.ok) {
      const data = await res.json()
      setSessionCache(cacheKey, data)
      if (onFreshData) {
        onFreshData(data)
      }
      return data
    }
  } catch (e) {
    console.warn('SWR fetch error:', e)
  }

  // 网络失败但有缓存数据时返回缓存
  if (cached) {
    return cached
  }
  throw new Error('获取数据失败')
}

/**
 * 清除指定键的 sessionStorage 缓存
 * @param {string} key 
 */
export function clearSessionCache(key) {
  sessionStorage.removeItem(CACHE_PREFIX + key)
}
