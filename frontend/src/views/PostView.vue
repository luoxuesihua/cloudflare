<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const post = ref(null)
const isLoading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const res = await fetch(`/api/posts/${route.params.id}`)
    if (!res.ok) throw new Error('文章不存在')
    post.value = await res.json()
  } catch (e) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
})

function renderMarkdown(text) {
  if (!text) return ''
  let html = text
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/\n\n/g, '</p><p>')
  html = '<p>' + html + '</p>'
  return html
}
</script>

<template>
  <div class="post-view">
    <div v-if="isLoading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <article v-else-if="post" class="post-content glass-panel">
      <header class="post-header">
        <h1 class="title">{{ post.title }}</h1>
        <div class="meta">
          <span>{{ new Date(post.created_at).toLocaleString('zh-CN') }}</span>
          <span>@{{ post.username }}</span>
        </div>
        <div class="tags" v-if="post.tags">
          <span v-for="tag in post.tags.split(',').filter(t => t.trim())" :key="tag" class="tag">#{{ tag.trim() }}</span>
        </div>
      </header>

      <hr class="divider" />
      <div class="markdown-body" v-html="renderMarkdown(post.content)"></div>
      <hr class="divider" />

      <nav class="post-nav">
        <RouterLink to="/">← 返回首页</RouterLink>
      </nav>
    </article>
  </div>
</template>

<style scoped>
.post-view {
  max-width: 800px;
  margin: 0 auto;
}

.post-content {
  padding: 40px;
  border-radius: var(--radius-md);
}

.title {
  font-size: 2rem;
  margin-bottom: 0.5em;
  line-height: 1.25;
}

.meta {
  color: var(--text-muted);
  font-family: var(--font-code);
  font-size: 0.85rem;
  display: flex;
  gap: 20px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.tags { display: flex; gap: 8px; flex-wrap: wrap; }

.tag {
  color: var(--primary);
  font-size: 0.85rem;
  background: rgba(14, 165, 233, 0.1);
  padding: 3px 10px;
  border-radius: 20px;
}

.divider {
  border: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 25px 0;
}

.markdown-body {
  line-height: 1.8;
  color: var(--text-main);
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.markdown-body :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-family: var(--font-code);
  font-size: 0.85rem;
  -webkit-overflow-scrolling: touch;
}

.markdown-body :deep(code) {
  font-family: var(--font-code);
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.88em;
}

.markdown-body :deep(pre code) { background: none; padding: 0; }
.markdown-body :deep(li) { margin-left: 20px; margin-bottom: 4px; }
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3) { margin-top: 1.5em; margin-bottom: 0.5em; }

.post-nav a { color: var(--text-muted); }
.post-nav a:hover { color: var(--primary); }

.loading, .error { text-align: center; padding: 60px 0; color: var(--text-muted); }
.error { color: var(--danger); }

/* ===== 移动端 ===== */
@media (max-width: 768px) {
  .post-content { padding: 24px 18px; }
  .title { font-size: 1.5rem; }
  .meta { font-size: 0.8rem; gap: 12px; }
}
</style>
