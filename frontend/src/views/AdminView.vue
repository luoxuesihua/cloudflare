<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { user, isLoggedIn, isAdmin, getHeaders, setAuth } = useAuth()

// 未登录用户重定向到登录页
if (!isLoggedIn.value) {
  router.push('/login?redirect=/admin')
}

// 默认 Tab：管理员看文章管理，普通用户看个人中心
const activeTab = ref(isAdmin.value ? 'posts' : 'profile')
const posts = ref([])
const users = ref([])
const isLoading = ref(false)

// 来源筛选
const sourceFilter = ref('')
const SOURCE_LIST = [
  '微博热搜', '知乎热榜', '百度热搜',
  '机器之心', '量子位', '36氪 AI', 'HuggingFace 日报', '机器之心精选',
  '掘金前端', '掘金后端', 'V2EX 热门', 'GitHub 趋势', '腾讯云社区', 'HelloGitHub',
  'Solidot', '阮一峰', '开源中国', '博客园', '思否', 'InfoQ', '掘金热榜',
  '虎嗅网', '爱范儿', 'IT之家', '雷锋网', '品玩',
  '美团技术', 'K8s 博客',
  '少数派', '人人都是产品经理', '优设网',
  '财联社电报', '华尔街见闻', '36氪创投'
]

const CATEGORY_LABELS = {
  general: '综合', ai: 'AI前沿', dev: '编程', ops: '运维', product: '产品', biz: '财经'
}

// 批量选择
const selectedIds = ref(new Set())
const isAllSelected = computed(() => posts.value.length > 0 && selectedIds.value.size === posts.value.length)

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(posts.value.map(p => p.id))
  }
}

function toggleSelect(id) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

async function bulkDelete() {
  if (selectedIds.value.size === 0) return
  if (!confirm(`确定要删除选中的 ${selectedIds.value.size} 篇文章吗？此操作不可恢复。`)) return
  try {
    const res = await fetch('/api/posts/bulk-delete', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ids: Array.from(selectedIds.value) })
    })
    if (res.ok) {
      selectedIds.value = new Set()
      fetchPosts()
    } else {
      const data = await res.json()
      alert(data.error || '批量删除失败')
    }
  } catch (e) { alert('网络错误') }
}

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

// ========== 阅读历史 ==========
const readingHistory = ref([])
const historyLoading = ref(false)
const historyTotal = ref(0)
const HISTORY_PAGE_SIZE = 20
const historyOffset = ref(0)

// ========== 兴趣标签编辑 ==========
const interestCategories = [
    { id: 'general', name: '综合资讯', icon: '🌐', color: '#0EA5E9' },
    { id: 'ai', name: 'AI 前沿', icon: '🧠', color: '#8B5CF6' },
    { id: 'dev', name: '编程开发', icon: '💻', color: '#10B981' },
    { id: 'ops', name: '运维架构', icon: '⚙️', color: '#F59E0B' },
    { id: 'product', name: '产品设计', icon: '🎨', color: '#EC4899' },
    { id: 'biz', name: '财经商业', icon: '📈', color: '#EF4444' }
]
const isEditingInterests = ref(false)
const selectedInterests = ref([])
const interestLoading = ref(false)
const interestMsg = ref('')

// ========== 源管理 ==========
const sources = ref([])
const sourcesLoading = ref(false)
const sourceEditing = ref(undefined)   // undefined=关闭, {}=新增, {id:N}=编辑
const sourceForm = ref({
  url: '', name: '', category: 'general', hotScore: 60, lang: 'zh',
  description: '', urlBackup: [], isActive: true, sortOrder: 0
})
const sourceFormMsg = ref('')
const sourceFormError = ref(false)
const sourceFormSaving = ref(false)
const syncingSourceId = ref(null)
const syncAllRunning = ref(false)
const syncResult = ref(null)
const syncProgress = ref(null)   // { processed, total, collected, state }
let syncPollTimer = null

