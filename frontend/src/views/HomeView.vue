<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const posts = ref([])
const isLoading = ref(true)
const route = useRoute()
const router = useRouter()

// 当前筛选状态
const currentCategory = ref(route.query.category || '')
const currentSource = ref('')
const sortMode = ref('hot_score') // hot_score | created_at
const currentTag = ref(route.query.tag || '')

// 分类统计
const categoryStats = ref({})

// ===== 分类定义 =====
const categories = [
  { id: '',        name: '全部',   icon: '📰', color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0EA5E9, #2563EB)' },
  { id: 'general', name: '综合资讯', icon: '🌐', color: '#0EA5E9', gradient: 'linear-gradient(135deg, #0284C7, #0EA5E9)' },
  { id: 'ai',      name: 'AI 前沿', icon: '🧠', color: '#8B5CF6', gradient: 'linear-gradient(135deg, #7C3AED, #A78BFA)' },
  { id: 'dev',     name: '编程开发', icon: '💻', color: '#10B981', gradient: 'linear-gradient(135deg, #059669, #34D399)' },
  { id: 'ops',     name: '运维架构', icon: '⚙️', color: '#F59E0B', gradient: 'linear-gradient(135deg, #D97706, #FBBF24)' },
  { id: 'product', name: '产品设计', icon: '🎨', color: '#EC4899', gradient: 'linear-gradient(135deg, #DB2777, #F472B6)' },
  { id: 'biz',     name: '财经商业', icon: '📈', color: '#EF4444', gradient: 'linear-gradient(135deg, #DC2626, #F87171)' }
]

// 当前选中分类对象
const activeCategory = computed(() => categories.find(c => c.id === currentCategory.value) || categories[0])

// 新闻源列表（供筛选）
const sources = computed(() => {
  const set = new Set()
  posts.value.forEach(p => {
    const src = extractSource(p.username)
    if (src) set.add(src)
  })
  return [...set].sort()
})

// ===== 数据获取 =====
async function fetchPosts() {
  isLoading.value = true
  try {
    const params = new URLSearchParams()
    if (currentCategory.value) params.set('category', currentCategory.value)
    if (currentSource.value) params.set('source', currentSource.value)
    if (currentTag.value) params.set('tag', currentTag.value)
    params.set('sort', sortMode.value)
    params.set('limit', '100')

    const res = await fetch(`/api/posts?${params.toString()}`)
    const data = await res.json()
    posts.value = data.posts || data
  } catch (e) {
    console.error('获取文章失败', e)
  } finally {
    isLoading.value = false
  }
}

async function fetchStats() {
  try {
    const res = await fetch('/api/posts/stats')
    const data = await res.json()
    const map = {}
    let total = 0
    data.forEach(d => { map[d.category] = d.count; total += d.count })
    map[''] = total
    categoryStats.value = map
  } catch { /* silent */ }
}

function switchCategory(catId) {
  currentCategory.value = catId
  currentSource.value = ''
  currentTag.value = ''
  router.replace({ query: catId ? { category: catId } : {} })
}

function toggleSort() {
  sortMode.value = sortMode.value === 'hot_score' ? 'created_at' : 'hot_score'
}

function filterBySource(source) {
  currentSource.value = currentSource.value === source ? '' : source
}

function filterByTag(tag) {
  currentTag.value = tag
  currentCategory.value = ''
}

function clearAllFilters() {
  currentCategory.value = ''
  currentSource.value = ''
  currentTag.value = ''
  sortMode.value = 'hot_score'
  router.replace({ query: {} })
}

// 工具函数
function extractSource(username) {
  if (username?.startsWith('NewsBot (')) return username.substring(9, username.length - 1)
  if (username?.startsWith('热搜Bot (')) return username.substring(6, username.length - 1)
  return null
}

function getSourceStyle(username) {
  const source = extractSource(username)
  if (!source) return {}
  const colorMap = {
    'Solidot': '#10B981', '机器之心': '#8B5CF6', '掘金热榜': '#2563EB',
    '掘金前端': '#3B82F6', '掘金后端': '#6366F1', 'InfoQ': '#E11D48',
    '阮一峰': '#F97316', '开源中国': '#22C55E', '博客园': '#0284C7',
    '思否': '#0D9488', '美团技术': '#EAB308', 'V2EX 热门': '#6B7280',
    'GitHub 趋势': '#1F2937', '财联社电报': '#DC2626', '华尔街见闻': '#B91C1C',
    '少数派': '#EC4899', '36氪 AI': '#3B82F6', '36氪创投': '#F59E0B',
    'HuggingFace 日报': '#F97316', 'K8s 博客': '#326CE5',
    '机器之心精选': '#7C3AED', '优设网': '#F43F5E',
    '微博热搜': '#E6162D', '知乎热榜': '#0066FF', '百度热搜': '#DE2512'
  }
  return { color: colorMap[source] || '#94A3B8' }
}

function getHotLevel(score) {
  if (!score || score >= 85) return { label: '爆', cls: 'hot-boom', icon: '💥' }
  if (score >= 70) return { label: '热', cls: 'hot-fire', icon: '🔥' }
  if (score >= 55) return { label: '新', cls: 'hot-warm', icon: '⚡' }
  return null
}

function getExcerpt(snippet) {
  if (!snippet) return ''
  let text = snippet.replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*`_>\-]/g, '')
    .replace(/\s+/g, ' ').trim()
  return text.length > 100 ? text.substring(0, 100) + '...' : text
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function hasFilter() {
  return currentCategory.value || currentSource.value || currentTag.value
}

watch([currentCategory, currentSource, currentTag, sortMode], () => {
  fetchPosts()
})

onMounted(() => {
  fetchPosts()
  fetchStats()
})
</script>

<template>
  <div class="home">
    <!-- 英雄区 -->
    <div class="hero">
      <h1>
        <span class="gradient-text">万象</span>新闻
        <span class="sub-dot">·</span>
      </h1>
      <p class="hero-desc">
        聚合 <strong class="accent">30+</strong> 优质信息源，
        覆盖 <strong class="accent">6</strong> 大领域，
        智能采集 · 实时热榜 · 一文尽览
      </p>
    </div>

    <!-- 分类 Tab + 工具栏 -->
    <div class="toolbar">
      <div class="category-tabs">
        <button
          v-for="cat in categories" :key="cat.id"
          class="cat-tab"
          :class="{ active: currentCategory === cat.id }"
          @click="switchCategory(cat.id)"
          :style="currentCategory === cat.id ? { '--cat-color': cat.color } : {}"
        >
          <span class="cat-icon">{{ cat.icon }}</span>
          <span class="cat-name">{{ cat.name }}</span>
          <span v-if="categoryStats[cat.id]" class="cat-count">{{ categoryStats[cat.id] }}</span>
        </button>
      </div>

      <div class="toolbar-actions">
        <button class="sort-btn" @click="toggleSort" :title="sortMode === 'hot_score' ? '按热度排序' : '按时间排序'">
          <span v-if="sortMode === 'hot_score'">🔥 热度</span>
          <span v-else>🕐 最新</span>
        </button>

        <div class="source-filter" v-if="sources.length > 0">
          <select v-model="currentSource" class="source-select">
            <option value="">📡 全部来源</option>
            <option v-for="s in sources" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <button v-if="hasFilter()" class="clear-btn" @click="clearAllFilters">✕ 清空筛选</button>
      </div>
    </div>

    <!-- 当前筛选状态 -->
    <div v-if="currentTag" class="filter-banner glass">
      <span>🏷️ 标签：<strong>#{{ currentTag }}</strong></span>
    </div>

    <!-- 加载中 -->
    <div v-if="isLoading" class="loading">
      <div class="spinner"></div>
      <p>正在加载资讯...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="posts.length === 0" class="empty-state">
      <div class="empty-icon">📭</div>
      <p>暂无内容，换个分类试试？</p>
    </div>

    <!-- 文章卡片网格 (仿 NewsNow 布局) -->
    <div v-else class="news-grid">
      <article
        v-for="post in posts" :key="post.id"
        class="news-card"
        :class="{ 'is-hot': (post.hot_score || 50) >= 75 }"
      >
        <!-- 顶部色条 -->
        <div class="card-topbar" :style="{ background: (getSourceStyle(post.username).color || '#0EA5E9') }"></div>

        <!-- 热度标识 -->
        <span v-if="getHotLevel(post.hot_score)" class="hot-badge" :class="getHotLevel(post.hot_score)?.cls">
          {{ getHotLevel(post.hot_score)?.icon }} {{ getHotLevel(post.hot_score)?.label }}
        </span>

        <!-- 内容区 -->
        <div class="card-body">
          <div class="card-meta">
            <span class="source-tag" :style="{ color: getSourceStyle(post.username).color, background: getSourceStyle(post.username).color + '15' }">
              {{ extractSource(post.username) || post.username }}
            </span>
            <span class="card-time">{{ timeAgo(post.created_at) }}</span>
          </div>

          <h2 class="card-title">
            <RouterLink :to="'/post/' + post.id">{{ post.title }}</RouterLink>
          </h2>

          <p v-if="post.snippet" class="card-excerpt">{{ getExcerpt(post.snippet) }}</p>
        </div>

        <!-- 底部标签 -->
        <div class="card-footer">
          <div class="card-tags" v-if="post.tags">
            <span
              v-for="tag in post.tags.split(',').filter(t => t.trim() && t.trim() !== post.category)"
              :key="tag"
              class="mini-tag"
              @click="filterByTag(tag.trim())"
            >#{{ tag.trim() }}</span>
          </div>
          <div class="hot-meter" v-if="post.hot_score >= 50">
            <span class="hot-bar" :style="{ width: post.hot_score + '%' }"></span>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* ===== Hero ===== */
.hero {
  text-align: center;
  margin-bottom: 36px;
  padding: 10px 0 20px;
}
.hero h1 {
  font-size: 3rem;
  margin: 0;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: #fff;
}
.gradient-text {
  background: linear-gradient(135deg, #0EA5E9, #8B5CF6, #EC4899);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.sub-dot { color: var(--primary); }
.hero-desc {
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 0.95rem;
}
.accent { color: var(--primary); font-weight: 700; }

/* ===== 分类 Tab ===== */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}
.category-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.cat-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.03);
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.25s;
  white-space: nowrap;
  font-family: inherit;
}
.cat-tab:hover {
  background: rgba(255,255,255,0.06);
  color: #fff;
  border-color: rgba(255,255,255,0.12);
}
.cat-tab.active {
  background: rgba(14,165,233,0.1);
  border-color: var(--cat-color, #0EA5E9);
  color: #fff;
  box-shadow: 0 0 15px rgba(14,165,233,0.15);
}
.cat-icon { font-size: 0.95rem; }
.cat-name { font-weight: 600; }
.cat-count {
  font-size: 0.7rem;
  background: rgba(255,255,255,0.1);
  padding: 1px 7px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sort-btn {
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  transition: all 0.2s;
  font-family: inherit;
}
.sort-btn:hover { background: rgba(255,255,255,0.06); color: #fff; }
.source-select {
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(15,23,42,0.8);
  color: var(--text-muted);
  font-size: 0.82rem;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  max-width: 160px;
}
.source-select:focus { border-color: var(--primary); }
.clear-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(239,68,68,0.3);
  background: rgba(239,68,68,0.08);
  color: #F87171;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
  transition: all 0.2s;
  font-family: inherit;
}
.clear-btn:hover { background: rgba(239,68,68,0.15); }
.filter-banner {
  padding: 10px 18px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 0.9rem;
}

/* ===== 加载 / 空状态 ===== */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
  gap: 16px;
}
.spinner {
  width: 36px; height: 36px;
  border: 3px solid rgba(14,165,233,0.1);
  border-radius: 50%;
  border-top-color: var(--primary);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading p, .empty-state p { color: var(--text-muted); }
.empty-state { text-align: center; padding: 60px 0; }
.empty-icon { font-size: 3rem; margin-bottom: 12px; }

/* ===== 新闻卡片网格 (NewsNow 风格) ===== */
.news-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}
.news-card {
  position: relative;
  background: linear-gradient(145deg, rgba(15,23,42,0.8), rgba(15,23,42,0.4));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
}
.news-card:hover {
  transform: translateY(-3px);
  border-color: rgba(14,165,233,0.25);
  box-shadow: 0 12px 40px -12px rgba(14,165,233,0.2);
}
.news-card.is-hot {
  border-color: rgba(234,179,8,0.25);
  box-shadow: 0 4px 20px -4px rgba(234,179,8,0.1);
}
.news-card.is-hot:hover {
  border-color: rgba(234,179,8,0.45);
  box-shadow: 0 12px 40px -12px rgba(234,179,8,0.3);
}
.card-topbar {
  height: 3px;
  width: 100%;
  opacity: 0.8;
}
.hot-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  z-index: 2;
}
.hot-boom {
  background: rgba(239,68,68,0.15);
  color: #F87171;
  border: 1px solid rgba(239,68,68,0.3);
  animation: glow 1.5s ease-in-out infinite;
}
.hot-fire {
  background: rgba(234,179,8,0.12);
  color: #FBBF24;
  border: 1px solid rgba(234,179,8,0.25);
}
.hot-warm {
  background: rgba(14,165,233,0.1);
  color: #38BDF8;
  border: 1px solid rgba(14,165,233,0.2);
}
@keyframes glow {
  0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.2); }
  50% { box-shadow: 0 0 18px rgba(239,68,68,0.4); }
}
.card-body { padding: 16px 20px; flex: 1; }
.card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.source-tag {
  font-size: 0.73rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}
.card-time {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: var(--font-code);
}
.card-title {
  margin: 0 0 8px;
}
.card-title a {
  color: #F1F5F9;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.2s;
}
.card-title a:hover { color: var(--primary-hover); }
.card-excerpt {
  font-size: 0.83rem;
  color: var(--text-muted);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-footer {
  padding: 10px 20px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.card-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.mini-tag {
  font-size: 0.68rem;
  color: var(--primary);
  background: rgba(14,165,233,0.06);
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid rgba(14,165,233,0.1);
}
.mini-tag:hover {
  background: rgba(14,165,233,0.18);
  color: #fff;
}
.hot-meter {
  width: 50px;
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  overflow: hidden;
  flex-shrink: 0;
}
.hot-bar {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #F59E0B, #EF4444);
  border-radius: 2px;
  transition: width 0.5s;
}

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .hero h1 { font-size: 2rem; }
  .hero-desc { font-size: 0.82rem; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .category-tabs { gap: 4px; }
  .cat-tab { padding: 6px 10px; font-size: 0.78rem; }
  .cat-icon { font-size: 0.85rem; }
  .cat-count { font-size: 0.65rem; padding: 1px 5px; }
  .toolbar-actions { justify-content: flex-end; }
  .news-grid { grid-template-columns: 1fr; gap: 14px; }
  .card-title a { font-size: 0.98rem; }
}
</style>
