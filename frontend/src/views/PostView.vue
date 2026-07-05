<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const post = ref(null)
const isLoading = ref(true)
const error = ref('')
const aiKeyPoints = ref(null)
const isLoadingAI = ref(false)

onMounted(async () => {
  try {
    const res = await fetch(`/api/posts/${route.params.id}`)
    if (!res.ok) throw new Error('文章不存在')
    post.value = await res.json()
    // 读取时尝试获取 AI 要点
    fetchAISummary()
  } catch (e) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
})

async function fetchAISummary() {
  // 如果已有 ai_summary 且是机器采集的文章，尝试获取要点
  const token = localStorage.getItem('token')
  if (!token) return

  try {
    isLoadingAI.value = true
    const res = await fetch(`/api/posts/${route.params.id}/summarize`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.ai_summary && !post.value.ai_summary) {
        post.value.ai_summary = data.ai_summary
      }
      if (data.key_points) {
        aiKeyPoints.value = data.key_points
      }
    }
  } catch { /* silent */ }
  finally { isLoadingAI.value = false }
}

function renderMarkdown(text) {
  if (!text) return ''
  let html = text
  html = html.replace(/^---$/gm, '<hr>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
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

      <!-- AI 摘要 / 要点提炼区域 -->
      <div v-if="post.ai_summary || post.summary || aiKeyPoints" class="ai-summary-box">
        <div class="ai-summary-header">
          <span class="ai-icon">🤖</span>
          <span class="ai-label">{{ post.ai_summary ? 'AI 智能摘要' : '内容摘要' }}</span>
          <span v-if="isLoadingAI" class="ai-loading">生成中…</span>
        </div>

        <!-- AI / 规则摘要 -->
        <p v-if="post.ai_summary || post.summary" class="ai-summary-text">
          {{ post.ai_summary || post.summary }}
        </p>

        <!-- 核心要点列表 -->
        <ul v-if="aiKeyPoints && aiKeyPoints.length > 0" class="ai-keypoints">
          <li v-for="(point, i) in aiKeyPoints" :key="i">
            <span class="kp-dot">{{ i + 1 }}</span>
            {{ point }}
          </li>
        </ul>
      </div>

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

/* ===== AI 摘要盒子 ===== */
.ai-summary-box {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.06));
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 12px;
  padding: 18px 22px;
  margin-bottom: 24px;
}
.ai-summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.ai-icon {
  font-size: 1.1rem;
}
.ai-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #A78BFA;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.ai-loading {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-left: 4px;
}
.ai-summary-text {
  font-size: 0.92rem;
  line-height: 1.7;
  color: #D1D5DB;
  margin: 0;
}
.ai-keypoints {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ai-keypoints li {
  font-size: 0.88rem;
  color: #D1D5DB;
  line-height: 1.6;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.kp-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8B5CF6, #3B82F6);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
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
.markdown-body :deep(hr) {
  border: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 25px 0;
}
.markdown-body :deep(a) { color: var(--primary); text-decoration: none; }
.markdown-body :deep(a:hover) { text-decoration: underline; }

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
