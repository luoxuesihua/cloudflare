<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

// 子组件引入
import AdminPostsTab from './admin/AdminPostsTab.vue'
import AdminSourcesTab from './admin/AdminSourcesTab.vue'
import AdminUsersTab from './admin/AdminUsersTab.vue'
import UserProfileTab from './admin/UserProfileTab.vue'
import UserHistoryTab from './admin/UserHistoryTab.vue'
import UserInterestsTab from './admin/UserInterestsTab.vue'

const router = useRouter()
const { isLoggedIn, isAdmin } = useAuth()

// 未登录用户重定向到登录页
if (!isLoggedIn.value) {
  router.push('/login?redirect=/admin')
}

// 默认 Tab：管理员看文章管理，普通用户看个人资料
const activeTab = ref(isAdmin.value ? 'posts' : 'profile')

// 菜单配置
const menuItems = computed(() => {
  if (isAdmin.value) {
    return [
      { key: 'posts', label: '📄 文章管理' },
      { key: 'sources', label: '📡 源管理' },
      { key: 'users', label: '👥 用户管理' },
      { key: 'profile', label: '👤 个人资料' },
      { key: 'interests', label: '🏷️ 兴趣偏好' },
      { key: 'history', label: '🕒 阅读历史' }
    ]
  }
  return [
    { key: 'profile', label: '👤 个人资料' },
    { key: 'interests', label: '🏷️ 兴趣偏好' },
    { key: 'history', label: '🕒 阅读历史' }
  ]
})

function switchTab(key) {
  activeTab.value = key
}
</script>

<template>
  <div class="admin-view">
    <!-- 移动端 Tab 滚动条 -->
    <div class="mobile-tabs">
      <button
        v-for="item in menuItems"
        :key="item.key"
        :class="{ active: activeTab === item.key }"
        @click="switchTab(item.key)"
      >
        {{ item.label }}
      </button>
    </div>

    <!-- 桌面端侧边栏 -->
    <aside class="sidebar glass-panel">
      <h3>{{ isAdmin ? '管理后台' : '个人中心' }}</h3>
      <nav>
        <a
          v-for="item in menuItems"
          :key="item.key"
          href="#"
          :class="{ active: activeTab === item.key }"
          @click.prevent="switchTab(item.key)"
        >
          {{ item.label }}
        </a>
      </nav>
    </aside>

    <!-- 主内容区 -->
    <section class="content glass-panel">
      <!-- 文章管理 -->
      <AdminPostsTab v-if="activeTab === 'posts' && isAdmin" />

      <!-- 源管理 -->
      <AdminSourcesTab v-else-if="activeTab === 'sources' && isAdmin" />

      <!-- 用户管理 -->
      <AdminUsersTab v-else-if="activeTab === 'users' && isAdmin" />

      <!-- 个人资料与修改密码 -->
      <UserProfileTab v-else-if="activeTab === 'profile'" />

      <!-- 兴趣偏好设置 -->
      <UserInterestsTab v-else-if="activeTab === 'interests'" />

      <!-- 阅读历史记录 -->
      <UserHistoryTab v-else-if="activeTab === 'history'" />
    </section>
  </div>
</template>

<style scoped>
.admin-view {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 20px;
  align-items: start;
}

.mobile-tabs {
  display: none;
}

/* ===== 侧边栏 ===== */
.sidebar {
  padding: 22px;
  border-radius: var(--radius-md);
  position: sticky;
  top: calc(var(--header-height) + 20px);
}

.sidebar h3 {
  margin-top: 0;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 1rem;
  color: #F8FAFC;
}

.sidebar nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar nav a {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.sidebar nav a:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #F8FAFC;
}

.sidebar nav a.active {
  background: rgba(14, 165, 233, 0.15);
  color: var(--primary);
  font-weight: 600;
}

/* ===== 内容主面板 ===== */
.content {
  padding: 28px;
  border-radius: var(--radius-md);
  min-height: 480px;
}

/* ===== 移动端响应式 ===== */
@media (max-width: 768px) {
  .admin-view {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .sidebar {
    display: none;
  }

  .mobile-tabs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 8px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .mobile-tabs::-webkit-scrollbar {
    display: none;
  }

  .mobile-tabs button {
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    color: var(--text-muted);
    font-size: 0.85rem;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s;
  }

  .mobile-tabs button.active {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
    font-weight: 600;
  }

  .content {
    padding: 18px;
  }
}
</style>
