<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useAuth } from '../composables/useAuth'
import { dedupedFetch } from '../utils/api'

const route = useRoute()
const auth = useAuth()
const post = ref(null)
const isLoading = ref(true)
const error = ref('')
const aiKeyPoints = ref(null)
const isLoadingAI = ref(false)

// 评论相关
const comments = ref([])
const commentCount = ref(0)
const newComment = ref('')
const isSubmittingComment = ref(false)

const isLoggedIn = computed(() => auth.isLoggedIn.value)

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true
})

function renderMarkdown(text) {
  if (!text) return ''
  const raw = marked.parse(text)
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'strong', 'em', 'a', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'del', 'sup', 'sub'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class'],
    ADD_ATTR: ['target', 'rel'],
    // 仅允许 http/https 资源，拦截 javascript: 等危险协议
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    // 为外链统一加上安全属性
    HOOKS: {
      afterSanitizeAttributes: (node) => {
        if (node.tagName === 'A' && node.getAttribute('href')) {
          node.setAttribute('target', '_blank')
          node.setAttribute('rel', 'noopener noreferrer')
        }
      }
    }
  })
}

// 记录阅读历史
async function recordReadingHistory() {
  if (!auth.isLoggedIn.value || !route.params.id) return
  
  try {
    await fetch(`/api/posts/${route.params.id}/read`, {
      method: 'POST',
      headers: auth.getHeaders()
    })
  } catch (e) {
    console.warn('记录阅读历史失败:', e)
  }
}

onMounted(async () => {
  try {
    const res = await dedupedFetch(`/api/posts/${route.params.id}`)
    if (!res.ok) throw new Error('文章不存在')
    post.value = await res.json()
    fetchAISummary()
    fetchComments()
    
    // 记录阅读历史（如果用户已登录）
    if (auth.isLoggedIn.value) {
      recordReadingHistory()
    }
  } catch (e) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
})

async function fetchAISummary() {
  if (!auth.isLoggedIn.value) return

  try {
    isLoadingAI.value = true
    const res = await fetch(`/api/posts/${route.params.id}/summarize`, {
      method: 'POST',
      headers: auth.getHeaders()
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

// 评论相关方法
async function fetchComments() {
  try {
    const res = await dedupedFetch(`/api/posts/${route.params.id}/comments`)
    if (res.ok) {
      const data = await res.json()
      comments.value = data.comments || []
      commentCount.value = data.count || 0
    }
  } catch { /* silent */ }
}

async function submitComment() {
  if (!newComment.value.trim() || isSubmittingComment.value) return
  if (!auth.isLoggedIn.value) return

  isSubmittingComment.value = true
  try {
    const res = await fetch(`/api/posts/${route.params.id}/comments`, {
      method: 'POST',
      headers: auth.getHeaders(),
      body: JSON.stringify({ content: newComment.value.trim() })
    })
    if (res.ok) {
      const data = await res.json()
      comments.value.push(data.comment)
      commentCount.value++
      newComment.value = ''
    }
  } catch { /* silent */ }
  finally { isSubmittingComment.value = false }
}

function commentTimeAgo(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return new Date(dateStr).toLocaleDateString('zh-CN')
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

      <!-- 评论区 -->
      <div class="comments-section">
        <h3 class="comments-title">💬 评论 ({{ commentCount }})</h3>

        <!-- 评论输入框 -->
        <div v-if="isLoggedIn" class="comment-form">
          <textarea
            v-model="newComment"
            placeholder="写下你的评论..."
            maxlength="500"
            rows="3"
            class="comment-textarea"
          ></textarea>
          <div class="comment-form-footer">
            <span class="comment-count-hint">{{ newComment.length }}/500</span>
            <button
              @click="submitComment"
              :disabled="!newComment.trim() || isSubmittingComment"
              class="comment-submit-btn"
            >
              {{ isSubmittingComment ? '发送中...' : '发表评论' }}
            </button>
          </div>
        </div>
        <div v-else class="comment-login-hint">
          <RouterLink to="/login">登录</RouterLink> 后参与评论
        </div>

        <!-- 评论列表 -->
        <div v-if="comments.length > 0" class="comment-list">
          <div v-for="comment in comments" :key="comment.id" class="comment-item">
            <div class="comment-header">
              <span class="comment-user">{{ comment.username }}</span>
              <span class="comment-time">{{ commentTimeAgo(comment.created_at) }}</span>
            </div>
            <p class="comment-content">{{ comment.content }}</p>
          </div>
        </div>
        <div v-else-if="commentCount === 0" class="comment-empty">
          暂无评论，来抢沙发吧~
        </div>
      </div>

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

/* ===== 评论区 ===== */
.comments-section {
  margin-top: 10px;
}
.comments-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 20px;
  color: #E2E8F0;
}

/* 评论输入 */
.comment-form {
  margin-bottom: 24px;
}
.comment-textarea {
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(15,23,42,0.6);
  color: #E2E8F0;
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.comment-textarea:focus {
  border-color: var(--primary);
}
.comment-textarea::placeholder { color: rgba(255,255,255,0.25); }
.comment-form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.comment-count-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: var(--font-code);
}
.comment-submit-btn {
  padding: 7px 18px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #0EA5E9, #2563EB);
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}
.comment-submit-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}
.comment-submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 登录提示 */
.comment-login-hint {
  text-align: center;
  padding: 20px;
  border-radius: 10px;
  background: rgba(255,255,255,0.02);
  border: 1px dashed rgba(255,255,255,0.08);
  color: var(--text-muted);
  font-size: 0.88rem;
  margin-bottom: 20px;
}
.comment-login-hint a {
  color: var(--primary);
  font-weight: 600;
}

/* 评论列表 */
.comment-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.comment-item {
  padding: 14px 18px;
  border-radius: 10px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.04);
  transition: border-color 0.2s;
}
.comment-item:hover {
  border-color: rgba(255,255,255,0.1);
}
.comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.comment-user {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--primary);
}
.comment-time {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: var(--font-code);
}
.comment-content {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #CBD5E1;
  margin: 0;
  word-wrap: break-word;
}
.comment-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88rem;
  padding: 30px 0;
}

.loading, .error { text-align: center; padding: 60px 0; color: var(--text-muted); }
.error { color: var(--danger); }

/* ===== 移动端 ===== */
@media (max-width: 768px) {
  .post-content { padding: 24px 18px; }
  .title { font-size: 1.5rem; }
  .meta { font-size: 0.8rem; gap: 12px; }
}
</style>
