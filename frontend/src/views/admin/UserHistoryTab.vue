<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const { getHeaders } = useAuth()

const readingHistory = ref([])
const historyLoading = ref(false)
const historyTotal = ref(0)
const HISTORY_PAGE_SIZE = 20
const historyOffset = ref(0)

const CATEGORY_NAMES = {
  general: '综合',
  ai: 'AI前沿',
  dev: '编程开发',
  ops: '运维架构',
  product: '产品设计',
  biz: '财经商业'
}

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
    const list = data.history || []
    if (reset) {
      readingHistory.value = list
    } else {
      readingHistory.value.push(...list)
    }
    historyTotal.value = data.total || 0
    historyOffset.value += list.length
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
      historyOffset.value = 0
    }
  } catch (e) {
    alert('清空失败')
  }
}

onMounted(() => {
  fetchReadingHistory(true)
})
</script>

<template>
  <div class="history-tab">
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
      <RouterLink to="/" class="btn btn-primary btn-sm">浏览文章</RouterLink>
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
            {{ CATEGORY_NAMES[item.category] || item.category }}
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
</template>

<style scoped>
.header-actions {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
}
.history-list {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow: hidden;
}
.history-header-info {
  padding: 12px 18px;
  font-size: 0.82rem;
  color: var(--text-muted);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.history-item {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  transition: background 0.2s;
}
.history-item:hover {
  background: rgba(255, 255, 255, 0.02);
}
.history-item-title {
  font-weight: 500;
  font-size: 0.92rem;
  color: #E2E8F0;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-item-title:hover {
  color: var(--primary);
}
.history-item-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
  font-size: 0.75rem;
}
.history-category {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(14, 165, 233, 0.1);
  color: var(--primary);
}
.history-source {
  color: var(--text-muted);
}
.history-time {
  color: #64748B;
  font-family: var(--font-code);
}
.load-more-btn-wrapper {
  text-align: center;
  padding: 16px;
}
.loading-text, .empty-text {
  text-align: center; color: var(--text-muted); padding: 40px;
}
.btn-danger-sm {
  background: none; border: 1px solid rgba(239, 68, 68, 0.3); color: #EF4444;
  padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;
}
.btn-danger-sm:hover { background: #EF4444; color: #fff; }

@media (max-width: 768px) {
  .history-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
}
</style>
