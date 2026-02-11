<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const route = useRoute()
const { setAuth } = useAuth()

// 登录方式: 'password' | 'code'
const loginMode = ref('password')

// 密码登录
const username = ref('')
const password = ref('')

// 验证码登录
const codeEmail = ref('')
const loginCode = ref('')
const codeSent = ref(false)
const countdown = ref(0)
let timer = null

const isLoading = ref(false)
const isSending = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

// 密码登录
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
      setAuth(data.token, { id: data.id, username: data.username, email: data.email, phone: data.phone, role: data.role })
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

// 发送登录验证码
const sendLoginCode = async () => {
  if (!codeEmail.value) {
    errorMsg.value = '请填写邮箱'
    return
  }

  isSending.value = true
  errorMsg.value = ''

  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: codeEmail.value, type: 'login' })
    })
    const data = await res.json()

    if (res.ok) {
      codeSent.value = true
      successMsg.value = '验证码已发送'
      countdown.value = 60
      timer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) clearInterval(timer)
      }, 1000)
    } else {
      errorMsg.value = data.error || '发送失败'
    }
  } catch (e) {
    errorMsg.value = '网络错误'
  } finally {
    isSending.value = false
  }
}

// 验证码登录
const handleCodeLogin = async () => {
  if (!codeEmail.value || !loginCode.value) {
    errorMsg.value = '请填写邮箱和验证码'
    return
  }

  isLoading.value = true
  errorMsg.value = ''

  try {
    const res = await fetch('/api/auth/login-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: codeEmail.value, code: loginCode.value })
    })
    const data = await res.json()

    if (res.ok) {
      setAuth(data.token, { id: data.id, username: data.username, email: data.email, phone: data.phone, role: data.role })
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

// 切换登录方式时重置
const switchMode = (mode) => {
  loginMode.value = mode
  errorMsg.value = ''
  successMsg.value = ''
}
</script>

<template>
  <div class="login-view">
    <div class="glass-panel login-card">
      <h2>登录</h2>
      <p class="subtitle">请选择登录方式</p>

      <!-- 登录方式 Tab -->
      <div class="login-tabs">
        <button
          :class="['tab-btn', { active: loginMode === 'password' }]"
          @click="switchMode('password')"
        >密码登录</button>
        <button
          :class="['tab-btn', { active: loginMode === 'code' }]"
          @click="switchMode('code')"
        >验证码登录</button>
      </div>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
      <div v-if="successMsg" class="success-msg">{{ successMsg }}</div>

      <!-- 密码登录 -->
      <form v-if="loginMode === 'password'" @submit.prevent="handleLogin">
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

      <!-- 验证码登录 -->
      <form v-if="loginMode === 'code'" @submit.prevent="handleCodeLogin">
        <div class="input-group">
          <label>邮箱</label>
          <div class="code-row">
            <input type="email" v-model="codeEmail" class="input-field" placeholder="请输入邮箱" />
            <button type="button" @click="sendLoginCode" class="btn btn-ghost btn-sm send-btn" :disabled="isSending || countdown > 0">
              {{ isSending ? '...' : countdown > 0 ? `${countdown}s` : '发送验证码' }}
            </button>
          </div>
        </div>
        <div class="input-group">
          <label>验证码</label>
          <input type="text" v-model="loginCode" class="input-field code-input" placeholder="6 位验证码" maxlength="6" />
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
  margin-bottom: 20px;
}

/* 登录方式 Tab */
.login-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 25px;
  gap: 4px;
}

.tab-btn {
  flex: 1;
  padding: 10px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: all 0.3s;
  font-family: var(--font-body);
}

.tab-btn.active {
  background: rgba(56, 189, 248, 0.15);
  color: var(--primary);
  font-weight: 600;
}

.tab-btn:hover:not(.active) {
  color: #fff;
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

.success-msg {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #86efac;
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

.code-row {
  display: flex;
  gap: 10px;
}

.code-row .input-field {
  flex: 1;
}

.send-btn {
  white-space: nowrap;
  min-width: 100px;
  flex-shrink: 0;
}

.code-input {
  letter-spacing: 4px;
  font-size: 1.1rem;
  text-align: center;
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
