# 项目长期记忆

## 项目：suyuan-worker (d:\vscode\cloudflare)

- **技术栈**：Cloudflare Workers + Hono + D1 数据库 + KV (suyuankv) + Workers AI
- **域名**：m.suyuank.top / suyuank.top
- **架构**：Worker 后端服务 Vue SPA 前端（frontend/dist），通过 ASSETS binding 提供静态资源
- **入口**：`src/index.js`，路由模块在 `src/routes/`（auth.js, posts.js, sources.js），数据库封装在 `src/db.js`，服务在 `src/services/`（collector.js, summarizer.js）
- **D1 binding**：`suyuan` (database_name: suyuank)，KV binding: `suyuankv`
- **定时任务**：`triggers.crons` 每 4 小时采集 RSS 新闻，每 30 分钟采集热搜
- **安全特性**：CSP/HSTS/X-Frame-Options 等安全头（applySecurityHeaders）、CORS 白名单、CSRF Token（基于 KV）、IP 限流、SQL 参数白名单、XSS 转义

## 已知架构问题

- `src/index.js:229-233` 全局中间件对每个请求（含 SPA 静态页面）都执行 `db.init()`，里面包含大量 D1 建表/ALTER/索引操作，性能差。建议改为只在首次部署或 scheduled 任务执行。

## Cloudflare Workers Static Assets 关键行为（重要）

- `[assets]` 配置默认 `run_worker_first = false`：请求匹配到静态文件时 Assets 直接返回、**Worker 不执行**；只有不匹配静态文件的请求才 fall through 到 Worker。
- 因此首页 `/`（匹配 index.html）不经过 Worker，SPA 子路由如 `/post/4824`（无对应静态文件）才经过 Worker。
- `env.ASSETS.fetch()` 返回的 Response headers 是 **immutable** 的，直接调用 `headers.set()` 会抛 TypeError。修改前必须 `new Response(old.body, old)` 创建副本。
- `not_found_handling = "single-page-application"` 在 ASSETS.fetch 找不到文件时返回 index.html（200）。
- 若要让特定路由优先经过 Worker（如鉴权），可配置 `run_worker_first = ["/api/*"]`。
