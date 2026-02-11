<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { getHeaders, isLoggedIn } = useAuth()

const title = ref('')
const tags = ref('')
const content = ref('')
const isLoading = ref(false)
const errorMsg = ref('')

if (!isLoggedIn.value) {
  router.push('/login?redirect=/write')
}

const publish = async () => {
  if (!title.value || !content.value) {
    errorMsg.value = '请填写标题和内容'
    return
  }

  isLoading.value = true
  errorMsg.value = ''

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        title: title.value,
        content: content.value,
        tags: tags.value
      })
    })
    const data = await res.json()

    if (res.ok) {
      router.push('/')
    } else {
      errorMsg.value = data.error || '发布失败'
    }
  } catch (e) {
    errorMsg.value = '网络错误'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="editor-view">
    <h2>撰写新文章</h2>

    <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

    <div class="glass-panel editor-form">
      <div class="input-group">
        <label>标题</label>
        <input type="text" v-model="title" class="input-field" placeholder="文章标题" />
      </div>
      <div class="input-group">
        <label>标签</label>
        <input type="text" v-model="tags" class="input-field" placeholder="用逗号分隔，例如: 技术, 生活" />
      </div>
      <div class="input-group">
        <label>内容 (支持 Markdown)</label>
        <textarea v-model="content" class="textarea-field" placeholder="使用 Markdown 编写文章内容..."></textarea>
      </div>
      <div class="actions">
        <button @click="publish" class="btn btn-primary" :disabled="isLoading">
          {{ isLoading ? '发布中...' : '发布文章' }}
        </button>
        <RouterLink to="/" class="btn btn-ghost">取消</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-view {
  max-width: 800px;
  margin: 0 auto;
}

h2 {
  margin-bottom: 25px;
}

.editor-form {
  padding: 35px;
  border-radius: var(--radius-md);
}

.error-msg {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.input-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.input-field {
  width: 100%;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  transition: all 0.3s;
  box-sizing: border-box;
}

.textarea-field {
  width: 100%;
  min-height: 300px;
  padding: 15px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  border-radius: var(--radius-sm);
  font-family: var(--font-code);
  font-size: 0.95rem;
  line-height: 1.6;
  resize: vertical;
  transition: all 0.3s;
  box-sizing: border-box;
}

.input-field:focus, .textarea-field:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 15px rgba(14, 165, 233, 0.2);
}

.actions {
  display: flex;
  gap: 15px;
  margin-top: 10px;
}
</style>
