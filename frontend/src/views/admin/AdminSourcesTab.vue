<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuth } from '../../composables/useAuth'

const { getHeaders } = useAuth()

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
const syncProgress = ref(null)
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

function getCategoryName(catId) {
  const c = SOURCE_CATEGORIES.find(x => x.id === catId)
  return c ? c.name : catId || '综合'
}

async function fetchSources() {
  sourcesLoading.value = true
  try {
    const res = await fetch('/api/sources', { headers: getHeaders() })
    if (res.ok) {
      sources.value = await res.json()
    }
  } catch (e) {
    console.error('获取源列表失败:', e)
  } finally {
    sourcesLoading.value = false
  }
}

function openAddSource() {
  sourceEditing.value = {}
  sourceForm.value = {
    url: '', name: '', category: 'general', hotScore: 60, lang: 'zh',
    description: '', urlBackup: [], isActive: true, sortOrder: 0
  }
  sourceUrlBackupInput.value = ''
  sourceFormMsg.value = ''
  sourceFormError.value = false
}

function openEditSource(s) {
  sourceEditing.value = { id: s.id }
  sourceForm.value = {
    url: s.url, name: s.name, category: s.category, hotScore: s.hot_score,
    lang: s.lang || 'zh', description: s.description || '',
    urlBackup: s.url_backup || [], isActive: s.is_active, sortOrder: s.sort_order || 0
  }
  sourceUrlBackupInput.value = (s.url_backup || []).join(', ')
  sourceFormMsg.value = ''
  sourceFormError.value = false
}

function closeSourceForm() {
  sourceEditing.value = undefined
  sourceFormMsg.value = ''
}

