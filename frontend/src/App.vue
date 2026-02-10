<script setup>
import { RouterView, RouterLink } from 'vue-router'
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
          <RouterLink to="/login" class="nav-link">登录</RouterLink>
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
        <p>&copy; 2024 Rin Project based on Cloudflare Workers</p>
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

.nav-link {
  margin-left: 20px;
  color: var(--text-muted);
  font-weight: 500;
  position: relative;
}

.nav-link:hover, .nav-link.router-link-active {
  color: #fff;
}

.nav-link.router-link-active::after {
  content: '';
  position: absolute;
  bottom: -24px;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--primary);
  box-shadow: 0 0 10px var(--primary);
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
}
</style>