const sourceUrlBackupInput = ref('')

const SOURCE_CATEGORIES = [
  { id: 'general', name: '综合资讯' },
  { id: 'ai', name: 'AI 前沿' },
  { id: 'dev', name: '编程开发' },
  { id: 'ops', name: '运维架构' },
  { id: 'product', name: '产品设计' },
  { id: 'biz', name: '财经商业' }
]

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
      // 更新本地 user 数据；后端改资料会提升 token 版本并重发 token，需同步刷新
      if (data.token) {
        setAuth(data.token, data.user)
      } else if (data.user) {
        user.value = { ...user.value, ...data.user }
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
    items.push({ key: 'sources', label: '源管理' })
    items.push({ key: 'users', label: '用户管理' })
    items.push({ key: 'adduser', label: '添加用户' })
  }
  items.push({ key: 'profile', label: '个人中心' })
  items.push({ key: 'history', label: '阅读历史' })
  items.push({ key: 'changepwd', label: '修改密码' })
  return items
})

async function fetchPosts() {
  isLoading.value = true
  selectedIds.value = new Set()
  try {
    let url = '/api/posts?limit=500'
    if (sourceFilter.value) url += '&source=' + encodeURIComponent(sourceFilter.value)
    const res = await fetch(url)
    const data = await res.json()
    posts.value = Array.isArray(data) ? data : (data.posts || [])
  } catch (e) { console.error(e) }
  finally { isLoading.value = false }
}

function getSourceName(p) {
  if (p.source_name) return p.source_name
  // 从 username 提取: "NewsBot (xxx)" 或 "热搜Bot (xxx)"
  const m = (p.username || '').match(/^(?:NewsBot|热搜Bot)\s*\((.+)\)$/)
  return m ? m[1] : p.username || ''
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

// ========== 源管理函数 ==========

async function fetchSources() {
  sourcesLoading.value = true
  try {
    const res = await fetch('/api/sources', { headers: getHeaders() })
    const data = await res.json()
    sources.value = Array.isArray(data) ? data : []
  } catch (e) { console.error(e) }
  finally { sourcesLoading.value = false }
}

function getCategoryName(catId) {
  const cat = SOURCE_CATEGORIES.find(c => c.id === catId)
  return cat ? cat.name : catId
}

function openAddSource() {
  sourceEditing.value = {}
  sourceForm.value = {
    url: '', name: '', category: 'general', hotScore: 60, lang: 'zh',
    description: '', urlBackup: [], isActive: true, sortOrder: 0
  }
  sourceUrlBackupInput.value = ''
  sourceFormMsg.value = ''
}

function openEditSource(s) {
  sourceEditing.value = s
  sourceForm.value = {
    url: s.url,
    name: s.name,
    category: s.category,
    hotScore: s.hot_score,
    lang: s.lang,
    description: s.description || '',
    urlBackup: Array.isArray(s.url_backup) ? [...s.url_backup] : [],
    isActive: s.is_active,
    sortOrder: s.sort_order || 0
  }
  sourceUrlBackupInput.value = (Array.isArray(s.url_backup) ? s.url_backup : []).join(', ')
  sourceFormMsg.value = ''
}

function closeSourceForm() {
  sourceEditing.value = undefined
  sourceFormMsg.value = ''
}

async function saveSource() {
  const f = sourceForm.value
  if (!f.url || !f.name) {
    sourceFormMsg.value = 'URL 和名称为必填项'
    sourceFormError.value = true
    return
  }
  // Parse urlBackup from comma-separated input
  f.urlBackup = sourceUrlBackupInput.value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  sourceFormSaving.value = true
  sourceFormMsg.value = ''
  try {
    const isEdit = sourceEditing.value && sourceEditing.value.id
    const method = isEdit ? 'PUT' : 'POST'
    const url = isEdit ? `/api/sources/${sourceEditing.value.id}` : '/api/sources'
    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(f)
    })
    const data = await res.json()
    if (res.ok) {
      sourceEditing.value = null
      fetchSources()
    } else {
      sourceFormMsg.value = data.error || '保存失败'
      sourceFormError.value = true
    }
  } catch (e) {
    sourceFormMsg.value = '网络错误'
    sourceFormError.value = true
  } finally {
    sourceFormSaving.value = false
  }
}