async function saveSource() {
  if (!sourceForm.value.name.trim() || !sourceForm.value.url.trim()) {
    sourceFormMsg.value = '请填写名称和 URL'
    sourceFormError.value = true
    return
  }

  sourceFormSaving.value = true
  sourceFormMsg.value = ''

  const backups = sourceUrlBackupInput.value
    .split(',')
    .map(u => u.trim())
    .filter(u => u.length > 0)

  const payload = {
    ...sourceForm.value,
    urlBackup: backups
  }

  try {
    const isEdit = sourceEditing.value && sourceEditing.value.id
    const url = isEdit ? `/api/sources/${sourceEditing.value.id}` : '/api/sources'
    const method = isEdit ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await res.json()

    if (res.ok) {
      closeSourceForm()
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
    if (res.ok) {
      s.is_active = !s.is_active
    }
  } catch (e) {
    alert('操作失败')
  }
}

async function deleteSource(s) {
  if (!confirm(`确定要删除源「${s.name}」吗？`)) return
  try {
    const res = await fetch(`/api/sources/${s.id}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
    if (res.ok) {
      sources.value = sources.value.filter(item => item.id !== s.id)
    }
  } catch (e) {
    alert('删除失败')
  }
}

async function syncSource(s) {
  syncingSourceId.value = s.id
  try {
    const res = await fetch(`/api/sources/${s.id}/sync`, {
      method: 'POST',
      headers: getHeaders()
    })
    const data = await res.json()
    if (res.ok) {
      alert(`「${s.name}」同步完成，新增入库 ${data.collected} 条`)
    } else {
      alert(`同步失败: ${data.error || '未知错误'}`)
    }
  } catch (e) {
    alert('同步网络请求失败')
  } finally {
    syncingSourceId.value = null
  }
}

async function syncAllSources() {
  if (syncAllRunning.value) return
  syncAllRunning.value = true
  syncProgress.value = { processed: 0, total: sources.value.length, collected: 0, state: 'running' }

  try {
    const res = await fetch('/api/sources/sync-all', {
      method: 'POST',
      headers: getHeaders()
    })
    const data = await res.json()

    if (res.ok) {
      pollSyncStatus()
    } else {
      alert(data.error || '启动全量同步失败')
      syncAllRunning.value = false
      syncProgress.value = null
    }
  } catch (e) {
    alert('启动同步网络异常')
    syncAllRunning.value = false
    syncProgress.value = null
  }
}

function pollSyncStatus() {
  if (syncPollTimer) clearInterval(syncPollTimer)
  syncPollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/sources/sync-all/status', {
        headers: getHeaders()
      })
      if (!res.ok) return
      const status = await res.json()
      syncProgress.value = status

      if (status.state === 'done') {
        clearInterval(syncPollTimer)
        syncPollTimer = null
        syncAllRunning.value = false
        alert(`全量同步完成！共抓取 ${status.collected} 篇新文章`)
        setTimeout(() => { syncProgress.value = null }, 8000)
      } else if (status.state === 'error') {
        clearInterval(syncPollTimer)
        syncPollTimer = null
        syncAllRunning.value = false
        alert(`同步过程发生错误: ${status.error}`)
      }
    } catch {}
  }, 2000)
}

onMounted(() => {
  fetchSources()
})

onUnmounted(() => {
  if (syncPollTimer) clearInterval(syncPollTimer)
})
</script>

<template>
  <div class="sources-tab">
    <div class="header-actions">
      <h2>源管理</h2>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <button @click="syncAllSources" class="btn btn-primary btn-sm" :disabled="syncAllRunning || sources.length === 0">
          {{ syncAllRunning ? '同步中...' : '全部同步' }}
        </button>
        <!-- 进度条 -->
        <div v-if="syncProgress && syncProgress.state === 'running'" class="sync-progress-bar">
          <div class="sync-progress-fill" :style="{ width: (syncProgress.processed / (syncProgress.total || 1) * 100) + '%' }"></div>
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
          <span>{{ s.url?.substring(0, 35) }}...</span>
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

    <!-- 源管理弹窗 -->
    <div v-if="sourceEditing !== undefined" class="modal-overlay" @click.self="closeSourceForm">
      <div class="modal-box glass-panel" style="max-width: 500px; width: 90%;">
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
  </div>
</template>

<style scoped>
.header-actions {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
}
.sync-progress-bar {
  width: 220px; height: 24px; background: rgba(255,255,255,0.04);
  border-radius: 6px; overflow: hidden; position: relative;
  border: 1px solid rgba(14,165,233,0.2);
}
.sync-progress-fill {
  height: 100%; background: linear-gradient(90deg, #0EA5E9, #8B5CF6);
  border-radius: 6px; transition: width 0.6s ease; min-width: 2%;
}
.sync-progress-text {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 0.7rem; color: #fff; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  white-space: nowrap;
}
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td {
  padding: 12px 14px; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.data-table th { color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 600; }
.data-table td { font-size: 0.9rem; }
.data-table tr:hover td { background: rgba(255, 255, 255, 0.02); }
.status-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px;
}
.status-dot.active { background: #10B981; box-shadow: 0 0 6px rgba(16,185,129,0.5); }
.status-dot.inactive { background: #64748B; }
.cat-tag {
  display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;
  background: rgba(14, 165, 233, 0.1); color: var(--primary); font-weight: 500;
}
.url-text {
  font-family: var(--font-code); font-size: 0.8rem; color: var(--text-muted);
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block;
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
.mobile-card-header { display: flex; justify-content: space-between; align-items: center; }
.mobile-card-meta { display: flex; gap: 8px; align-items: center; margin-top: 8px; font-size: 0.75rem; color: var(--text-muted); }
.loading-text, .empty-text { text-align: center; color: var(--text-muted); padding: 40px; }

/* 弹窗 */
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
.msg { padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem; }
.error-msg { background: rgba(239, 68, 68, 0.1); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.2); }
.success-msg { background: rgba(16, 185, 129, 0.1); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.2); }

@media (max-width: 768px) {
  .desktop-only { display: none !important; }
  .mobile-only { display: block !important; }
}
</style>
