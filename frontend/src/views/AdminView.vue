<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { isAdmin, getHeaders } = useAuth()

if (!isAdmin.value) {
  router.push('/')
}

const activeTab = ref('posts')
const posts = ref([])
const users = ref([])
const isLoading = ref(false)

// 添加用户
const newUsername = ref('')
const newPassword = ref('')
const newRole = ref('user')
const addUserMsg = ref('')
const addUserError = ref(false)

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
    if (res.ok) {
      posts.value = posts.value.filter(p => p.id !== id)
    }
  } catch (e) { console.error(e) }
}

async function addUser() {
  if (!newUsername.value || !newPassword.value) {
    addUserMsg.value = '请填写所有字段'
    addUserError.value = true
    return
  }

  try {
    const res = await fetch('/api/auth/users/add', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        username: newUsername.value,
        password: newPassword.value,
        role: newRole.value
      })
    })
    const data = await res.json()

    if (res.ok) {
      addUserMsg.value = '用户创建成功！'
      addUserError.value = false
      newUsername.value = ''
      newPassword.value = ''
      fetchUsers()
    } else {
      addUserMsg.value = data.error || '创建失败'
      addUserError.value = true
    }
  } catch (e) {
    addUserMsg.value = '网络错误'
    addUserError.value = true
  }
}

function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'posts') fetchPosts()
  if (tab === 'users') fetchUsers()
}

onMounted(fetchPosts)
</script>

<template>
  <div class="admin-view">
    <div class="glass-panel sidebar">
      <h3>管理后台</h3>
      <nav>
        <a href="#" :class="{ active: activeTab === 'posts' }" @click.prevent="switchTab('posts')">文章管理</a>
        <a href="#" :class="{ active: activeTab === 'users' }" @click.prevent="switchTab('users')">用户管理</a>
        <a href="#" :class="{ active: activeTab === 'adduser' }" @click.prevent="switchTab('adduser')">添加用户</a>
      </nav>
    </div>

    <div class="content glass-panel">
      <!-- 文章管理 -->
      <div v-if="activeTab === 'posts'">
        <div class="header-actions">
          <h2>文章管理</h2>
          <RouterLink to="/write" class="btn btn-primary">新建文章</RouterLink>
        </div>
        <div v-if="isLoading" class="loading-text">加载中...</div>
        <table v-else-if="posts.length" class="data-table">
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
        <p v-else class="empty-text">暂无文章</p>
      </div>

      <!-- 用户管理 -->
      <div v-if="activeTab === 'users'">
        <h2>用户列表</h2>
        <div v-if="isLoading" class="loading-text">加载中...</div>
        <table v-else-if="users.length" class="data-table">
          <thead>
            <tr><th>ID</th><th>用户名</th><th>角色</th><th>注册时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.id }}</td>
              <td>{{ u.username }}</td>
              <td><span class="role-badge">{{ u.role }}</span></td>
              <td>{{ new Date(u.created_at).toLocaleDateString('zh-CN') }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-text">暂无用户</p>
      </div>

      <!-- 添加用户 -->
      <div v-if="activeTab === 'adduser'">
        <h2>添加新用户</h2>
        <div v-if="addUserMsg" :class="['msg', addUserError ? 'error-msg' : 'success-msg']">{{ addUserMsg }}</div>
        <div class="add-user-form">
          <div class="input-group">
            <label>用户名</label>
            <input type="text" v-model="newUsername" class="input-field" placeholder="新用户名" />
          </div>
          <div class="input-group">
            <label>密码</label>
            <input type="password" v-model="newPassword" class="input-field" placeholder="设置密码" />
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
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 25px;
}

@media (max-width: 768px) {
  .admin-view {
    grid-template-columns: 1fr;
  }
}

.sidebar {
  padding: 25px;
  border-radius: var(--radius-md);
  height: fit-content;
  position: sticky;
  top: calc(var(--header-height) + 20px);
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar h3 {
  margin-top: 0;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 1.1rem;
}

.sidebar nav a {
  display: block;
  padding: 10px 14px;
  margin-bottom: 4px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  transition: all 0.2s;
}

.sidebar nav a:hover, .sidebar nav a.active {
  background: rgba(14, 165, 233, 0.1);
  color: var(--primary);
}

.content {
  padding: 30px;
  border-radius: var(--radius-md);
  min-height: 400px;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

h2 { margin-top: 0; }

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th, .data-table td {
  text-align: left;
  padding: 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.data-table th {
  color: var(--text-muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table td a {
  color: #fff;
}

.data-table td a:hover {
  color: var(--primary);
}

.btn-danger-sm {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.btn-danger-sm:hover {
  background: rgba(239, 68, 68, 0.3);
}

.role-badge {
  background: rgba(14, 165, 233, 0.15);
  color: var(--primary);
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
}

.loading-text, .empty-text {
  color: var(--text-muted);
  text-align: center;
  padding: 40px 0;
}

.add-user-form {
  max-width: 400px;
}

.input-group {
  margin-bottom: 18px;
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
</style>
