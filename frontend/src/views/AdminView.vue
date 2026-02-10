<script setup>
import { ref } from 'vue'

const activeTab = ref('posts')
</script>

<template>
  <div class="admin-view">
    <div class="glass-panel sidebar">
      <h3>Admin</h3>
      <nav>
        <a href="#" :class="{ active: activeTab === 'posts' }" @click.prevent="activeTab = 'posts'">Posts</a>
        <a href="#" :class="{ active: activeTab === 'users' }" @click.prevent="activeTab = 'users'">Users</a>
        <a href="#" :class="{ active: activeTab === 'params' }" @click.prevent="activeTab = 'params'">Settings</a>
      </nav>
    </div>

    <div class="content glass-panel">
      <div v-if="activeTab === 'posts'">
        <div class="header-actions">
          <h2>Manage Posts</h2>
          <button class="btn btn-primary">New Post</button>
        </div>
        <p class="placeholder">Post management interface will go here.</p>
      </div>
      <div v-if="activeTab === 'users'">
        <h2>Users</h2>
        <p class="placeholder">User management interface will go here.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 30px;
}

.sidebar {
  padding: 30px;
  border-radius: var(--radius-md);
  height: fit-content;
}

.sidebar h3 {
  margin-top: 0;
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar nav a {
  display: block;
  padding: 12px 15px;
  margin-bottom: 5px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}

.sidebar nav a:hover, .sidebar nav a.active {
  background: rgba(14, 165, 233, 0.1);
  color: var(--primary);
}

.content {
  padding: 40px;
  border-radius: var(--radius-md);
  min-height: 500px;
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.placeholder {
  color: var(--text-muted);
  font-style: italic;
  padding: 40px;
  text-align: center;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
}
</style>
