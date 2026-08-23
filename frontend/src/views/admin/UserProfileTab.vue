<script setup>
import { ref } from 'vue'
import { useAuth } from '../../composables/useAuth'

const { user, getHeaders, setAuth } = useAuth()

// 个人资料编辑
const isEditing = ref(false)
const editForm = ref({ username: '', email: '', phone: '' })
const editLoading = ref(false)
const editMsg = ref('')

// 修改密码
const oldPassword = ref('')
const newPwd = ref('')
const pwdLoading = ref(false)
const pwdMessage = ref('')
const pwdIsError = ref(false)

function startEdit() {
  editForm.value = {
    username: user.value?.username || '',
    email: user.value?.email || '',
    phone: user.value?.phone || ''
  }
  isEditing.value = true
  editMsg.value = ''
}

function cancelEdit() {
  isEditing.value = false
  editMsg.value = ''
}

async function saveProfile() {
  if (!editForm.value.username || !editForm.value.email) {
    editMsg.value = '用户名和邮箱不能为空'
    return
  }
  editLoading.value = true
  editMsg.value = ''

  try {
    const res = await fetch('/api/auth/me', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(editForm.value)
    })
    const data = await res.json()
    if (res.ok) {
      setAuth(data.token, data.user)
      isEditing.value = false
    } else {
      editMsg.value = data.error || '保存失败'
    }
  } catch (e) {
    editMsg.value = '网络错误'
  } finally {
    editLoading.value = false
  }
}

async function changePassword() {
  if (!oldPassword.value || !newPwd.value) {
    pwdMessage.value = '请填写所有字段'
    pwdIsError.value = true
    return
  }
  pwdLoading.value = true
  pwdMessage.value = ''
  pwdIsError.value = false

  try {
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ oldPassword: oldPassword.value, newPassword: newPwd.value })
    })
    const data = await res.json()
    if (res.ok) {
      pwdMessage.value = '密码修改成功，下次请使用新密码登录'
      pwdIsError.value = false
      oldPassword.value = ''
      newPwd.value = ''
    } else {
      pwdMessage.value = data.error || '修改失败'
      pwdIsError.value = true
    }
  } catch (e) {
    pwdMessage.value = '网络错误'
    pwdIsError.value = true
  } finally {
    pwdLoading.value = false
  }
}
</script>

<template>
  <div class="profile-tab">
    <h2>个人中心</h2>

    <div class="profile-grid">
      <!-- 个人信息卡片 -->
      <div class="profile-info-card glass-inner">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3>基本资料</h3>
          <button v-if="!isEditing" @click="startEdit" class="btn btn-ghost btn-sm">编辑资料</button>
        </div>

        <div v-if="editMsg" class="msg error-msg">{{ editMsg }}</div>

        <div v-if="!isEditing">
          <div class="info-row"><span class="label">用户名</span><span>{{ user?.username }}</span></div>
          <div class="info-row"><span class="label">邮箱</span><span>{{ user?.email }}</span></div>
          <div class="info-row"><span class="label">手机号</span><span>{{ user?.phone || '未设置' }}</span></div>
          <div class="info-row"><span class="label">用户 ID</span><span>{{ user?.id }}</span></div>
          <div class="info-row"><span class="label">角色</span><span :class="['role-badge', user?.role]">{{ user?.role === 'admin' ? '管理员' : '普通用户' }}</span></div>
        </div>

        <div v-else class="edit-form">
          <div class="input-group">
            <label>用户名</label>
            <input type="text" v-model="editForm.username" class="input-field" />
          </div>
          <div class="input-group">
            <label>邮箱</label>
            <input type="email" v-model="editForm.email" class="input-field" />
          </div>
          <div class="input-group">
            <label>手机号</label>
            <input type="text" v-model="editForm.phone" class="input-field" />
          </div>
          <div class="actions" style="margin-top: 20px; display: flex; gap: 10px;">
            <button @click="saveProfile" class="btn btn-primary btn-sm" :disabled="editLoading">
              {{ editLoading ? '保存中...' : '保存' }}
            </button>
            <button @click="cancelEdit" class="btn btn-ghost btn-sm">取消</button>
          </div>
        </div>
      </div>

      <!-- 修改密码卡片 -->
      <div class="profile-pwd-card glass-inner">
        <h3>修改密码</h3>
        <div v-if="pwdMessage" :class="['msg', pwdIsError ? 'error-msg' : 'success-msg']">{{ pwdMessage }}</div>
        <div class="input-group">
          <label>当前密码</label>
          <input type="password" v-model="oldPassword" class="input-field" placeholder="输入当前密码" />
        </div>
        <div class="input-group">
          <label>新密码</label>
          <input type="password" v-model="newPwd" class="input-field" placeholder="输入新密码" />
          <div v-if="newPwd" class="pwd-hints">
            <span :class="{ pass: newPwd.length >= 8 }">• 至少 8 位</span>
            <span :class="{ pass: /[a-z]/.test(newPwd) }">• 小写字母</span>
            <span :class="{ pass: /[A-Z]/.test(newPwd) }">• 大写字母</span>
            <span :class="{ pass: /[0-9]/.test(newPwd) }">• 数字</span>
          </div>
        </div>
        <button @click="changePassword" class="btn btn-primary btn-sm" :disabled="pwdLoading" style="margin-top: 10px;">
          {{ pwdLoading ? '更新中...' : '更新密码' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.profile-info-card, .profile-pwd-card {
  padding: 24px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
}
h3 { margin-top: 0; margin-bottom: 18px; font-size: 1.1rem; }
.info-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-size: 0.9rem;
}
.info-row .label { color: var(--text-muted); }
.role-badge {
  display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.06); color: var(--text-muted);
}
.role-badge.admin { background: rgba(245, 158, 11, 0.15); color: #F59E0B; font-weight: 600; }
.input-group { margin-bottom: 14px; }
.input-group label { display: block; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-muted); }
.input-field {
  width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.8); color: #fff; font-size: 0.9rem; outline: none; box-sizing: border-box;
}
.input-field:focus { border-color: var(--primary); }
.pwd-hints { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; font-size: 0.75rem; color: #64748B; }
.pwd-hints span.pass { color: #10B981; }
.msg { padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem; }
.error-msg { background: rgba(239, 68, 68, 0.1); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.2); }
.success-msg { background: rgba(16, 185, 129, 0.1); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.2); }

@media (max-width: 768px) {
  .profile-grid { grid-template-columns: 1fr; }
}
</style>
