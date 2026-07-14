
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    target: 'es2018',
    rollupOptions: {
      output: {
        // 将 Vue / vue-router 等稳定依赖拆分为独立 vendor chunk，
        // 业务代码变更不会使其 hash 失效，从而跨版本命中浏览器/CDN 缓存
        manualChunks: {
          vue: ['vue', 'vue-router']
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true
      }
    }
  }
})
