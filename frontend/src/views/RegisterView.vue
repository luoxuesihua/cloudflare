<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const email = ref('')
const username = ref('')
const phone = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMsg = ref('')

const handleRegister = async () => {
  if (!email.value || !password.value) {
    errorMsg.value = '请填写邮箱和密码'
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

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

      <form @submit.prevent="handleRegister">
        <div class="input-group">
          <label>邮箱</label>
          <input type="email" v-model="email" class="input-field" placeholder="请输入邮箱" required />
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
          <input type="password" v-model="password" class="input-field" placeholder="设置密码" @keyup.enter="handleRegister" required />
        </div>
        <button type="submit" class="btn btn-primary full-width" :disabled="isLoading">
          {{ isLoading ? '注册中...' : '注册' }}
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
