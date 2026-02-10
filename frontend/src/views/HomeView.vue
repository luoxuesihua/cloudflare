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

    <div v-if="isLoading" class="loading">加载中...</div>

    <div v-else-if="posts.length === 0" class="empty">
      <p>暂无文章。</p>
    </div>

    <div v-else class="post-grid">
      <div v-for="post in posts" :key="post.id" class="card post-card">
        <div class="card-content">
          <span class="date">{{ new Date(post.created_at).toLocaleDateString('zh-CN') }}</span>
          <h2 class="post-title">
            <RouterLink :to="'/post/' + post.id">{{ post.title }}</RouterLink>
          </h2>
          <div class="post-meta">
            <span class="author">@{{ post.username }}</span>
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
}

.highlight {
  color: var(--primary);
  -webkit-text-fill-color: var(--primary);
}

.subtitle {
  color: var(--text-muted);
  font-size: 1.1rem;
  margin-top: 10px;
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-radius: var(--radius-sm);
  margin-bottom: 30px;
}

.clear-btn {
  color: var(--danger);
}

.loading, .empty {
  text-align: center;
  padding: 60px 0;
  color: var(--text-muted);
  font-size: 1.1rem;
}

.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 25px;
}

.post-card {
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 28px;
  transition: all 0.3s ease;
  cursor: default;
}

.post-card:hover {
  transform: translateY(-4px);
  border-color: var(--primary);
  box-shadow: 0 10px 40px -10px rgba(14, 165, 233, 0.2);
}

.date {
  font-family: var(--font-code);
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 8px;
  display: block;
}

.post-title a {
  color: #fff;
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1.3;
}

.post-title a:hover {
  color: var(--primary);
}

.post-meta {
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 15px;
}

.tag {
  font-size: 0.75rem;
  color: var(--primary);
  background: rgba(14, 165, 233, 0.1);
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid rgba(14, 165, 233, 0.2);
  cursor: pointer;
  transition: all 0.2s;
}

.tag:hover {
  background: rgba(14, 165, 233, 0.25);
  box-shadow: 0 0 10px rgba(14, 165, 233, 0.3);
}
</style>
