<script setup>
import { ref, onMounted } from 'vue'
import { useAuth } from '../../composables/useAuth'

const { user: currentUser, getHeaders } = useAuth()

const users = ref([])
const isLoading = ref(false)

// 添加用户相关
const showAddModal = ref(false)
const newUsername = ref('')
const newPassword = ref('')
const newEmail = ref('')
const newPhone = ref('')
const newRole = ref('user')
const addUserMsg = ref('')
const addUserError = ref(false)
const addUserLoading = ref(false)

// 编辑用户相关
const editingUser = ref(null)
const editUserForm = ref({ username: '', email: '', phone: '', role: 'user' })
const editUserMsg = ref('')
const editUserLoading = ref(false)

async function fetchUsers() {
  isLoading.value = true
  try {
    const res = await fetch('/api/auth/users', { headers: getHeaders() })
    if (res.ok) {
      users.value = await res.json()
    }
  } catch (e) {
    console.error('获取用户失败:', e)
  } finally {
    isLoading.value = false
  }
}

function openAddModal() {
  showAddModal.value = true
  newUsername.value = ''
  newPassword.value = ''
  newEmail.value = ''
  newPhone.value = ''
  newRole.value = 'user'
  addUserMsg.value = ''
  addUserError.value = false
}

function closeAddModal() {
  showAddModal.value = false
  addUserMsg.value = ''
}

async function addUser() {
  if (!newUsername.value || !newPassword.value || !newEmail.value) {
    addUserMsg.value = '请填写用户名、密码和邮箱'
    addUserError.value = true
    return
  }

  addUserLoading.value = true
  addUserMsg.value = ''

  try {
    const res = await fetch('/api/auth/users/add', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        username: newUsername.value.trim(),
        password: newPassword.value,
        email: newEmail.value.trim().toLowerCase(),
        phone: newPhone.value.trim(),
        role: newRole.value
      })
    })
    const data = await res.json()
    if (res.ok) {
      closeAddModal()
      fetchUsers()
    } else {
      addUserMsg.value = data.error || '添加失败'
      addUserError.value = true
    }
  } catch (e) {
    addUserMsg.value = '网络错误'
    addUserError.value = true
  } finally {
    addUserLoading.value = false
  }
}

function startEditUser(u) {
  editingUser.value = u
  editUserForm.value = {
    username: u.username,
    email: u.email || '',
    phone: u.phone || '',
    role: u.role || 'user'
  }
  editUserMsg.value = ''
}

function cancelEditUser() {
  editingUser.value = null
  editUserMsg.value = ''
}

