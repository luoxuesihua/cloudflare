<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const posts = ref([])
const isLoading = ref(true)
const route = useRoute()
const currentTag = ref(route.query.tag || '')

async function fetchPosts() {
  isLoading.value = true
  try {
    const url = currentTag.value ? `/api/posts?tag=${encodeURIComponent(currentTag.value)}` : '/api/posts'
    const res = await fetch(url)
    posts.value = await res.json()
  } catch (e) {
    console.error('获取文章失败', e)
  } finally {
    isLoading.value = false
  }
}

function filterByTag(tag) {
  currentTag.value = tag
  fetchPosts()
}

function clearFilter() {
  currentTag.value = ''
  fetchPosts()
}

// 提取新闻采集源站点的名字
function getNewsSource(username) {
  if (username && username.startsWith('NewsBot (')) {
    return username.substring(9, username.length - 1)
  }
  return null
}

onMounted(fetchPosts)
</script>

<template>
  <div class="home-view">
    <div class="hero">
      <h1>Rin<span class="highlight">.</span></h1>
      <p class="subtitle">基于 Cloudflare 的现代博客系统</p>
    </div>

    <div v-if="currentTag" class="filter-bar glass">
      <span>标签筛选: <strong>#{{ currentTag }}</strong></span>
      <a href="#" @click.prevent="clearFilter" class="clear-btn">× 清除</a>
    </div>

    <div v-if="isLoading" class="loading-container">
      <div class="spinner"></div>
      <p class="loading-text">正在从边缘加载资讯...</p>
    </div>

    <div v-else-if="posts.length === 0" class="empty">
      <p>暂无文章。</p>
    </div>

    <div v-else class="post-grid">
      <div 
        v-for="post in posts" 
        :key="post.id" 
        class="post-card"
        :class="{ 'is-news': getNewsSource(post.username) }"
      >
        <span class="date">{{ new Date(post.created_at).toLocaleDateString('zh-CN') }}</span>
        <h2 class="post-title">
          <RouterLink :to="'/post/' + post.id">{{ post.title }}</RouterLink>
        </h2>
        
        <div class="post-meta">
          <span v-if="getNewsSource(post.username)" class="source-badge">
            <span class="dot"></span>
            {{ getNewsSource(post.username) }}
          </span>
          <span v-else class="author">
            <svg class="author-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            @{{ post.username }}
          </span>
        </div>

        <div class="tags" v-if="post.tags">
          <span
            v-for="tag in post.tags.split(',').filter(t => t.trim())"
            :key="tag"
            class="tag"
            @click="filterByTag(tag.trim())"
          >#{{ tag.trim() }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  margin-bottom: 50px;
  padding: 30px 0;
}

h1 {
  font-size: 4rem;
  margin: 0;
  line-height: 1.1;
  background: linear-gradient(180deg, #fff, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.highlight {
  color: var(--primary);
  -webkit-text-fill-color: var(--primary);
  text-shadow: 0 0 20px rgba(14, 165, 233, 0.4);
}

.subtitle {
  color: var(--text-muted);
  font-size: 1.1rem;
  margin-top: 12px;
  letter-spacing: 0.02em;
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-radius: var(--radius-sm);
  margin-bottom: 30px;
  font-size: 0.95rem;
}

.clear-btn { 
  color: var(--danger); 
  font-weight: 600;
}

/* ===== 加载动画 ===== */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(14, 165, 233, 0.1);
  border-radius: 50%;
  border-top-color: var(--primary);
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 16px;
  box-shadow: 0 0 15px rgba(14, 165, 233, 0.1);
}

.loading-text {
  color: var(--text-muted);
  font-size: 0.95rem;
  letter-spacing: 0.05em;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty {
  text-align: center;
  padding: 50px 0;
  color: var(--text-muted);
}

/* ===== 文章网格与卡片 ===== */
.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.post-card {
  position: relative;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.4), rgba(15, 23, 42, 0.2));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 26px;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}

.post-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(800px circle at var(--x, 0px) var(--y, 0px), rgba(255,255,255,0.06), transparent 40%);
  border-radius: var(--radius-md);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.5s;
}

.post-card:hover::before {
  opacity: 1;
}

.post-card:hover {
  transform: translateY(-4px);
  border-color: rgba(14, 165, 233, 0.25);
  box-shadow: 0 12px 40px -12px rgba(14, 165, 233, 0.25);
}

/* 采集的新闻卡片特有样式 */
.post-card.is-news {
  border-top: 3px solid rgba(14, 165, 233, 0.6);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.03), rgba(15, 23, 42, 0.3));
}

.post-card.is-news:hover {
  border-top-color: var(--primary-hover);
  border-color: rgba(14, 165, 233, 0.4);
  box-shadow: 0 12px 45px -12px rgba(14, 165, 233, 0.35);
}

.date {
  font-family: var(--font-code);
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 10px;
  display: block;
}

.post-title {
  margin-bottom: 16px;
  flex-grow: 1;
}

.post-title a {
  color: #fff;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.4;
  transition: color 0.2s ease;
}

.post-title a:hover { 
  color: var(--primary-hover); 
}

/* ===== 标签与作者元信息 ===== */
.post-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
}

.author {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.author-icon {
  width: 14px;
  height: 14px;
  opacity: 0.7;
}

/* 新闻源特色标签 */
.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--primary-hover);
  background: rgba(14, 165, 233, 0.08);
  border: 1px solid rgba(14, 165, 233, 0.2);
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 10px rgba(14, 165, 233, 0.05);
}

.dot {
  width: 6px;
  height: 6px;
  background-color: var(--primary);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--primary);
  display: inline-block;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
}

.tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.tag {
  font-size: 0.72rem;
  color: var(--primary);
  background: rgba(14, 165, 233, 0.06);
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid rgba(14, 165, 233, 0.15);
  cursor: pointer;
  transition: all 0.25s ease;
  font-weight: 500;
}

.tag:hover {
  background: rgba(14, 165, 233, 0.18);
  border-color: rgba(14, 165, 233, 0.3);
  color: #fff;
  transform: translateY(-1px);
}

/* ===== 移动端 ===== */
@media (max-width: 768px) {
  .hero { margin-bottom: 30px; padding: 15px 0; }
  h1 { font-size: 2.8rem; }
  .subtitle { font-size: 0.95rem; }

  .post-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .post-card { padding: 22px; }
  .post-title a { font-size: 1.15rem; }
}
</style>
