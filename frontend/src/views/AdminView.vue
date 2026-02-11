<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { user, isLoggedIn, isAdmin, getHeaders } = useAuth()

// 未登录用户重定向到登录页
if (!isLoggedIn.value) {
  router.push('/login?redirect=/admin')
}

// 默认 Tab：管理员看文章管理，普通用户看个人中心
const activeTab = ref(isAdmin.value ? 'posts' : 'profile')
const posts = ref([])
const users = ref([])
const isLoading = ref(false)

// 添加用户相关
const newUsername = ref('')
const newPassword = ref('')
const newEmail = ref('')
const newPhone = ref('')
const newRole = ref('user')
const addUserMsg = ref('')
const addUserError = ref(false)

// 编辑用户相关
const editingUser = ref(null)
const editUserForm = ref({ username: '', email: '', phone: '', role: 'user' })
const editUserMsg = ref('')
const editUserLoading = ref(false)

// 修改密码相关
const oldPassword = ref('')
const newPwd = ref('')
const pwdLoading = ref(false)
const pwdMessage = ref('')
const pwdIsError = ref(false)

// 个人信息编辑
const isEditing = ref(false)
const editForm = ref({ username: '', email: '', phone: '' })
const editLoading = ref(false)
const editMsg = ref('')

function startEdit() {
  editForm.value = {
    username: user.value.username,
    email: user.value.email,
    phone: user.value.phone || ''
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
      // 更新本地 user 数据
      if (data.user) {
        user.value = { ...user.value, ...data.user }
        // 更新 localStorage (简单处理，useAuth 可能需要暴露 setAuth 但这里直接改 ref 也行，刷新后会重新 fetch /me)
        localStorage.setItem('auth_user', JSON.stringify(user.value))
      }
      isEditing.value = false
      alert('修改成功！')
    } else {
      editMsg.value = data.error || '保存失败'
    }
  } catch (e) {
    editMsg.value = '网络错误'
  } finally {
    editLoading.value = false
  }
}

// 侧边栏菜单项（根据角色动态生成）
const menuItems = computed(() => {
  const items = []
  if (isAdmin.value) {
    items.push({ key: 'posts', label: '文章管理' })
    items.push({ key: 'users', label: '用户管理' })
    items.push({ key: 'adduser', label: '添加用户' })
  }
  items.push({ key: 'profile', label: '个人中心' })
  items.push({ key: 'changepwd', label: '修改密码' })
  return items
})

async function fetchPosts() {
  isLoading.value = true
  try {
    const res = await fetch('/api/posts')
    posts.value = await res.json()
  } catch (e) { console.error(e) }
  finally { isLoading.value = false }
}

async function fetchUsers() {
  isLoading.value = true
  try {
    const res = await fetch('/api/auth/users', { headers: getHeaders() })
    users.value = await res.json()
  } catch (e) { console.error(e) }
  finally { isLoading.value = false }
}

async function deletePost(id) {
  if (!confirm('确定要删除这篇文章吗？')) return
  try {
    const res = await fetch(`/api/posts/${id}`, { method: 'DELETE', headers: getHeaders() })
    if (res.ok) posts.value = posts.value.filter(p => p.id !== id)
  } catch (e) { console.error(e) }
}

async function addUser() {
  if (!newUsername.value || !newPassword.value || !newEmail.value) {
    addUserMsg.value = '请填写必要字段 (用户名, 密码, 邮箱)'; addUserError.value = true; return
  }
  try {
    const res = await fetch('/api/auth/users/add', {
      method: 'POST', headers: getHeaders(),
      body: JSON.stringify({
        username: newUsername.value,
        password: newPassword.value,
        email: newEmail.value,
        phone: newPhone.value,
        role: newRole.value
      })
    })
    const data = await res.json()
    if (res.ok) {
      addUserMsg.value = '用户创建成功！'; addUserError.value = false
      newUsername.value = ''; newPassword.value = ''; newEmail.value = ''; newPhone.value = '';
      fetchUsers()
    } else {
      addUserMsg.value = data.error || '创建失败'; addUserError.value = true
    }
  } catch (e) { addUserMsg.value = '网络错误'; addUserError.value = true }
}

