<script setup>
import { ref, onMounted } from 'vue'
import { useAuth } from '../../composables/useAuth'

const { user, updateInterests } = useAuth()

const interestCategories = [
  { id: 'general', name: '综合资讯', icon: '🌐', color: '#0EA5E9' },
  { id: 'ai', name: 'AI 前沿', icon: '🧠', color: '#8B5CF6' },
  { id: 'dev', name: '编程开发', icon: '💻', color: '#10B981' },
  { id: 'ops', name: '运维架构', icon: '⚙️', color: '#F59E0B' },
  { id: 'product', name: '产品设计', icon: '🎨', color: '#EC4899' },
  { id: 'biz', name: '财经商业', icon: '📈', color: '#EF4444' }
]

const selectedInterests = ref([])
const interestLoading = ref(false)
const interestMsg = ref('')

function toggleInterest(catId) {
  const index = selectedInterests.value.indexOf(catId)
  if (index >= 0) {
    selectedInterests.value.splice(index, 1)
  } else {
    if (selectedInterests.value.length >= 5) {
      alert('最多选择 5 个兴趣标签')
      return
    }
    selectedInterests.value.push(catId)
  }
}

async function saveInterests() {
  interestLoading.value = true
  interestMsg.value = ''
  try {
    const ok = await updateInterests(selectedInterests.value)
    if (ok) {
      interestMsg.value = '兴趣标签保存成功！首页将为您优先推荐匹配内容'
    } else {
      interestMsg.value = '保存失败，请重试'
    }
  } catch (e) {
    interestMsg.value = '网络错误'
  } finally {
    interestLoading.value = false
  }
}

onMounted(() => {
  if (user.value?.interests && Array.isArray(user.value.interests)) {
    selectedInterests.value = [...user.value.interests]
  }
})
</script>

<template>
  <div class="interests-tab">
    <h2>个性化兴趣标签</h2>
    <p class="subtitle">选择您关注的资讯分类，系统将在首页为您定制权重与优先推荐。</p>

    <div v-if="interestMsg" :class="['msg', interestMsg.includes('成功') ? 'success-msg' : 'error-msg']">
      {{ interestMsg }}
    </div>

    <div class="interest-chips-grid">
      <button
        v-for="cat in interestCategories"
        :key="cat.id"
        type="button"
        class="interest-edit-chip"
        :class="{ selected: selectedInterests.includes(cat.id) }"
        :style="selectedInterests.includes(cat.id) ? { borderColor: cat.color, background: cat.color + '15' } : {}"
        @click="toggleInterest(cat.id)"
      >
        <span class="chip-icon">{{ cat.icon }}</span>
        <span class="chip-name">{{ cat.name }}</span>
        <span v-if="selectedInterests.includes(cat.id)" class="chip-check">✓</span>
      </button>
    </div>

    <div class="footer-actions">
      <span class="hint">已选择 {{ selectedInterests.length }}/5 个标签</span>
      <button @click="saveInterests" class="btn btn-primary btn-sm" :disabled="interestLoading">
        {{ interestLoading ? '保存中...' : '保存偏好' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.subtitle {
  color: var(--text-muted);
  font-size: 0.88rem;
  margin-top: -10px;
  margin-bottom: 24px;
}
.interest-chips-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.interest-edit-chip {
  padding: 14px 18px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #CBD5E1;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.2s;
  position: relative;
}
.interest-edit-chip:hover {
  background: rgba(255, 255, 255, 0.05);
}
.interest-edit-chip.selected {
  color: #fff;
  border-width: 1.5px;
}
.chip-icon { font-size: 1.2rem; }
.chip-name { font-size: 0.95rem; font-weight: 500; }
.chip-check {
  margin-left: auto;
  font-size: 0.85rem;
  font-weight: bold;
  color: var(--primary);
}
.footer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
.hint { font-size: 0.85rem; color: var(--text-muted); }
.msg { padding: 10px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 0.9rem; }
.error-msg { background: rgba(239, 68, 68, 0.1); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.2); }
.success-msg { background: rgba(16, 185, 129, 0.1); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.2); }
</style>