async function saveEditUser() {
  if (!editUserForm.value.username || !editUserForm.value.email) {
    editUserMsg.value = '用户名和邮箱不能为空'
    return
  }
  editUserLoading.value = true
  editUserMsg.value = ''

  try {
    const res = await fetch(`/api/auth/users/${editingUser.value.id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(editUserForm.value)
    })
    const data = await res.json()
    if (res.ok) {
      cancelEditUser()
      fetchUsers()
    } else {
      editUserMsg.value = data.error || '保存失败'
    }
  } catch (e) {
    editUserMsg.value = '网络错误'
  } finally {
    editUserLoading.value = false
  }
}

async function deleteUser(u) {
  if (u.id === currentUser.value?.id) {
    alert('不能删除自己')
    return
  }
  if (!confirm(`确定要删除用户「${u.username}」吗？此操作不可恢复。`)) return

  try {
    const res = await fetch(`/api/auth/users/${u.id}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
    if (res.ok) {
      users.value = users.value.filter(item => item.id !== u.id)
    } else {
      const data = await res.json()
      alert(data.error || '删除失败')
    }
  } catch (e) {
    alert('网络错误')
  }
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="users-tab">
    <div class="header-actions">
      <h2>用户管理</h2>
      <button @click="openAddModal" class="btn btn-primary btn-sm">+ 添加用户</button>
    </div>

    <div v-if="isLoading" class="loading-text">加载中...</div>

    <!-- 桌面端表格 -->
    <table v-else-if="users.length" class="data-table desktop-only">
      <thead>
        <tr>
          <th>ID</th><th>用户名</th><th>邮箱</th><th>手机号</th><th>角色</th><th>注册时间</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.id }}</td>
          <td><strong>{{ u.username }}</strong></td>
          <td>{{ u.email }}</td>
          <td>{{ u.phone || '-' }}</td>
          <td><span :class="['role-badge', u.role]">{{ u.role === 'admin' ? '管理员' : '普通用户' }}</span></td>
          <td>{{ new Date(u.created_at).toLocaleDateString('zh-CN') }}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn-sm btn-ghost" @click="startEditUser(u)">编辑</button>
              <button class="btn-danger-sm" @click="deleteUser(u)" :disabled="u.id === currentUser?.id">删除</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 移动端卡片 -->
    <div v-else-if="users.length" class="mobile-only">
      <div v-for="u in users" :key="u.id" class="mobile-card">
        <div class="mobile-card-header">
          <span><strong>{{ u.username }}</strong></span>
          <span :class="['role-badge', u.role]">{{ u.role === 'admin' ? '管理员' : '用户' }}</span>
        </div>
        <div class="mobile-card-meta">
          <span>{{ u.email }}</span>
          <span>ID: {{ u.id }}</span>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button class="btn-sm btn-ghost" @click="startEditUser(u)">编辑</button>
          <button class="btn-danger-sm" @click="deleteUser(u)" :disabled="u.id === currentUser?.id">删除</button>
        </div>
      </div>
    </div>

    <p v-else class="empty-text">暂无用户</p>

    <!-- 添加用户弹窗 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
      <div class="modal-box glass-panel" style="max-width: 480px; width: 90%;">
        <h3>添加新用户</h3>
        <div v-if="addUserMsg" :class="['msg', addUserError ? 'error-msg' : 'success-msg']">{{ addUserMsg }}</div>
        <div class="input-group">
          <label>用户名</label>
          <input type="text" v-model="newUsername" class="input-field" placeholder="新用户名" />
        </div>
        <div class="input-group">
          <label>邮箱</label>
          <input type="email" v-model="newEmail" class="input-field" placeholder="用户邮箱" />
        </div>
        <div class="input-group">
          <label>手机号</label>
          <input type="text" v-model="newPhone" class="input-field" placeholder="手机号 (可选)" />
        </div>
        <div class="input-group">
          <label>密码</label>
          <input type="password" v-model="newPassword" class="input-field" placeholder="设置密码" />
          <div v-if="newPassword" class="pwd-hints">
            <span :class="{ pass: newPassword.length >= 8 }">• 至少 8 位</span>
            <span :class="{ pass: /[a-z]/.test(newPassword) }">• 小写字母</span>
            <span :class="{ pass: /[A-Z]/.test(newPassword) }">• 大写字母</span>
            <span :class="{ pass: /[0-9]/.test(newPassword) }">• 数字</span>
          </div>
        </div>
        <div class="input-group">
          <label>角色</label>
          <select v-model="newRole" class="input-field">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button @click="addUser" class="btn btn-primary" :disabled="addUserLoading">
            {{ addUserLoading ? '创建中...' : '创建用户' }}
          </button>
          <button @click="closeAddModal" class="btn btn-ghost">取消</button>
        </div>
      </div>
    </div>

    <!-- 编辑用户弹窗 -->
    <div v-if="editingUser" class="modal-overlay" @click.self="cancelEditUser">
      <div class="modal-box glass-panel" style="max-width: 480px; width: 90%;">
        <h3>编辑用户 #{{ editingUser.id }}</h3>
        <div v-if="editUserMsg" class="msg error-msg">{{ editUserMsg }}</div>
        <div class="input-group">
          <label>用户名</label>
          <input type="text" v-model="editUserForm.username" class="input-field" />
        </div>
        <div class="input-group">
          <label>邮箱</label>
          <input type="email" v-model="editUserForm.email" class="input-field" />
        </div>
        <div class="input-group">
          <label>手机号</label>
          <input type="text" v-model="editUserForm.phone" class="input-field" />
        </div>
        <div class="input-group">
          <label>角色</label>
          <select v-model="editUserForm.role" class="input-field">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button @click="saveEditUser" class="btn btn-primary" :disabled="editUserLoading">
            {{ editUserLoading ? '保存中...' : '保存' }}
          </button>
          <button @click="cancelEditUser" class="btn btn-ghost">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
}
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td {
  padding: 12px 14px; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.data-table th { color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 600; }
.data-table td { font-size: 0.9rem; }
.data-table tr:hover td { background: rgba(255, 255, 255, 0.02); }
.role-badge {
  display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.06); color: var(--text-muted);
}
.role-badge.admin { background: rgba(245, 158, 11, 0.15); color: #F59E0B; font-weight: 600; }
.btn-danger-sm {
  background: none; border: 1px solid rgba(239, 68, 68, 0.3); color: #EF4444;
  padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s;
}
.btn-danger-sm:hover:not(:disabled) { background: #EF4444; color: #fff; }
.btn-danger-sm:disabled { opacity: 0.3; cursor: not-allowed; }
.mobile-only { display: none; }
.mobile-card {
  padding: 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05); margin-bottom: 10px;
}
.mobile-card-header { display: flex; justify-content: space-between; align-items: center; }
.mobile-card-meta { display: flex; gap: 8px; align-items: center; margin-top: 8px; font-size: 0.75rem; color: var(--text-muted); }
.loading-text, .empty-text { text-align: center; color: var(--text-muted); padding: 40px; }

/* 弹窗与表单 */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal-box {
  padding: 24px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);
  background: #0f172a;
}
.modal-box h3 { margin-top: 0; margin-bottom: 16px; }
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
  .desktop-only { display: none !important; }
  .mobile-only { display: block !important; }
}
</style>
