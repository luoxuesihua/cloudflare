# 项目长期记忆

## 项目：suyuan-worker (d:\vscode\cloudflare)

- **技术栈**：Cloudflare Workers + Hono + D1 数据库 + KV (suyuankv) + Workers AI
- **域名**：m.suyuank.top / suyuank.top
- **架构**：Worker 后端服务 Vue SPA 前端（frontend/dist），通过 ASSETS binding 提供静态资源
- **入口**：`src/index.js`，路由模块在 `src/routes/`（auth.js, posts.js, sources.js），数据库封装在 `src/db.js`，服务在 `src/services/`（collector.js, summarizer.js）
- **D1 binding**：`suyuan` (database_name: suyuank)，KV binding: `suyuankv`
- **定时任务**：`triggers.crons` 每 4 小时采集 RSS 新闻，每 30 分钟采集热搜
- **安全特性**：CSP/HSTS/X-Frame-Options 等安全头（applySecurityHeaders）、CORS 白名单、CSRF Token（基于 KV）、IP 限流、SQL 参数白名单、XSS 转义

## 已知架构问题（已修复）

- **`db.init()` 每请求执行问题已修复（2026-07-14）**：原全局中间件 `app.use('*', db.init)` 让每个请求都跑 18 条 D1 建表/ALTER/索引语句。现已在 `src/db.js` 用模块级 `schemaInitPromise` 记忆化（每个 isolate 仅执行一次），并把初始化中间件从全局收紧为 `app.use('/api/*', ...)`，SPA 静态路由不再触发 DB。
- **首页性能优化已落地（2026-07-14）**：① `db.init()` 记忆化 + 仅限 `/api/*`；② 匿名用户不再页面加载时请求 CSRF Token，改为注册/登录写操作前惰性获取（RegisterView 写前 `await auth.refreshCsrf()`）；③ 字体 `@import` 改为 `index.html` 的 preconnect+stylesheet；④ `vite.config.js` 增加 `manualChunks` 拆出 vue vendor chunk，`wrangler.toml` 加 `run_worker_first = ["/api/*"]`；⑤ `findAllPosts` 用 `COUNT(*) OVER()` 合并分页+总数查询，省一次 D1 查询。
- 注意：`collector.js` 内部仍直接调用 `db.init()`，因记忆化后同样只跑一次，无需改动。

## Cloudflare Workers Static Assets 关键行为（重要）

- `[assets]` 配置默认 `run_worker_first = false`：请求匹配到静态文件时 Assets 直接返回、**Worker 不执行**；只有不匹配静态文件的请求才 fall through 到 Worker。
- 因此首页 `/`（匹配 index.html）不经过 Worker，SPA 子路由如 `/post/4824`（无对应静态文件）才经过 Worker。
- `env.ASSETS.fetch()` 返回的 Response headers 是 **immutable** 的，直接调用 `headers.set()` 会抛 TypeError。修改前必须 `new Response(old.body, old)` 创建副本。
- `not_found_handling = "single-page-application"` 在 ASSETS.fetch 找不到文件时返回 index.html（200）。
- 若要让特定路由优先经过 Worker（如鉴权），可配置 `run_worker_first = ["/api/*"]`。
