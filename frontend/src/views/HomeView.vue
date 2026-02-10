<script setup>
import { ref } from 'vue'

const posts = ref([
  { id: 1, title: 'Welcome to Rin', date: '2024-02-10', summary: 'This is the start of something new.', tags: ['rin', 'update'] },
  { id: 2, title: 'Glassmorphism Design', date: '2024-02-09', summary: 'Exploring the beauty of frosted glass UI.', tags: ['ui', 'design'] }
])
</script>

<template>
  <div class="home-view">
    <div class="hero">
      <h1>Rin<span class="highlight">.</span></h1>
      <p class="subtitle">A modern serverless blog system.</p>
    </div>

    <div class="post-grid">
      <div v-for="post in posts" :key="post.id" class="card post-card">
        <div class="card-content">
          <span class="date">{{ post.date }}</span>
          <h2 class="post-title">
            <RouterLink :to="'/post/' + post.id">{{ post.title }}</RouterLink>
          </h2>
          <p class="summary">{{ post.summary }}</p>
          <div class="tags">
            <span v-for="tag in post.tags" :key="tag" class="tag">#{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  margin-bottom: 60px;
  padding: 40px 0;
}

h1 {
  font-size: 4rem;
  margin: 0;
  line-height: 1.1;
  background: linear-gradient(180deg, #fff, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.highlight {
  color: var(--primary);
  -webkit-text-fill-color: var(--primary);
}

.subtitle {
  color: var(--text-muted);
  font-size: 1.2rem;
  margin-top: 10px;
}

.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 30px;
}

.post-card {
  padding: 30px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.date {
  font-family: var(--font-code);
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 10px;
  display: block;
}

.post-title a {
  color: #fff;
  font-size: 1.5rem;
  line-height: 1.3;
}

.post-title a:hover {
  color: var(--primary);
}

.summary {
  color: var(--text-muted);
  margin: 15px 0 25px;
  flex-grow: 1;
}

.tags {
  display: flex;
  gap: 10px;
}

.tag {
  font-size: 0.75rem;
  color: var(--primary);
  background: rgba(14, 165, 233, 0.1);
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid rgba(14, 165, 233, 0.2);
}
</style>
