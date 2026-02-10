<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const isLoading = ref(false)

const handleLogin = async () => {
  isLoading.value = true
  // Mock login for now
  setTimeout(() => {
    isLoading.value = false
    router.push('/admin')
  }, 1000)
}
</script>

<template>
  <div class="login-view">
    <div class="glass-panel login-card">
      <h2>Identify Yourself</h2>
      <form @submit.prevent="handleLogin">
        <div class="input-group">
          <label>Username</label>
          <input type="text" v-model="username" class="input-field" placeholder="Enter identity..." />
        </div>
        <div class="input-group">
          <label>Password</label>
          <input type="password" v-model="password" class="input-field" placeholder="Enter secret..." />
        </div>
        <button type="submit" class="btn btn-primary full-width" :disabled="isLoading">
          {{ isLoading ? 'Processing...' : 'Access System' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}

.login-card {
  padding: 40px;
  width: 100%;
  max-width: 400px;
  border-radius: var(--radius-md);
}

h2 {
  text-align: center;
  margin-bottom: 30px;
  font-size: 1.8rem;
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
}

.input-field:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 15px rgba(14, 165, 233, 0.2);
}

.full-width {
  width: 100%;
  margin-top: 10px;
  justify-content: center;
}
</style>
