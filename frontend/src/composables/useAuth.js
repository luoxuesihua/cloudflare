import { ref, computed } from 'vue'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'
const EXPIRY_KEY = 'auth_expiry'

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

const token = ref(getInitialToken())
const user = ref(getInitialUser())

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
    }

    function logout() {
        token.value = ''
        user.value = null
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(EXPIRY_KEY)
    }

    function getHeaders() {
        const headers = { 'Content-Type': 'application/json' }
        if (token.value) {
            headers['Authorization'] = `Bearer ${token.value}`
        }
        return headers
    }

    return { token, user, isLoggedIn, isAdmin, setAuth, logout, getHeaders }
}
