<script setup>
import { ref, onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const { getHeaders } = useAuth()

const posts = ref([])
const isLoading = ref(false)
const sourceFilter = ref('')
const selectedIds = ref(new Set())

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

function getSourceName(post) {
  if (post.source_name) return post.source_name
  if (post.username && post.username.startsWith('NewsBot (')) {
    return post.username.substring(9, post.username.length - 1)
  }
  if (post.username && post.username.startsWith('热搜Bot (')) {
    return post.username.substring(6, post.username.length - 1)
  }
  return post.username || '原创'
}

async function fetchPosts() {
  isLoading.value = true
  selectedIds.value = new Set()
  try {
    let url = '/api/posts?limit=100'
    if (sourceFilter.value) {
      url += `&source=${encodeURIComponent(sourceFilter.value)}`
    }
    const res = await fetch(url, { headers: getHeaders() })
    const data = await res.json()
    posts.value = data.posts || data || []
  } catch (e) {
    console.error('获取文章失败:', e)
  } finally {
    isLoading.value = false
  }
}

async function deletePost(id) {
  if (!confirm('确定要删除这篇文章吗？此操作不可恢复。')) return
  try {
    const res = await fetch(`/api/posts/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
    if (res.ok) {
      posts.value = posts.value.filter(p => p.id !== id)
      selectedIds.value.delete(id)
    } else {
      const data = await res.json()
      alert(data.error || '删除失败')
    }
  } catch (e) {
    alert('网络错误')
  }
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
  } catch (e) {
    alert('网络错误')
  }
}

onMounted(() => {
  fetchPosts()
})
</script>

<template>
  <div class="posts-tab">
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
</template>

<style scoped>
.header-actions {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
}
.batch-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 16px; margin-bottom: 16px; border-radius: 8px;
  background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.2);
}
.filter-select {
  padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.8); color: #fff; font-size: 0.85rem; outline: none;
}
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td {
  padding: 12px 14px; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.data-table th { color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 600; }
.data-table td { font-size: 0.9rem; }
.data-table tr:hover td { background: rgba(255, 255, 255, 0.02); }
.check-input { width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer; }
.cat-tag {
  display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;
  background: rgba(14, 165, 233, 0.1); color: var(--primary); font-weight: 500;
}
.source-tag {
  display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.06); color: var(--text-muted);
}
.btn-danger-sm {
  background: none; border: 1px solid rgba(239, 68, 68, 0.3); color: #EF4444;
  padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s;
}
.btn-danger-sm:hover { background: #EF4444; color: #fff; }
.mobile-only { display: none; }
.mobile-card {
  padding: 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05); margin-bottom: 10px;
}
.mobile-card.selected { border-color: var(--primary); background: rgba(14, 165, 233, 0.05); }
.mobile-card-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.mobile-card-title { font-weight: 500; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mobile-card-meta { display: flex; gap: 8px; align-items: center; margin-top: 8px; font-size: 0.75rem; color: var(--text-muted); }
.loading-text, .empty-text { text-align: center; color: var(--text-muted); padding: 40px; }

@media (max-width: 768px) {
  .desktop-only { display: none !important; }
  .mobile-only { display: block !important; }
}
</style>
