import { ref, computed, watch } from 'vue'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'
const EXPIRY_KEY = 'auth_expiry'
const THEME_KEY = 'app_theme'

// 检查是否过期（24小时 = 86400000 毫秒）
function getInitialToken() {
    const tokenVal = localStorage.getItem(TOKEN_KEY)
    const expiry = localStorage.getItem(EXPIRY_KEY)
    if (tokenVal && expiry) {
        if (new Date().getTime() > parseInt(expiry, 10)) {
            // 已过期，清除
            localStorage.removeItem(TOKEN_KEY)
            localStorage.removeItem(USER_KEY)
            localStorage.removeItem(EXPIRY_KEY)
            return ''
        }
        return tokenVal
    }
    return ''
}

function getInitialUser() {
    const tokenVal = getInitialToken()
    if (!tokenVal) return null
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
}

// 获取初始主题
function getInitialTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark'
}

const token = ref(getInitialToken())
const user = ref(getInitialUser())
const theme = ref(getInitialTheme())
const csrfToken = ref('')

// 应用主题到 DOM
function applyTheme(themeValue) {
    const root = document.documentElement
    root.classList.remove('theme-dark', 'theme-light', 'theme-system')
    
    if (themeValue === 'system') {
        // 检测系统偏好
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        root.classList.add(prefersDark ? 'theme-dark' : 'theme-light')
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    } else {
        root.classList.add(`theme-${themeValue}`)
        root.setAttribute('data-theme', themeValue)
    }
}

// 初始化时应用主题
applyTheme(theme.value)

// 监听系统主题变化
if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (theme.value === 'system') {
            applyTheme('system')
        }
    })
}

export function useAuth() {
    const isLoggedIn = computed(() => !!token.value)
    const isAdmin = computed(() => user.value?.role === 'admin')

    function setAuth(tokenVal, userData) {
        token.value = tokenVal
        user.value = userData
        localStorage.setItem(TOKEN_KEY, tokenVal)
        localStorage.setItem(USER_KEY, JSON.stringify(userData))
        // 设置 24 小时后过期
        localStorage.setItem(EXPIRY_KEY, (new Date().getTime() + 24 * 60 * 60 * 1000).toString())
        
        // 获取 CSRF Token
        fetchCsrfToken()
    }

    function logout() {
        token.value = ''
        user.value = null
        csrfToken.value = ''
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(EXPIRY_KEY)
    }

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' }
        if (token.value) {
            headers['Authorization'] = `Bearer ${token.value}`
        }
        // 添加 CSRF Token
        if (csrfToken.value) {
            headers['X-CSRF-Token'] = csrfToken.value
        }
        return headers
    }

    // 获取 CSRF Token
    async function fetchCsrfToken() {
        try {
            const headers = {}
            if (token.value) {
                headers['Authorization'] = `Bearer ${token.value}`
            }
            
            const res = await fetch('/api/csrf-token', { headers })
            if (res.ok) {
                const data = await res.json()
                csrfToken.value = data.csrf_token || ''
            }
        } catch (e) {
            console.warn('获取 CSRF Token 失败:', e)
        }
    }

    // 切换主题
    function setTheme(newTheme) {
        const validThemes = ['dark', 'light', 'system']
        const finalTheme = validThemes.includes(newTheme) ? newTheme : 'dark'
        theme.value = finalTheme
        localStorage.setItem(THEME_KEY, finalTheme)
        applyTheme(finalTheme)

        // 如果已登录，同步到后端
        if (token.value && user.value) {
            fetch('/api/auth/theme', {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ theme: finalTheme })
            }).catch(() => { /* 静默失败 */ })
        }
    }

    // 更新用户兴趣标签
    async function updateInterests(interests) {
        if (!token.value) return false
        
        try {
            const res = await fetch('/api/auth/interests', {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ interests })
            })
            
            if (res.ok) {
                const data = await res.json()
                // 更新本地用户信息
                if (user.value) {
                    user.value = { ...user.value, interests: data.interests }
                    localStorage.setItem(USER_KEY, JSON.stringify(user.value))
                }
                return true
            }
            return false
        } catch (e) {
            console.error('更新兴趣标签失败:', e)
            return false
        }
    }

    // 页面加载时获取 CSRF Token：仅已登录用户预取
    // 匿名用户改为首次写操作（登录/注册）时惰性获取，避免首页无谓请求
    if (!csrfToken.value && token.value) {
        fetchCsrfToken()
    }

    // 定期刷新 CSRF Token（每 1.5 小时）
    let csrfTimer = null
    watch(token, (newVal) => {
        if (csrfTimer) clearInterval(csrfTimer)
        if (newVal) {
            fetchCsrfToken()
            csrfTimer = setInterval(fetchCsrfToken, 90 * 60 * 1000)
        }
    }, { immediate: true })

    return { 
        token, 
        user, 
        isLoggedIn, 
        isAdmin, 
        theme,
        setAuth, 
        logout, 
        getHeaders, 
        setTheme,
        updateInterests,
        refreshCsrf: fetchCsrfToken
    }
}
