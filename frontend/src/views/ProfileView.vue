<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { user, isLoggedIn, isAdmin, getHeaders } = useAuth()

if (!isLoggedIn.value) {
  router.push('/login?redirect=/profile')
}

const oldPassword = ref('')
const newPassword = ref('')
const isLoading = ref(false)
const message = ref('')
const isError = ref(false)

const changePassword = async () => {
  if (!oldPassword.value || !newPassword.value) {
    message.value = '请填写所有字段'
    isError.value = true
    return
  }

  isLoading.value = true
  message.value = ''

  try {
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ oldPassword: oldPassword.value, newPassword: newPassword.value })
    })
    const data = await res.json()

    if (res.ok) {
      message.value = '密码修改成功！'
      isError.value = false
      oldPassword.value = ''
      newPassword.value = ''
    } else {
      message.value = data.error || '修改失败'
      isError.value = true
    }
  } catch (e) {
    message.value = '网络错误'
    isError.value = true
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="profile-view" v-if="user">
    <h2>个人中心</h2>

    <div class="glass-panel info-card">
      <h3>用户信息</h3>
      <div class="info-row"><span class="label">用户名</span><span>{{ user.username }}</span></div>
      <div class="info-row"><span class="label">用户 ID</span><span>{{ user.id }}</span></div>
      <div class="info-row"><span class="label">角色</span><span class="role-badge">{{ user.role }}</span></div>
    </div>

    <div v-if="isAdmin" class="glass-panel admin-card">
      <h3>管理员功能</h3>
      <p>您拥有管理员权限。</p>
      <div class="admin-actions">
        <RouterLink to="/admin" class="btn btn-primary">管理后台</RouterLink>
      </div>
    </div>

    <div class="glass-panel password-card">
      <h3>修改密码</h3>
      <div v-if="message" :class="['msg', isError ? 'error-msg' : 'success-msg']">{{ message }}</div>
      <div class="input-group">
        <label>当前密码</label>
        <input type="password" v-model="oldPassword" class="input-field" placeholder="输入当前密码" />
      </div>
      <div class="input-group">
        <label>新密码</label>
        <input type="password" v-model="newPassword" class="input-field" placeholder="输入新密码" />
      </div>
      <button @click="changePassword" class="btn btn-primary" :disabled="isLoading">
        {{ isLoading ? '更新中...' : '更新密码' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.profile-view {
  max-width: 600px;
  margin: 0 auto;
}

h2 {
  margin-bottom: 25px;
}

.glass-panel {
  padding: 30px;
  border-radius: var(--radius-md);
  margin-bottom: 25px;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

h3 {
  margin-top: 0;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.label {
  color: var(--text-muted);
}

.role-badge {
  background: rgba(14, 165, 233, 0.15);
  color: var(--primary);
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 0.85rem;
}

.admin-actions {
  margin-top: 15px;
}

.msg {
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 0.9rem;
}

.error-msg {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.success-msg {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #6ee7b7;
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
</style>
