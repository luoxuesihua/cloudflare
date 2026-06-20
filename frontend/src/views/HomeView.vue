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

// 获取新闻源对应的样式类
function getNewsSourceClass(username) {
  const source = getNewsSource(username)
  if (!source) return ''
  const mapping = {
    'Solidot': 'src-solidot',
    'InfoQ 中文站': 'src-infoq',
    '机器之心 AI': 'src-jiqizhixin',
    '美团技术团队': 'src-meituan',
    '开源中国': 'src-oschina',
    '博客园精华区': 'src-cnblogs',
    'SegmentFault 思否': 'src-segmentfault',
    '掘金全站周榜': 'src-juejin',
    '阮一峰的网络日志': 'src-ruanyifeng',
    '掘金后端': 'src-juejin'
  }
  return 'is-news ' + (mapping[source] || 'src-default')
}

// 格式化摘要，移除 Markdown 与 HTML，限制长度
function getExcerpt(snippet) {
  if (!snippet) return ''
  let text = snippet
  // 移除可能存在的 HTML 标签
  text = text.replace(/<[^>]+>/g, '')
  // 移除 markdown 链接 [text](link) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // 移除 markdown 格式字符 (如 #, *, `, _, -)
  text = text.replace(/[#*`_-]/g, '')
  // 去除多余的换行与空白
  text = text.replace(/\s+/g, ' ').trim()
  
  if (text.length > 90) {
    return text.substring(0, 90) + '...'
  }
  return text
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
        :class="getNewsSourceClass(post.username)"
      >
        <span class="date">{{ new Date(post.created_at).toLocaleDateString('zh-CN') }}</span>
        <h2 class="post-title">
          <RouterLink :to="'/post/' + post.id">{{ post.title }}</RouterLink>
        </h2>
        
        <!-- 文章内容简介 -->
        <p v-if="post.snippet" class="post-excerpt">
          {{ getExcerpt(post.snippet) }}
        </p>
        
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

/* ==================== 专属新闻源高级配色与动效 ==================== */

/* 1. Solidot (极客绿) */
.post-card.src-solidot {
  border-top: 3px solid #10b981;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-solidot:hover {
  border-top-color: #34d399;
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 12px 40px -12px rgba(16, 185, 129, 0.3);
}
.post-card.src-solidot .source-badge {
  color: #34d399 !important;
  background: rgba(16, 185, 129, 0.08) !important;
  border-color: rgba(16, 185, 129, 0.25) !important;
}
.post-card.src-solidot .dot {
  background-color: #10b981 !important;
  box-shadow: 0 0 8px #10b981 !important;
}

/* 2. InfoQ 中文站 (架构红) */
.post-card.src-infoq {
  border-top: 3px solid #e11d48;
  background: linear-gradient(135deg, rgba(225, 29, 72, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-infoq:hover {
  border-top-color: #fb7185;
  border-color: rgba(225, 29, 72, 0.4);
  box-shadow: 0 12px 40px -12px rgba(225, 29, 72, 0.3);
}
.post-card.src-infoq .source-badge {
  color: #fb7185 !important;
  background: rgba(225, 29, 72, 0.08) !important;
  border-color: rgba(225, 29, 72, 0.25) !important;
}
.post-card.src-infoq .dot {
  background-color: #e11d48 !important;
  box-shadow: 0 0 8px #e11d48 !important;
}

/* 3. 机器之心 AI (大模型紫) */
.post-card.src-jiqizhixin {
  border-top: 3px solid #8b5cf6;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-jiqizhixin:hover {
  border-top-color: #a78bfa;
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow: 0 12px 40px -12px rgba(139, 92, 246, 0.3);
}
.post-card.src-jiqizhixin .source-badge {
  color: #a78bfa !important;
  background: rgba(139, 92, 246, 0.08) !important;
  border-color: rgba(139, 92, 246, 0.25) !important;
}
.post-card.src-jiqizhixin .dot {
  background-color: #8b5cf6 !important;
  box-shadow: 0 0 8px #8b5cf6 !important;
}

/* 4. 美团技术团队 (美团黄) */
.post-card.src-meituan {
  border-top: 3px solid #eab308;
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-meituan:hover {
  border-top-color: #facc15;
  border-color: rgba(234, 179, 8, 0.4);
  box-shadow: 0 12px 40px -12px rgba(234, 179, 8, 0.3);
}
.post-card.src-meituan .source-badge {
  color: #facc15 !important;
  background: rgba(234, 179, 8, 0.08) !important;
  border-color: rgba(234, 179, 8, 0.25) !important;
}
.post-card.src-meituan .dot {
  background-color: #eab308 !important;
  box-shadow: 0 0 8px #eab308 !important;
}

/* 5. 开源中国 (社区绿) */
.post-card.src-oschina {
  border-top: 3px solid #22c55e;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-oschina:hover {
  border-top-color: #4ade80;
  border-color: rgba(34, 197, 94, 0.4);
  box-shadow: 0 12px 40px -12px rgba(34, 197, 94, 0.3);
}
.post-card.src-oschina .source-badge {
  color: #4ade80 !important;
  background: rgba(34, 197, 94, 0.08) !important;
  border-color: rgba(34, 197, 94, 0.25) !important;
}
.post-card.src-oschina .dot {
  background-color: #22c55e !important;
  box-shadow: 0 0 8px #22c55e !important;
}

/* 6. 博客园精华区 (清风蓝) */
.post-card.src-cnblogs {
  border-top: 3px solid #0284c7;
  background: linear-gradient(135deg, rgba(2, 132, 199, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-cnblogs:hover {
  border-top-color: #38bdf8;
  border-color: rgba(2, 132, 199, 0.4);
  box-shadow: 0 12px 40px -12px rgba(2, 132, 199, 0.3);
}
.post-card.src-cnblogs .source-badge {
  color: #38bdf8 !important;
  background: rgba(2, 132, 199, 0.08) !important;
  border-color: rgba(2, 132, 199, 0.25) !important;
}
.post-card.src-cnblogs .dot {
  background-color: #0284c7 !important;
  box-shadow: 0 0 8px #0284c7 !important;
}

/* 7. SegmentFault 思否 (雅致青) */
.post-card.src-segmentfault {
  border-top: 3px solid #0d9488;
  background: linear-gradient(135deg, rgba(13, 148, 136, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-segmentfault:hover {
  border-top-color: #2dd4bf;
  border-color: rgba(13, 148, 136, 0.4);
  box-shadow: 0 12px 40px -12px rgba(13, 148, 136, 0.3);
}
.post-card.src-segmentfault .source-badge {
  color: #2dd4bf !important;
  background: rgba(13, 148, 136, 0.08) !important;
  border-color: rgba(13, 148, 136, 0.25) !important;
}
.post-card.src-segmentfault .dot {
  background-color: #0d9488 !important;
  box-shadow: 0 0 8px #0d9488 !important;
}

/* 8. 掘金全站周榜 (先锋蓝) */
.post-card.src-juejin {
  border-top: 3px solid #2563eb;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-juejin:hover {
  border-top-color: #60a5fa;
  border-color: rgba(37, 99, 235, 0.4);
  box-shadow: 0 12px 40px -12px rgba(37, 99, 235, 0.3);
}
.post-card.src-juejin .source-badge {
  color: #60a5fa !important;
  background: rgba(37, 99, 235, 0.08) !important;
  border-color: rgba(37, 99, 235, 0.25) !important;
}
.post-card.src-juejin .dot {
  background-color: #2563eb !important;
  box-shadow: 0 0 8px #2563eb !important;
}

/* 9. 阮一峰的网络日志 (活力橙) */
.post-card.src-ruanyifeng {
  border-top: 3px solid #f97316;
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-ruanyifeng:hover {
  border-top-color: #fb923c;
  border-color: rgba(249, 115, 22, 0.4);
  box-shadow: 0 12px 40px -12px rgba(249, 115, 22, 0.3);
}
.post-card.src-ruanyifeng .source-badge {
  color: #fb923c !important;
  background: rgba(249, 115, 22, 0.08) !important;
  border-color: rgba(249, 115, 22, 0.25) !important;
}
.post-card.src-ruanyifeng .dot {
  background-color: #f97316 !important;
  box-shadow: 0 0 8px #f97316 !important;
}

/* 10. 默认其它新闻源 (默认蓝) */
.post-card.src-default {
  border-top: 3px solid var(--primary);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.04), rgba(15, 23, 42, 0.35));
}
.post-card.src-default:hover {
  border-top-color: var(--primary-hover);
  border-color: rgba(14, 165, 233, 0.4);
  box-shadow: 0 12px 40px -12px rgba(14, 165, 233, 0.35);
}
.post-card.src-default .source-badge {
  color: var(--primary-hover) !important;
  background: rgba(14, 165, 233, 0.08) !important;
  border-color: rgba(14, 165, 233, 0.25) !important;
}
.post-card.src-default .dot {
  background-color: var(--primary) !important;
  box-shadow: 0 0 8px var(--primary) !important;
}

.date {
  font-family: var(--font-code);
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 10px;
  display: block;
}

.post-title {
  margin-bottom: 12px;
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

/* 文章内容简介排版 */
.post-excerpt {
  font-size: 0.88rem;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 16px;
  flex-grow: 1; /* 自动撑开以使卡片底部对齐 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
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
