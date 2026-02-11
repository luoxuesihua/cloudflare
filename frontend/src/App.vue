<script setup>
import { ref } from 'vue'
import { RouterView, RouterLink } from 'vue-router'
import { useAuth } from './composables/useAuth'
import { useRouter } from 'vue-router'

const { isLoggedIn, isAdmin, user, logout } = useAuth()
const router = useRouter()
const menuOpen = ref(false)

const handleLogout = () => {
  logout()
  menuOpen.value = false
  router.push('/')
}

const closeMenu = () => {
  menuOpen.value = false
}
</script>

<template>
  <div class="app-container">
    <header class="main-header glass-panel">
      <div class="container header-content">
        <RouterLink to="/" class="logo" @click="closeMenu">
          RIN<span class="dot">.</span>
        </RouterLink>

        <!-- 汉堡菜单按钮 (移动端) -->
        <button class="menu-toggle" @click="menuOpen = !menuOpen" :class="{ active: menuOpen }">
          <span></span>
          <span></span>
          <span></span>
        </button>

        <!-- 导航 -->
        <nav :class="{ open: menuOpen }">
          <RouterLink to="/" class="nav-link" @click="closeMenu">首页</RouterLink>
          <template v-if="isLoggedIn">
            <RouterLink to="/write" class="nav-link" @click="closeMenu">写文章</RouterLink>
            <RouterLink to="/admin" class="nav-link" @click="closeMenu">{{ isAdmin ? '管理后台' : '个人中心' }}</RouterLink>
            <a href="#" class="nav-link" @click.prevent="handleLogout">退出</a>
          </template>
          <template v-else>
            <RouterLink to="/login" class="nav-link" @click="closeMenu">登录</RouterLink>
            <RouterLink to="/register" class="nav-link" @click="closeMenu">注册</RouterLink>
          </template>
        </nav>
      </div>
    </header>

    <!-- 移动端菜单遮罩 -->
    <div v-if="menuOpen" class="menu-overlay" @click="closeMenu"></div>

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

/* ===== Header ===== */
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
  z-index: 110;
}

.dot {
  color: var(--primary);
}

/* ===== 桌面端导航 ===== */
nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  color: var(--text-muted);
  font-weight: 500;
  padding: 8px 14px;
  border-radius: 8px;
  transition: all 0.2s;
  font-size: 0.95rem;
}

.nav-link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.nav-link.router-link-exact-active {
  color: var(--primary);
}

/* ===== 汉堡按钮 (默认隐藏) ===== */
.menu-toggle {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  z-index: 110;
  -webkit-tap-highlight-color: transparent;
}

.menu-toggle span {
  display: block;
  width: 24px;
  height: 2px;
  background: var(--text-main);
  border-radius: 2px;
  transition: all 0.3s;
}

.menu-toggle.active span:nth-child(1) {
  transform: rotate(45deg) translate(5px, 5px);
}

.menu-toggle.active span:nth-child(2) {
  opacity: 0;
}

.menu-toggle.active span:nth-child(3) {
  transform: rotate(-45deg) translate(5px, -5px);
}

.menu-overlay {
  display: none;
}

/* ===== 内容区 ===== */
.main-content {
  flex: 1;
  padding-top: 30px;
  padding-bottom: 40px;
}

.main-footer {
  padding: 30px 0;
  text-align: center;
  color: var(--text-muted);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  margin-top: auto;
  font-size: 0.85rem;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .menu-toggle {
    display: flex;
  }

  nav {
    position: fixed;
    top: 0;
    right: -280px;
    width: 280px;
    height: 100vh;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: calc(var(--header-height) + 20px) 20px 20px;
    background: rgba(5, 5, 5, 0.98);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    transition: right 0.3s ease;
    z-index: 105;
    overflow-y: auto;
  }

  nav.open {
    right: 0;
  }

  .nav-link {
    padding: 14px 16px;
    font-size: 1.05rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0;
  }

  .menu-overlay {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99;
  }

  .main-content {
    padding-top: 20px;
  }
}
</style>