function startEditUser(u) {
  editingUser.value = u
  editUserForm.value = { username: u.username, email: u.email || '', phone: u.phone || '', role: u.role }
  editUserMsg.value = ''
}

function cancelEditUser() {
  editingUser.value = null
  editUserMsg.value = ''
}

async function saveEditUser() {
  if (!editUserForm.value.username || !editUserForm.value.email) {
    editUserMsg.value = '用户名和邮箱不能为空'; return
  }
  editUserLoading.value = true
  editUserMsg.value = ''
  try {
    const res = await fetch(`/api/auth/users/${editingUser.value.id}`, {
      method: 'PUT', headers: getHeaders(),
      body: JSON.stringify(editUserForm.value)
    })
    const data = await res.json()
    if (res.ok) {
      editingUser.value = null
      fetchUsers()
    } else {
      editUserMsg.value = data.error || '保存失败'
    }
  } catch (e) { editUserMsg.value = '网络错误' }
  finally { editUserLoading.value = false }
}

async function deleteUser(u) {
  if (!confirm(`确定要删除用户 "${u.username}" 吗？此操作不可恢复。`)) return
  try {
    const res = await fetch(`/api/auth/users/${u.id}`, { method: 'DELETE', headers: getHeaders() })
    const data = await res.json()
    if (res.ok) {
      users.value = users.value.filter(x => x.id !== u.id)
    } else {
      alert(data.error || '删除失败')
    }
  } catch (e) { alert('网络错误') }
}

async function changePassword() {
  if (!oldPassword.value || !newPwd.value) {
    pwdMessage.value = '请填写所有字段'
    pwdIsError.value = true
    return
  }
  pwdLoading.value = true
  pwdMessage.value = ''
  try {
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ oldPassword: oldPassword.value, newPassword: newPwd.value })
    })
    const data = await res.json()
    if (res.ok) {
      pwdMessage.value = '密码修改成功！'
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

function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'posts') fetchPosts()
  if (tab === 'users') fetchUsers()
}

onMounted(() => {
  if (isAdmin.value) fetchPosts()
})
</script>

