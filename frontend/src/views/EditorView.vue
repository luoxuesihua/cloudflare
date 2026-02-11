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
const isUploading = ref(false)
const isDragOver = ref(false)
const textareaRef = ref(null)

if (!isLoggedIn.value) {
  router.push('/login?redirect=/write')
}

// ========== 图片上传 ==========
async function uploadImage(file) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    errorMsg.value = '请选择图片文件'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    errorMsg.value = '图片大小不能超过 10MB'
    return
  }

  isUploading.value = true
  errorMsg.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file)

    const token = localStorage.getItem('auth_token')
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    })
    const data = await res.json()

    if (res.ok) {
      // 插入 Markdown 图片语法到光标位置
      insertAtCursor(`![${file.name}](${data.url})`)
    } else {
      errorMsg.value = data.error || '上传失败'
    }
  } catch (e) {
    errorMsg.value = '上传失败：网络错误'
  } finally {
    isUploading.value = false
  }
}

function insertAtCursor(text) {
  const textarea = textareaRef.value
  if (!textarea) {
    content.value += '\n' + text
    return
  }
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const before = content.value.substring(0, start)
  const after = content.value.substring(end)
  content.value = before + text + after
  // 移动光标到插入内容之后
  const newPos = start + text.length
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(newPos, newPos)
  }, 0)
}

// 文件选择器
function triggerFileInput() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (file) uploadImage(file)
  }
  input.click()
}

// 拖拽上传
function onDragOver(e) {
  e.preventDefault()
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

function onDrop(e) {
  e.preventDefault()
  isDragOver.value = false
  const file = e.dataTransfer.files[0]
  if (file && file.type.startsWith('image/')) {
    uploadImage(file)
  }
}

// 粘贴上传
function onPaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) uploadImage(file)
      break
    }
  }
}

// ========== 发布 ==========
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
        <div class="content-label-row">
          <label>内容 (支持 Markdown)</label>
          <button type="button" @click="triggerFileInput" class="upload-btn" :disabled="isUploading">
            <span class="upload-icon">📷</span>
            {{ isUploading ? '上传中...' : '插入图片' }}
          </button>
        </div>
        <div
          class="textarea-wrapper"
          :class="{ 'drag-over': isDragOver }"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
        >
          <textarea
            ref="textareaRef"
            v-model="content"
            class="textarea-field"
            placeholder="使用 Markdown 编写文章内容...&#10;&#10;💡 支持拖拽/粘贴图片直接上传"
            @paste="onPaste"
          ></textarea>
          <div v-if="isDragOver" class="drag-overlay">
            <span>🖼️ 释放以上传图片</span>
          </div>
          <div v-if="isUploading" class="upload-progress">
            <span class="spinner"></span> 图片上传中...
          </div>
        </div>
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

.content-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.content-label-row label {
  margin-bottom: 0;
}

.upload-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  color: var(--primary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.82rem;
  font-family: var(--font-body);
  transition: all 0.2s;
}

.upload-btn:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.2);
}

.upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.upload-icon {
  font-size: 1rem;
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

.textarea-wrapper {
  position: relative;
  border-radius: var(--radius-sm);
  transition: all 0.3s;
}

.textarea-wrapper.drag-over {
  border-color: var(--primary);
  box-shadow: 0 0 20px rgba(14, 165, 233, 0.3);
}

.textarea-field {
  width: 100%;
  min-height: 350px;
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

.drag-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(14, 165, 233, 0.12);
  border: 2px dashed var(--primary);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  color: var(--primary);
  pointer-events: none;
  z-index: 5;
}

.upload-progress {
  position: absolute;
  bottom: 12px;
  left: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--primary);
  font-size: 0.85rem;
  background: rgba(15, 23, 42, 0.85);
  padding: 6px 14px;
  border-radius: 6px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(56, 189, 248, 0.3);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.actions {
  display: flex;
  gap: 15px;
  margin-top: 10px;
}
</style>
