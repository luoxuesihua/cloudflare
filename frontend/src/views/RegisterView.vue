<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const step = ref(1) // 1: 输入邮箱发送验证码, 2: 输入验证码+密码完成注册
const email = ref('')
const code = ref('')
const username = ref('')
const phone = ref('')
const password = ref('')
const isLoading = ref(false)
const isSending = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const countdown = ref(0)
let timer = null

// 发送验证码
const sendCode = async () => {
  if (!email.value) {
    errorMsg.value = '请填写邮箱'
    return
  }

  isSending.value = true
  errorMsg.value = ''

  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, type: 'register' })
    })
    const data = await res.json()

    if (res.ok) {
      step.value = 2
      successMsg.value = '验证码已发送至您的邮箱'
      startCountdown()
    } else {
      errorMsg.value = data.error || '发送失败'
    }
  } catch (e) {
    errorMsg.value = '网络错误'
  } finally {
    isSending.value = false
  }
}

// 倒计时
const startCountdown = () => {
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
    }
  }, 1000)
}

// 重新发送验证码
const resendCode = async () => {
  if (countdown.value > 0) return
  await sendCode()
}

// 注册
const handleRegister = async () => {
  if (!code.value || !password.value) {
    errorMsg.value = '请填写验证码和密码'
    return
  }

  isLoading.value = true
  errorMsg.value = ''

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value,
        code: code.value,
        username: username.value,
        phone: phone.value,
        password: password.value
      })
    })
    const data = await res.json()

    if (res.ok) {
      alert('注册成功！请登录。')
      router.push('/login')
    } else {
      errorMsg.value = data.error || '注册失败'
    }
  } catch (e) {
    errorMsg.value = '网络错误'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="register-view">
    <div class="glass-panel register-card">
      <h2>注册</h2>
      <p class="subtitle">创建新账户</p>

      <!-- 步骤指示器 -->
      <div class="steps">
        <div class="step-item" :class="{ active: step >= 1 }">
          <span class="step-num">1</span>
          <span class="step-label">验证邮箱</span>
        </div>
        <div class="step-line" :class="{ active: step >= 2 }"></div>
        <div class="step-item" :class="{ active: step >= 2 }">
          <span class="step-num">2</span>
          <span class="step-label">完善信息</span>
        </div>
      </div>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
      <div v-if="successMsg && step === 2" class="success-msg">{{ successMsg }}</div>

      <!-- Step 1: 输入邮箱 -->
      <form v-if="step === 1" @submit.prevent="sendCode">
        <div class="input-group">
          <label>邮箱</label>
          <input type="email" v-model="email" class="input-field" placeholder="请输入邮箱" required />
        </div>
        <button type="submit" class="btn btn-primary full-width" :disabled="isSending">
          {{ isSending ? '发送中...' : '发送验证码' }}
        </button>
      </form>

      <!-- Step 2: 验证码 + 密码 -->
      <form v-if="step === 2" @submit.prevent="handleRegister">
        <div class="input-group">
          <label>邮箱</label>
          <div class="email-display">{{ email }}</div>
        </div>
        <div class="input-group">
          <label>验证码</label>
          <div class="code-row">
            <input type="text" v-model="code" class="input-field code-input" placeholder="6 位验证码" maxlength="6" required />
            <button type="button" @click="resendCode" class="btn btn-ghost btn-sm resend-btn" :disabled="countdown > 0">
              {{ countdown > 0 ? `${countdown}s` : '重新发送' }}
            </button>
          </div>
        </div>
        <div class="input-group">
          <label>用户名 (可选)</label>
          <input type="text" v-model="username" class="input-field" placeholder="默认使用邮箱前缀" />
        </div>
        <div class="input-group">
          <label>手机号 (可选)</label>
          <input type="text" v-model="phone" class="input-field" placeholder="请输入手机号" />
        </div>
        <div class="input-group">
          <label>密码</label>
          <input type="password" v-model="password" class="input-field" placeholder="设置密码" required />
          <div v-if="password" class="pwd-hints">
            <span :class="{ pass: password.length >= 8 }">• 至少 8 位</span>
            <span :class="{ pass: /[a-z]/.test(password) }">• 小写字母</span>
            <span :class="{ pass: /[A-Z]/.test(password) }">• 大写字母</span>
            <span :class="{ pass: /[0-9]/.test(password) }">• 数字</span>
          </div>
        </div>
        <button type="submit" class="btn btn-primary full-width" :disabled="isLoading">
          {{ isLoading ? '注册中...' : '注册' }}
        </button>
        <button type="button" @click="step = 1; errorMsg = ''; successMsg = ''" class="btn btn-ghost full-width" style="margin-top: 10px;">
          返回上一步
        </button>
      </form>

      <div class="footer-link">
        已有账户？<RouterLink to="/login">登录</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.register-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}

.register-card {
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

/* 步骤指示器 */
.steps {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30px;
  gap: 0;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.4;
  transition: opacity 0.3s;
}

.step-item.active {
  opacity: 1;
}

.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
}

.step-item.active .step-num {
  background: var(--primary);
  color: #0f172a;
  border-color: var(--primary);
}

.step-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.step-line {
  width: 40px;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 12px;
  transition: background 0.3s;
}

.step-line.active {
  background: var(--primary);
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

.email-display {
  padding: 12px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: var(--radius-sm);
  color: var(--primary);
  font-size: 0.95rem;
}

.code-row {
  display: flex;
  gap: 10px;
}

.code-input {
  flex: 1;
  letter-spacing: 4px;
  font-size: 1.1rem;
  text-align: center;
}

.resend-btn {
  white-space: nowrap;
  min-width: 90px;
  flex-shrink: 0;
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

.pwd-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 8px;
}

.pwd-hints span {
  font-size: 0.78rem;
  color: #f87171;
  transition: color 0.2s;
}

.pwd-hints span.pass {
  color: #34d399;
}
</style>
