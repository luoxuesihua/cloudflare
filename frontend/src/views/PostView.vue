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
</script>

<template>
  <div class="post-view">
    <div v-if="isLoading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <article v-else-if="post" class="glass-panel post-content">
      <header class="post-header">
        <h1 class="title">{{ post.title }}</h1>
        <div class="meta">
          <span>{{ new Date(post.created_at).toLocaleString('zh-CN') }}</span>
          <span>@{{ post.username }}</span>
        </div>
        <div class="tags" v-if="post.tags">
          <span
            v-for="tag in post.tags.split(',').filter(t => t.trim())"
            :key="tag"
            class="tag"
          >#{{ tag.trim() }}</span>
        </div>
      </header>

      <hr class="divider" />

      <div id="markdown-content" class="markdown-body" v-html="renderedContent"></div>

      <hr class="divider" />
      <nav class="post-nav">
        <RouterLink to="/">← 返回首页</RouterLink>
      </nav>
    </article>
  </div>
</template>

<script>
export default {
  computed: {
    renderedContent() {
      // 简单的 Markdown 渲染（生产环境建议用 marked 等库）
      if (!this.post) return ''
      let html = this.post.content
      // 标题
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
      html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
      html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // 粗体和斜体
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
      // 代码块
      html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // 行内代码
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
      // 列表
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
      // 段落
      html = html.replace(/\n\n/g, '</p><p>')
      html = '<p>' + html + '</p>'
      return html
    }
  }
}
</script>

<style scoped>
.post-view {
  max-width: 800px;
  margin: 0 auto;
}

.post-content {
  padding: 40px;
  border-radius: var(--radius-md);
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.title {
  font-size: 2.2rem;
  margin-bottom: 0.5em;
  line-height: 1.2;
}

.meta {
  color: var(--text-muted);
  font-family: var(--font-code);
  font-size: 0.9rem;
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
}

.tags {
  display: flex;
  gap: 8px;
}

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
  margin: 30px 0;
}

.markdown-body {
  line-height: 1.8;
  color: var(--text-main);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.markdown-body :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-family: var(--font-code);
  font-size: 0.9rem;
}

.markdown-body :deep(code) {
  font-family: var(--font-code);
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-body :deep(li) {
  margin-left: 20px;
  margin-bottom: 4px;
}

.post-nav a {
  color: var(--text-muted);
}

.post-nav a:hover {
  color: var(--primary);
}

.loading, .error {
  text-align: center;
  padding: 60px 0;
  color: var(--text-muted);
}

.error {
  color: var(--danger);
}
</style>