<template>
  <div class="admin-view">
    <!-- 移动端 Tab 条 -->
    <div class="mobile-tabs">
      <button
        v-for="item in menuItems"
        :key="item.key"
        :class="{ active: activeTab === item.key }"
        @click="switchTab(item.key)"
      >{{ item.label }}</button>
    </div>

    <!-- 桌面端侧边栏 -->
    <div class="sidebar glass-panel">
      <h3>{{ isAdmin ? '管理后台' : '用户面板' }}</h3>
      <nav>
        <a
          v-for="item in menuItems"
          :key="item.key"
          href="#"
          :class="{ active: activeTab === item.key }"
          @click.prevent="switchTab(item.key)"
        >{{ item.label }}</a>
      </nav>
    </div>

    <div class="content glass-panel">
      <!-- 文章管理 -->
      <div v-if="activeTab === 'posts' && isAdmin">
        <div class="header-actions">
          <h2>文章管理</h2>
          <RouterLink to="/write" class="btn btn-primary">新建</RouterLink>
        </div>
        <div v-if="isLoading" class="loading-text">加载中...</div>

        <!-- 桌面端表格 -->
        <table v-else-if="posts.length" class="data-table desktop-only">
          <thead>
            <tr><th>ID</th><th>标题</th><th>作者</th><th>日期</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in posts" :key="p.id">
              <td>{{ p.id }}</td>
              <td><RouterLink :to="'/post/' + p.id">{{ p.title }}</RouterLink></td>
              <td>{{ p.username }}</td>
              <td>{{ new Date(p.created_at).toLocaleDateString('zh-CN') }}</td>
              <td><button class="btn-danger-sm" @click="deletePost(p.id)">删除</button></td>
            </tr>
          </tbody>
        </table>

        <!-- 移动端卡片 -->
        <div v-else-if="posts.length" class="mobile-only">
          <div v-for="p in posts" :key="p.id" class="mobile-card">
            <div class="mobile-card-header">
              <RouterLink :to="'/post/' + p.id" class="mobile-card-title">{{ p.title }}</RouterLink>
              <button class="btn-danger-sm" @click="deletePost(p.id)">删除</button>
            </div>
            <div class="mobile-card-meta">
              <span>@{{ p.username }}</span>
              <span>{{ new Date(p.created_at).toLocaleDateString('zh-CN') }}</span>
            </div>
          </div>
        </div>

        <p v-else class="empty-text">暂无文章</p>
      </div>

      <!-- 用户管理 -->
      <div v-if="activeTab === 'users' && isAdmin">
        <h2>用户列表</h2>
        <div v-if="isLoading" class="loading-text">加载中...</div>

        <table v-else-if="users.length" class="data-table desktop-only">
          <thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>手机号</th><th>角色</th><th>注册时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.id }}</td><td>{{ u.username }}</td>
              <td>{{ u.email }}</td><td>{{ u.phone }}</td>
              <td><span class="role-badge">{{ u.role }}</span></td>
              <td>{{ new Date(u.created_at).toLocaleDateString('zh-CN') }}</td>
              <td>
                <div style="display: flex; gap: 6px;">
                  <button class="btn-sm btn-ghost" @click="startEditUser(u)">编辑</button>
                  <button class="btn-danger-sm" @click="deleteUser(u)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-else-if="users.length" class="mobile-only">
          <div v-for="u in users" :key="u.id" class="mobile-card">
            <div class="mobile-card-header">
              <span>{{ u.username }}</span>
              <span class="role-badge">{{ u.role }}</span>
            </div>
            <div class="mobile-card-meta">
              <span>{{ u.email }}</span>
              <span>ID: {{ u.id }}</span>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <button class="btn-sm btn-ghost" @click="startEditUser(u)">编辑</button>
              <button class="btn-danger-sm" @click="deleteUser(u)">删除</button>
            </div>
          </div>
        </div>

        <p v-else class="empty-text">暂无用户</p>

        <!-- 编辑用户弹窗 -->
        <div v-if="editingUser" class="modal-overlay" @click.self="cancelEditUser">
          <div class="modal-box glass-panel">
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

      <!-- 添加用户 -->
      <div v-if="activeTab === 'adduser' && isAdmin">
        <h2>添加新用户</h2>
        <div v-if="addUserMsg" :class="['msg', addUserError ? 'error-msg' : 'success-msg']">{{ addUserMsg }}</div>
        <div class="add-user-form">
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
          <button @click="addUser" class="btn btn-primary">创建用户</button>
        </div>
      </div>

      <!-- 个人中心 -->
      <div v-if="activeTab === 'profile'" class="profile-section">
        <h2>个人中心</h2>

        <!-- 用户信息 -->
        <div class="profile-grid">
          <div class="profile-info-card glass-inner" style="grid-column: span 2;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>用户信息</h3>
                <button v-if="!isEditing" @click="startEdit" class="btn btn-ghost btn-sm">编辑</button>
            </div>
            
            <div v-if="editMsg" class="msg error-msg">{{ editMsg }}</div>

            <div v-if="!isEditing">
                <div class="info-row"><span class="label">用户名</span><span>{{ user?.username }}</span></div>
                <div class="info-row"><span class="label">邮箱</span><span>{{ user?.email }}</span></div>
                <div class="info-row"><span class="label">手机号</span><span>{{ user?.phone || '未设置' }}</span></div>
                <div class="info-row"><span class="label">用户 ID</span><span>{{ user?.id }}</span></div>
                <div class="info-row"><span class="label">角色</span><span class="role-badge">{{ user?.role }}</span></div>
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
                    <button @click="saveProfile" class="btn btn-primary" :disabled="editLoading">
                        {{ editLoading ? '保存中...' : '保存' }}
                    </button>
                    <button @click="cancelEdit" class="btn btn-ghost">取消</button>
                </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 修改密码 -->
      <div v-if="activeTab === 'changepwd'" class="profile-section">
        <h2>修改密码</h2>
        <div class="profile-pwd-card glass-inner" style="max-width: 500px;">
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
            <button @click="changePassword" class="btn btn-primary" :disabled="pwdLoading">
              {{ pwdLoading ? '更新中...' : '更新密码' }}
            </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
}

.mobile-tabs { display: none; }

