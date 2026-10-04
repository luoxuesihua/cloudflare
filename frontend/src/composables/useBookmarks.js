import { ref, computed } from 'vue'

const BOOKMARK_KEY = 'suyuan_saved_bookmarks_v1'

function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveBookmarksToStorage(items) {
  try {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(items.slice(0, 100)))
    return true
  } catch {
    return false
  }
}

// 全局响应式状态，保证跨组件同步
const bookmarks = ref(loadBookmarks())

export function useBookmarks() {
  const isBookmarked = (id) => {
    if (!id) return false
    return bookmarks.value.some(b => Number(b.id) === Number(id))
  }

  const toggleBookmark = (post) => {
    if (!post || !post.id) return false
    const id = Number(post.id)
    const exists = isBookmarked(id)

    if (exists) {
      bookmarks.value = bookmarks.value.filter(b => Number(b.id) !== id)
    } else {
      const item = {
        id: post.id,
        title: post.title,
        username: post.username,
        source_name: post.source_name,
        category: post.category,
        tags: post.tags,
        hot_score: post.hot_score || 50,
        takeaway: post.takeaway || '',
        summary: post.summary || post.ai_summary || post.snippet || '',
        ai_summary: post.ai_summary || '',
        created_at: post.created_at,
        saved_at: new Date().toISOString()
      }
      bookmarks.value = [item, ...bookmarks.value.filter(b => Number(b.id) !== id)].slice(0, 100)
    }

    saveBookmarksToStorage(bookmarks.value)
    return !exists
  }

  const removeBookmark = (id) => {
    bookmarks.value = bookmarks.value.filter(b => Number(b.id) !== Number(id))
    saveBookmarksToStorage(bookmarks.value)
  }

  const clearBookmarks = () => {
    bookmarks.value = []
    saveBookmarksToStorage([])
  }

  const bookmarkCount = computed(() => bookmarks.value.length)

  return {
    bookmarks,
    bookmarkCount,
    isBookmarked,
    toggleBookmark,
    removeBookmark,
    clearBookmarks
  }
}