async function toggleSourceActive(s) {
  try {
    const res = await fetch(`/api/sources/${s.id}/toggle`, {
      method: 'PUT',
      headers: getHeaders()
    })
    const data = await res.json()
    if (res.ok) {
      s.is_active = data.is_active
    }
  } catch (e) { console.error(e) }
}

async function deleteSource(s) {
  if (!confirm(`确定要删除源 "${s.name}" 吗？此操作不可恢复。`)) return
  try {
    const res = await fetch(`/api/sources/${s.id}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
    if (res.ok) {
      sources.value = sources.value.filter(x => x.id !== s.id)
    } else {
      const data = await res.json()
      alert(data.error || '删除失败')
    }
  } catch (e) { alert('网络错误') }
}

async function syncSource(s) {
  syncingSourceId.value = s.id
  syncResult.value = null
  try {
    const res = await fetch(`/api/sources/${s.id}/sync`, {
      method: 'POST',
      headers: getHeaders()
    })
    const data = await res.json()
    syncResult.value = data
    if (data.success) {
      // 同步成功提示
      alert(`同步「${s.name}」完成，入库 ${data.collected || 0} 条`)
    } else {
      alert(`同步失败: ${data.error || '未知错误'}`)
    }
  } catch (e) { alert('网络错误') }
  finally { syncingSourceId.value = null }
}

async function syncAllSources() {
  if (sources.value.length === 0) {
    alert('没有可同步的源')
    return
  }
  if (!confirm(`确定要同步全部 ${sources.value.length} 个动态源吗？\n\n同步将在后台执行，约需 ${Math.ceil(sources.value.length / 5) * 5} 秒`)) return
  syncAllRunning.value = true
  syncResult.value = null
  syncProgress.value = null

  // 清除旧的轮询定时器
  if (syncPollTimer) clearInterval(syncPollTimer)

  try {
    const res = await fetch('/api/sources/sync-all', {
      method: 'POST',
      headers: getHeaders()
    })
    const data = await res.json()
    syncResult.value = data

    if (data.success) {
      // 后台异步执行，开始轮询进度
      syncProgress.value = {
        total: data.totalSources,
        processed: 0,
        collected: 0,
        state: 'running'
      }

      // 每 2 秒轮询一次进度
      syncPollTimer = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/sources/sync-all/status', {
            headers: getHeaders()
          })
          const status = await statusRes.json()
          syncProgress.value = status

          if (status.state === 'done') {
            clearInterval(syncPollTimer)
            syncPollTimer = null
            syncAllRunning.value = false
            syncProgress.value = null
            alert(`全量同步完成！共入库 ${status.collected || 0} 条`)
            // 刷新文章列表（如果在文章管理 tab 可以顺便刷新）
          } else if (status.state === 'error') {
            clearInterval(syncPollTimer)
            syncPollTimer = null
            syncAllRunning.value = false
            syncProgress.value = null
            alert(`同步出错: ${status.error || '未知错误'}`)
          }
        } catch {
          // 轮询失败不影响
        }
      }, 2000)
    } else {
      syncAllRunning.value = false
      alert(`同步失败: ${data.error || '未知错误'}`)
    }
  } catch (e) {
    syncAllRunning.value = false
    alert('网络错误')
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
  if (tab === 'sources') fetchSources()
  if (tab === 'history') fetchReadingHistory(true)
}

// ========== 阅读历史函数 ==========
async function fetchReadingHistory(reset = false) {
  historyLoading.value = true
  if (reset) {
    readingHistory.value = []
    historyOffset.value = 0
  }
  
  try {
    const res = await fetch(`/api/posts/history?limit=${HISTORY_PAGE_SIZE}&offset=${historyOffset.value}`, {
      headers: getHeaders()
    })
    const data = await res.json()
    readingHistory.value = data.history || []
    historyTotal.value = data.total || 0
  } catch (e) {
    console.error('获取阅读历史失败:', e)
  } finally {
    historyLoading.value = false
  }
}

async function clearHistory() {
  if (!confirm('确定要清空所有阅读历史吗？此操作不可恢复。')) return
  
  try {
    const res = await fetch('/api/posts/history', {
      method: 'DELETE',
      headers: getHeaders()
    })
    if (res.ok) {
      readingHistory.value = []
      historyTotal.value = 0
    }
  } catch (e) {
    alert('清空失败')
  }
}

// ========== 兴趣标签函数 ==========
async function startEditInterests() {
  // 获取当前用户的兴趣标签
  selectedInterests.value = user.value?.interests ? [...user.value.interests] : []
  isEditingInterests.value = true
  interestMsg.value = ''
}

function cancelEditInterests() {
  isEditingInterests.value = false
  selectedInterests.value = []
  interestMsg.value = ''
}

function toggleInterest(catId) {
  const idx = selectedInterests.value.indexOf(catId)
  if (idx > -1) {
    selectedInterests.value.splice(idx, 1)
  } else if (selectedInterests.value.length < 5) {
    selectedInterests.value.push(catId)
  }
}

async function saveInterests() {
  interestLoading.value = true
  interestMsg.value = ''
  
  try {
    const res = await fetch('/api/auth/interests', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ interests: selectedInterests.value })
    })
    
    if (res.ok) {
      const data = await res.json()
      isEditingInterests.value = false
      user.value = { ...user.value, interests: data.interests || [...selectedInterests.value] }
      localStorage.setItem('auth_user', JSON.stringify(user.value))
    } else {
      interestMsg.value = '保存失败，请重试'
    }
  } catch (e) {
    interestMsg.value = '网络错误'
  } finally {
    interestLoading.value = false
  }
}

// 格式化时间
function formatTime(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  
  return new Date(dateStr).toLocaleDateString('zh-CN', { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
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
          <div style="display: flex; gap: 10px; align-items: center;">
            <select v-model="sourceFilter" @change="fetchPosts" class="filter-select">
              <option value="">全部来源</option>
              <option v-for="s in SOURCE_LIST" :key="s" :value="s">{{ s }}</option>
            </select>
            <RouterLink to="/write" class="btn btn-primary btn-sm">新建</RouterLink>
          </div>
        </div>

        <!-- 批量操作工具栏 -->
        <div v-if="selectedIds.size > 0" class="batch-toolbar glass-inner">
          <span>已选择 <strong>{{ selectedIds.size }}</strong> 篇</span>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-ghost btn-sm" @click="toggleSelectAll">{{ isAllSelected ? '取消全选' : '全选' }}</button>
            <button class="btn btn-danger btn-sm" @click="bulkDelete">批量删除</button>
          </div>
        </div>

        <div v-if="isLoading" class="loading-text">加载中...</div>

        <!-- 桌面端表格 -->
        <table v-else-if="posts.length" class="data-table desktop-only">
          <thead>
            <tr>
              <th style="width: 36px;">
                <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="check-input" />
              </th>
              <th>分类</th><th>来源</th><th>标题</th><th>日期</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in posts" :key="p.id">
              <td>
                <input type="checkbox" :checked="selectedIds.has(p.id)" @change="toggleSelect(p.id)" class="check-input" />
              </td>
              <td><span class="cat-tag">{{ CATEGORY_LABELS[p.category] || p.category || '综合' }}</span></td>
              <td><span class="source-tag">{{ getSourceName(p) }}</span></td>
              <td><RouterLink :to="'/post/' + p.id">{{ p.title }}</RouterLink></td>
              <td>{{ new Date(p.created_at).toLocaleDateString('zh-CN') }}</td>
              <td><button class="btn-danger-sm" @click="deletePost(p.id)">删除</button></td>
            </tr>
          </tbody>
        </table>

        <!-- 移动端卡片 -->
        <div v-else-if="posts.length" class="mobile-only">
          <div v-for="p in posts" :key="p.id" class="mobile-card" :class="{ selected: selectedIds.has(p.id) }">
            <div class="mobile-card-header">
              <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                <input type="checkbox" :checked="selectedIds.has(p.id)" @change="toggleSelect(p.id)" class="check-input" />
                <RouterLink :to="'/post/' + p.id" class="mobile-card-title">{{ p.title }}</RouterLink>
              </div>
              <button class="btn-danger-sm" @click="deletePost(p.id)">删除</button>
            </div>
            <div class="mobile-card-meta">
              <span class="cat-tag">{{ CATEGORY_LABELS[p.category] || p.category || '综合' }}</span>
              <span class="source-tag">{{ getSourceName(p) }}</span>
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

      <!-- 源管理 -->
      <div v-if="activeTab === 'sources' && isAdmin">
        <div class="header-actions">
          <h2>源管理</h2>
          <div style="display: flex; gap: 10px; align-items: center;">
            <button @click="syncAllSources" class="btn btn-primary btn-sm" :disabled="syncAllRunning || sources.length === 0">
              {{ syncAllRunning ? '同步中...' : '全部同步' }}
            </button>
            <!-- 进度条 -->
            <div v-if="syncProgress && syncProgress.state === 'running'" class="sync-progress-bar">
              <div class="sync-progress-fill" :style="{ width: (syncProgress.processed / syncProgress.total * 100) + '%' }"></div>
              <span class="sync-progress-text">{{ syncProgress.processed }}/{{ syncProgress.total }} 源，已入库 {{ syncProgress.collected }} 条</span>
            </div>
            <button @click="openAddSource" class="btn btn-primary btn-sm">+ 添加源</button>
          </div>
        </div>

        <div v-if="sourcesLoading" class="loading-text">加载中...</div>

        <!-- 桌面端表格 -->
        <table v-else-if="sources.length" class="data-table desktop-only">
          <thead>
            <tr>
              <th style="width:50px">状态</th>
              <th>名称</th>
              <th>分类</th>
              <th>URL</th>
              <th>热度</th>
              <th style="width:200px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sources" :key="s.id">
              <td>
                <span :class="['status-dot', s.is_active ? 'active' : 'inactive']" :title="s.is_active ? '已启用' : '已停用'"></span>
              </td>
              <td><strong>{{ s.name }}</strong></td>
              <td><span class="cat-tag">{{ getCategoryName(s.category) }}</span></td>
              <td><span class="url-text" :title="s.url">{{ s.url }}</span></td>
              <td>{{ s.hot_score }}</td>
              <td>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                  <button @click="syncSource(s)" class="btn-sm btn-ghost" :disabled="syncingSourceId === s.id">
                    {{ syncingSourceId === s.id ? '...' : '同步' }}
                  </button>
                  <button @click="openEditSource(s)" class="btn-sm btn-ghost">编辑</button>
                  <button @click="toggleSourceActive(s)" class="btn-sm btn-ghost">
                    {{ s.is_active ? '停用' : '启用' }}
                  </button>
                  <button @click="deleteSource(s)" class="btn-danger-sm">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 移动端卡片 -->
        <div v-else-if="sources.length" class="mobile-only">
          <div v-for="s in sources" :key="s.id" class="mobile-card">
            <div class="mobile-card-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span :class="['status-dot', s.is_active ? 'active' : 'inactive']"></span>
                <strong>{{ s.name }}</strong>
              </div>
              <span class="cat-tag">{{ getCategoryName(s.category) }}</span>
            </div>
            <div class="mobile-card-meta">
              <span>热度: {{ s.hot_score }}</span>
              <span>{{ s.url?.substring(0, 40) }}...</span>
            </div>
            <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
              <button @click="syncSource(s)" class="btn-sm btn-ghost" :disabled="syncingSourceId === s.id">
                {{ syncingSourceId === s.id ? '...' : '同步' }}
              </button>
              <button @click="openEditSource(s)" class="btn-sm btn-ghost">编辑</button>
              <button @click="toggleSourceActive(s)" class="btn-sm btn-ghost">
                {{ s.is_active ? '停用' : '启用' }}
              </button>
              <button @click="deleteSource(s)" class="btn-danger-sm">删除</button>
            </div>
          </div>
        </div>

        <p v-else class="empty-text">暂无自定义源，点击「添加源」开始</p>
      </div>

      <!-- 源管理弹窗 -->
      <div v-if="sourceEditing !== undefined" class="modal-overlay" @click.self="closeSourceForm">
        <div class="modal-box glass-panel" style="width: 500px;">
          <h3>{{ sourceEditing && sourceEditing.id ? '编辑源' : '添加源' }}</h3>
          <div v-if="sourceFormMsg" :class="['msg', sourceFormError ? 'error-msg' : 'success-msg']">{{ sourceFormMsg }}</div>

          <div class="input-group">
            <label>名称 <span style="color:#f87171">*</span></label>
            <input type="text" v-model="sourceForm.name" class="input-field" placeholder="如：机器之心" />
          </div>
          <div class="input-group">
            <label>RSS URL <span style="color:#f87171">*</span></label>
            <input type="url" v-model="sourceForm.url" class="input-field" placeholder="https://example.com/rss" />
          </div>
          <div class="input-group">
            <label>描述</label>
            <input type="text" v-model="sourceForm.description" class="input-field" placeholder="简短描述该源" />
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="input-group">
              <label>分类</label>
              <select v-model="sourceForm.category" class="input-field">
                <option v-for="c in SOURCE_CATEGORIES" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div class="input-group">
              <label>热度 (0-100)</label>
              <input type="number" v-model.number="sourceForm.hotScore" class="input-field" min="0" max="100" />
            </div>
          </div>
          <div class="input-group">
            <label>备用 URL（多个用逗号分隔）</label>
            <input type="text" v-model="sourceUrlBackupInput" class="input-field" placeholder="https://backup1.com/rss, https://backup2.com/rss" />
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="input-group">
              <label>语言</label>
              <select v-model="sourceForm.lang" class="input-field">
                <option value="zh">中文</option>
                <option value="en">英文</option>
              </select>
            </div>
            <div class="input-group">
              <label>排序</label>
              <input type="number" v-model.number="sourceForm.sortOrder" class="input-field" min="0" />
            </div>
          </div>
          <div class="input-group">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" v-model="sourceForm.isActive" style="accent-color: var(--primary);" />
              启用此源
            </label>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button @click="saveSource" class="btn btn-primary" :disabled="sourceFormSaving">
              {{ sourceFormSaving ? '保存中...' : '保存' }}
            </button>
            <button @click="closeSourceForm" class="btn btn-ghost">取消</button>
          </div>
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
                
                <!-- 兴趣标签展示/编辑 -->
                <div class="interests-section">
                  <div class="info-row">
                    <span class="label">兴趣标签</span>
                    <span>
                      <template v-if="user?.interests && user.interests.length > 0">
                        <span 
                          v-for="catId in user.interests" 
                          :key="catId"
                          class="mini-interest-tag"
                          :style="{ background: (interestCategories.find(c => c.id === catId) || {}).color + '20', color: (interestCategories.find(c => c.id === catId) || {}).color }"
                        >
                          {{ (interestCategories.find(c => c.id === catId) || {}).name || catId }}
                        </span>
                      </template>
                      <span v-else class="no-interests">未设置</span>
                      <button @click="startEditInterests" class="btn btn-ghost btn-sm" style="margin-left: 8px;">{{ isEditingInterests ? '取消' : '修改' }}</button>
                    </span>
                  </div>
                  
                  <!-- 兴趣标签编辑器 -->
                  <div v-if="isEditingInterests" class="interest-editor">
                    <div v-if="interestMsg" :class="['msg', interestMsg.includes('失败') || interestMsg.includes('错误') ? 'error-msg' : 'success-msg']">{{ interestMsg }}</div>
                    
                    <div class="interest-chips-grid">
                      <button
                        v-for="cat in interestCategories"
                        :key="cat.id"
                        type="button"
                        class="interest-edit-chip"
                        :class="{ selected: selectedInterests.includes(cat.id) }"
                        :style="selectedInterests.includes(cat.id) ? { borderColor: cat.color, background: cat.color + '15' } : {}"
                        @click="toggleInterest(cat.id)"
                      >
                        <span>{{ cat.icon }}</span>
                        <span>{{ cat.name }}</span>
                        <span v-if="selectedInterests.includes(cat.id)" class="chip-check">✓</span>
                      </button>
                    </div>
                    
                    <p class="interest-hint-text">已选 {{ selectedInterests.length }}/5 个标签</p>
                    
                    <div style="display: flex; gap: 10px; margin-top: 16px;">
                      <button @click="saveInterests" class="btn btn-primary btn-sm" :disabled="interestLoading">
                        {{ interestLoading ? '保存中...' : '保存' }}
                      </button>
                      <button @click="cancelEditInterests" class="btn btn-ghost btn-sm">取消</button>
                    </div>
                  </div>
                </div>
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

      <!-- 阅读历史 -->
      <div v-if="activeTab === 'history'" class="profile-section">
        <div class="header-actions">
          <h2>阅读历史</h2>
          <button 
            v-if="historyTotal > 0"
            @click="clearHistory" 
            class="btn btn-danger btn-sm"
          >清空历史</button>
        </div>
        
        <div v-if="historyLoading && readingHistory.length === 0" class="loading-text">加载中...</div>
        
        <div v-else-if="readingHistory.length === 0" class="empty-text">
          <p style="padding: 40px 0;">暂无阅读记录，去首页看看吧~</p>
          <RouterLink to="/" class="btn btn-primary">浏览文章</RouterLink>
        </div>
        
        <div v-else class="history-list glass-inner">
          <div class="history-header-info">
            共 <strong>{{ historyTotal }}</strong> 条阅读记录
          </div>
          
          <div v-for="item in readingHistory" :key="item.id" class="history-item">
            <RouterLink :to="'/post/' + item.post_id" class="history-item-title">
              {{ item.title || '（文章已删除）' }}
            </RouterLink>
            <div class="history-item-meta">
              <span class="history-category" v-if="item.category">
                {{ item.category === 'general' ? '综合' : 
                   item.category === 'ai' ? 'AI前沿' :
                   item.category === 'dev' ? '编程开发' :
                   item.category === 'ops' ? '运维架构' :
                   item.category === 'product' ? '产品设计' : '财经商业' }}
              </span>
              <span class="history-source" v-if="item.source_name">{{ item.source_name }}</span>
              <span class="history-time">{{ formatTime(item.read_at) }}</span>
            </div>
          </div>
          
          <!-- 加载更多 -->
          <div v-if="readingHistory.length < historyTotal" class="load-more-btn-wrapper">
            <button @click="fetchReadingHistory(false)" class="btn btn-ghost btn-sm" :disabled="historyLoading">
              {{ historyLoading ? '加载中...' : '加载更多' }}
            </button>
          </div>
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
  flex-wrap: wrap;
  gap: 10px;
}

/* 同步进度条 */
.sync-progress-bar {
  width: 100%;
  height: 24px;
  background: rgba(255,255,255,0.04);
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  margin-bottom: 4px;
  border: 1px solid rgba(14,165,233,0.2);
}
.sync-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0EA5E9, #8B5CF6);
  border-radius: 6px;
  transition: width 0.6s ease;
  min-width: 2%;
}
.sync-progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.7rem;
  color: #fff;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  white-space: nowrap;
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

/* ===== 批量操作 ===== */
.batch-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  margin-bottom: 14px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 0.88rem;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.3);
}

.check-input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--primary);
}

.mobile-card.selected {
  background: rgba(14, 165, 233, 0.06);
  border-left: 3px solid var(--primary);
}

/* ===== 筛选下拉 ===== */
.filter-select {
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 0.85rem;
  cursor: pointer;
  max-width: 140px;
}

.filter-select:focus {
  outline: none;
  border-color: var(--primary);
}

/* ===== 标签 ===== */
.cat-tag, .source-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.72rem;
  white-space: nowrap;
}

.cat-tag {
  background: rgba(14, 165, 233, 0.12);
  color: var(--primary);
}

.source-tag {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
}

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

/* ===== 源管理 ===== */
.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.active {
  background: #34d399;
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.5);
}
.status-dot.inactive {
  background: #f87171;
}

.url-text {
  display: inline-block;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 0.8rem;
}

/* ===== 兴趣标签 ===== */
.interests-section {
  margin-top: 4px;
}

.mini-interest-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.78rem;
  margin-right: 6px;
  margin-bottom: 4px;
}

.no-interests {
  color: var(--text-muted);
  font-size: 0.85rem;
  font-style: italic;
}

.interest-editor {
  margin-top: 16px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.interest-chips-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.interest-edit-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  color: var(--text-muted);
}

.interest-edit-chip:hover:not(.selected) {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
}

.interest-edit-chip.selected {
  border-color: var(--chip-color, var(--primary));
  background: linear-gradient(135deg, rgba(var(--chip-color-rgb, 14, 165, 233), 0.15), rgba(var(--chip-color-rgb, 14, 165, 233), 0.08));
  color: #fff;
}

.chip-check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--chip-color, var(--primary));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  margin-left: auto;
}

.interest-hint-text {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.82rem;
  margin: 0;
}

/* ===== 阅读历史 ===== */
.history-list {
  max-width: 700px;
}

.history-header-info {
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
  font-size: 0.9rem;
}

.history-item {
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.2s;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.02);
  margin: 0 -24px;
  padding-left: 24px;
  padding-right: 24px;
}

.history-item:last-child {
  border-bottom: none;
}

.history-item-title {
  display: block;
  font-weight: 500;
  font-size: 0.95rem;
  color: var(--text-main);
  text-decoration: none;
  margin-bottom: 6px;
  line-height: 1.4;
  transition: color 0.2s;
}

.history-item-title:hover {
  color: var(--primary);
}

.history-item-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.history-category {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(14, 165, 233, 0.1);
  color: var(--primary);
  font-size: 0.75rem;
}

.history-source::before {
  content: '·';
  margin-right: 12px;
}

.history-time {
  opacity: 0.7;
}

.load-more-btn-wrapper {
  text-align: center;
  padding: 20px 0 8px;
}

/* 浅色主题下的阅读历史和兴趣标签 */
.theme-light .history-item:hover {
  background: rgba(0, 0, 0, 0.02);
}

.theme-light .history-item-title {
  color: #1e293b;
}

.theme-light .history-item-title:hover {
  color: #0284c7;
}

.theme-light .interest-edit-chip {
  border-color: rgba(0, 0, 0, 0.1);
}

.theme-light .interest-editor {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.08);
}

@media (max-width: 768px) {
  .interest-chips-grid {
    grid-template-columns: 1fr;
  }
  
  .history-item:hover {
    margin: 0 -16px;
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
