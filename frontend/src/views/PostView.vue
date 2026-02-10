<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const post = ref(null)
const isLoading = ref(true)

onMounted(async () => {
    // Mock fetch
    setTimeout(() => {
        post.value = {
            id: route.params.id,
            title: 'Glassmorphism Design',
            date: '2024-02-09',
            author: 'RinUser',
            content: `
# Introduction to Glassmorphism

Glassmorphism is a design style that emphasizes light vs dark objects, placed on top of colorful backgrounds.

## Key Features
- Translucency (frosted glass effect)
- Vivid background colors
- Light borders
            `,
            tags: ['ui', 'design']
        }
        isLoading.value = false
    }, 500)
})
</script>

<template>
  <div class="post-view">
    <div v-if="isLoading" class="loading">Loading...</div>
    
    <article v-else-if="post" class="glass-panel post-content">
        <header class="post-header">
            <h1 class="title">{{ post.title }}</h1>
            <div class="meta">
                <span>{{ post.date }}</span>
                <span>@{{ post.author }}</span>
            </div>
            <div class="tags">
                <span v-for="tag in post.tags" :key="tag" class="tag">#{{ tag }}</span>
            </div>
        </header>
        
        <hr class="divider"/>
        
        <div class="markdown-body">
            <!-- In real app, render Markdown here -->
            <pre>{{ post.content }}</pre>
        </div>
    </article>
    
    <div v-else class="not-found">Post not found</div>
  </div>
</template>

<style scoped>
.post-view {
    max-width: 800px;
    margin: 0 auto;
}

.post-content {
    padding: 40px;
    border-radius: var(--radius-md);
}

.title {
    font-size: 2.5rem;
    margin-bottom: 0.5em;
    line-height: 1.2;
}

.meta {
    color: var(--text-muted);
    font-family: var(--font-code);
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
}

.tags {
    display: flex;
    gap: 10px;
}

.tag {
    color: var(--secondary);
    font-size: 0.9rem;
}

.divider {
    border: 0;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 30px 0;
}

.markdown-body pre {
    background: rgba(0, 0, 0, 0.3);
    padding: 20px;
    border-radius: var(--radius-sm);
    overflow-x: auto;
    font-family: var(--font-code);
}
</style>
