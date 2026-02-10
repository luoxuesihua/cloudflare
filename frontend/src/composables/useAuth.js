import { ref, computed } from 'vue'

const token = ref(localStorage.getItem('auth_token') || '')
const user = ref(JSON.parse(localStorage.getItem('auth_user') || 'null'))

export function useAuth() {
    const isLoggedIn = computed(() => !!token.value)
    const isAdmin = computed(() => user.value?.role === 'admin')

    function setAuth(tokenVal, userData) {
        token.value = tokenVal
        user.value = userData
        localStorage.setItem('auth_token', tokenVal)
        localStorage.setItem('auth_user', JSON.stringify(userData))
    }

    function logout() {
        token.value = ''
        user.value = null
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
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