/* ===== 侧边栏 ===== */
.sidebar {
  padding: 22px;
  border-radius: var(--radius-md);
  height: fit-content;
  position: sticky;
  top: calc(var(--header-height) + 20px);
}

.sidebar h3 {
  margin-top: 0; margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 1rem;
}

.sidebar nav a {
  display: block; padding: 10px 12px; margin-bottom: 3px;
  border-radius: var(--radius-sm); color: var(--text-muted); transition: all 0.2s;
}

.sidebar nav a:hover, .sidebar nav a.active {
  background: rgba(14, 165, 233, 0.1); color: var(--primary);
}

/* ===== 内容区 ===== */
.content {
  padding: 28px;
  border-radius: var(--radius-md);
  min-height: 350px;
}

.header-actions {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
}

h2 { margin-top: 0; }

/* ===== 表格 ===== */
.data-table { width: 100%; border-collapse: collapse; }

.data-table th, .data-table td {
  text-align: left; padding: 11px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.data-table th {
  color: var(--text-muted); font-size: 0.8rem;
  text-transform: uppercase; letter-spacing: 0.5px;
}

.data-table td a { color: #fff; }
.data-table td a:hover { color: var(--primary); }

/* ===== 移动端卡片 ===== */
.mobile-card {
  padding: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.mobile-card-header {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
}

.mobile-card-title {
  color: #fff; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.mobile-card-meta {
  display: flex; justify-content: space-between; margin-top: 6px;
  color: var(--text-muted); font-size: 0.8rem;
}

/* ===== 通用 ===== */
.btn-danger-sm {
  background: rgba(239, 68, 68, 0.15); color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 5px 12px; border-radius: 6px; cursor: pointer;
  font-size: 0.78rem; transition: all 0.2s; white-space: nowrap;
}

.btn-danger-sm:hover { background: rgba(239, 68, 68, 0.3); }

.role-badge {
  background: rgba(14, 165, 233, 0.15); color: var(--primary);
  padding: 2px 10px; border-radius: 20px; font-size: 0.8rem;
}

.loading-text, .empty-text { color: var(--text-muted); text-align: center; padding: 35px 0; }

.add-user-form { max-width: 400px; }

.input-group { margin-bottom: 16px; }
label { display: block; margin-bottom: 6px; color: var(--text-muted); font-size: 0.88rem; }

.input-field {
  width: 100%; padding: 12px;
  background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff; border-radius: var(--radius-sm);
  font-family: var(--font-body); transition: all 0.3s; box-sizing: border-box;
}

.input-field:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 15px rgba(14, 165, 233, 0.2); }

.msg { padding: 10px 15px; border-radius: 8px; margin-bottom: 18px; font-size: 0.88rem; }
.error-msg { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; }
.success-msg { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #6ee7b7; }

.desktop-only { display: table; }
.mobile-only { display: none; }

/* ===== 个人中心 ===== */
.profile-section h2 {
  margin-bottom: 24px;
}

.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.glass-inner {
  padding: 24px;
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.glass-inner h3 {
  margin-top: 0;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.95rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.info-row .label {
  color: var(--text-muted);
}

/* ===== 移动端 ===== */
@media (max-width: 768px) {
  .admin-view {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .sidebar { display: none; }

  .mobile-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 16px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .mobile-tabs button {
    flex: 1;
    padding: 12px;
    background: rgba(15, 23, 42, 0.6);
    color: var(--text-muted);
    border: none;
    font-family: var(--font-body);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-tabs button.active {
    background: rgba(14, 165, 233, 0.15);
    color: var(--primary);
  }

  .content { padding: 20px 16px; }
  .desktop-only { display: none !important; }
  .mobile-only { display: block !important; }
  .add-user-form { max-width: 100%; }

  .profile-grid {
    grid-template-columns: 1fr;
  }

  .modal-box {
    width: 90vw !important;
    max-width: 90vw !important;
  }
}

/* ===== 弹窗 ===== */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.modal-box {
  width: 420px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  padding: 30px;
  border-radius: var(--radius-md);
}

.modal-box h3 {
  margin-top: 0;
  margin-bottom: 20px;
}

/* ===== 密码提示 ===== */
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

/* ===== 小按钮 ===== */
.btn-sm {
  padding: 5px 12px;
  font-size: 0.78rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
</style>
