<script setup>
import { RouterView, RouterLink } from 'vue-router'
import { useAuth } from './composables/useAuth'
import { useRouter } from 'vue-router'

const { isLoggedIn, isAdmin, user, logout } = useAuth()
const router = useRouter()

const handleLogout = () => {
  logout()
  router.push('/')
}
</script>

<template>
  <div class="app-container">
    <header class="main-header glass-panel">
      <div class="container header-content">
        <RouterLink to="/" class="logo">
          RIN<span class="dot">.</span>
        </RouterLink>

        <nav>
          <RouterLink to="/" class="nav-link">首页</RouterLink>
          <template v-if="isLoggedIn">
            <RouterLink to="/write" class="nav-link">写文章</RouterLink>
            <RouterLink to="/profile" class="nav-link">个人中心</RouterLink>
            <RouterLink v-if="isAdmin" to="/admin" class="nav-link">管理后台</RouterLink>
            <a href="#" class="nav-link" @click.prevent="handleLogout">退出</a>
          </template>
          <template v-else>
            <RouterLink to="/login" class="nav-link">登录</RouterLink>
            <RouterLink to="/register" class="nav-link">注册</RouterLink>
          </template>
        </nav>
      </div>
    </header>

    <main class="main-content container">
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>

    <footer class="main-footer">
      <div class="container">
        <p>&copy; 2024 Rin · 基于 Cloudflare Workers 构建</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-header {
  height: var(--header-height);
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-content {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -1px;
}

.dot {
  color: var(--primary);
}

nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-link {
  color: var(--text-muted);
  font-weight: 500;
  position: relative;
  padding: 6px 12px;
  border-radius: 6px;
  transition: all 0.2s;
}

.nav-link:hover {
  color: #fff;
  background: rgba(255,255,255,0.05);
}

.nav-link.router-link-exact-active {
  color: var(--primary);
}

.main-content {
  flex: 1;
  padding-top: 40px;
  padding-bottom: 40px;
}

.main-footer {
  padding: 40px 0;
  text-align: center;
  color: var(--text-muted);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  margin-top: auto;
  font-size: 0.9rem;
}
</style>
