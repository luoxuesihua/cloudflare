<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const route = useRoute()
const { setAuth } = useAuth()

const username = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMsg = ref('')

const handleLogin = async () => {
  if (!username.value || !password.value) {
    errorMsg.value = '请填写所有字段'
    return
  }

  isLoading.value = true
  errorMsg.value = ''

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value })
    })
    const data = await res.json()

    if (res.ok) {
      setAuth(data.token, { id: data.id, username: data.username, role: data.role })
      const redirect = route.query.redirect || (data.role === 'admin' ? '/admin' : '/')
      router.push(redirect)
    } else {
      errorMsg.value = data.error || '登录失败'
    }
  } catch (e) {
    errorMsg.value = '网络错误'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="login-view">
    <div class="glass-panel login-card">
      <h2>登录</h2>
      <p class="subtitle">请输入您的凭证</p>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

      <form @submit.prevent="handleLogin">
        <div class="input-group">
          <label>用户名 / 邮箱</label>
          <input type="text" v-model="username" class="input-field" placeholder="输入用户名或邮箱" />
        </div>
        <div class="input-group">
          <label>密码</label>
          <input type="password" v-model="password" class="input-field" placeholder="输入密码" @keyup.enter="handleLogin" />
        </div>
        <button type="submit" class="btn btn-primary full-width" :disabled="isLoading">
          {{ isLoading ? '登录中...' : '登录' }}
        </button>
      </form>

      <div class="footer-link">
        还没有账户？<RouterLink to="/register">注册</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}

.login-card {
  padding: 40px;
  width: 100%;
  max-width: 420px;
  border-radius: var(--radius-md);
}

h2 {
  text-align: center;
  margin-bottom: 5px;
  font-size: 1.8rem;
}

.subtitle {
  text-align: center;
  color: var(--text-muted);
  margin-bottom: 30px;
}

.error-msg {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 0.9rem;
}

.input-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.input-field {
  width: 100%;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  transition: all 0.3s;
  box-sizing: border-box;
}

.input-field:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 15px rgba(14, 165, 233, 0.2);
}

.full-width {
  width: 100%;
  margin-top: 10px;
  justify-content: center;
  padding: 14px;
  font-size: 1rem;
}

.footer-link {
  text-align: center;
  margin-top: 25px;
  color: var(--text-muted);
  font-size: 0.9rem;
}
</style>
