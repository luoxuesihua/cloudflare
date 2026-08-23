# 万象资讯 (suyuan-worker)

基于 **Cloudflare Workers (Hono)** 的现代资讯聚合博客系统：自动抓取 40+ RSS 源与热搜榜单，用 Workers AI 生成摘要，Vue 3 SPA 提供阅读与后台管理。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Vue Router + marked + DOMPurify |
| 后端 | Hono（Cloudflare Workers 边缘运行时） |
| 数据库 | Cloudflare D1 (SQLite) |
| 缓存/会话 | Cloudflare KV（Token 会话、验证码、去重、任务进度）+ Cache API（边缘响应缓存） |
| 邮件 | Resend API（验证码邮件） |
| AI | Cloudflare Workers AI（文章摘要 + 要点提炼） |
| 静态资源 | Workers Static Assets（SPA） |
| 采集 | 自建 RSS/Atom 解析 + 热搜 HTML 解析引擎 |

## 项目结构

```
├── frontend/                 # Vue 3 前端 (Vite)
│   ├── src/
│   │   ├── views/            # 页面组件 (首页/文章/登录/注册/写文章/后台)
│   │   ├── composables/      # useAuth（鉴权 + 主题 + CSRF）
│   │   ├── router/           # 路由配置
│   │   ├── utils/            # api.js（SWR 缓存 + 请求去重）
│   │   └── styles/           # 设计系统（暗黑/浅色/跟随系统）
│   └── dist/                 # 编译产物（部署时自动生成）
├── src/                      # Cloudflare Worker API (Hono)
│   ├── index.js              # 入口：中间件 + 路由 + 静态资源转发 + 定时任务
│   ├── db.js                 # D1 数据库辅助（建表/索引/CRUD）
│   ├── cache.js              # 多级缓存（Cache API / KV）
│   ├── email.js              # 邮件发送工具 (Resend)
│   ├── routes/
│   │   ├── auth.js           # 认证 API（注册/登录/验证码/用户管理/偏好）
│   │   ├── posts.js          # 文章/评论/阅读历史 API
│   │   └── sources.js        # 信息源管理 + 同步任务 API
│   └── services/
│       ├── collector.js      # 万象资讯采集引擎（RSS + 热搜）
│       └── summarizer.js     # AI 摘要与要点提炼
├── wrangler.toml             # Cloudflare 配置 (D1 / KV / AI / 定时任务)
└── test_rss.js               # RSS 实例连通性测试脚本
```

## 快速开始

### 前置条件

- Node.js 20+（Cloudflare 构建环境使用 Node 24）
- Wrangler CLI（`npm install -g wrangler`，可选，本地部署时使用）
- Cloudflare 账号（已绑定 D1 和 KV）
- Resend 账号（发送验证码邮件）

### 环境配置

**必需的 Secret / 变量：**

| 名称 | 类型 | 说明 |
|------|------|------|
| `RESEND_API_TOKEN`（或 `RESEND_API_KEY`） | Secret | Resend 邮件 API Key（用于发送验证码） |
| `CLOUDFLARE_API_TOKEN` | Secret（仅 GitHub Actions 部署需要） | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Secret（仅 GitHub Actions 部署需要） | Cloudflare 账户 ID |

D1 数据库、KV 命名空间、Workers AI 绑定已在 `wrangler.toml` 中声明，Cloudflare Git 集成部署时会自动关联。

```bash
# 本地部署时配置 Resend API Key（加密存储，不写入代码）
npx wrangler secret put RESEND_API_TOKEN

# 部署新版本
npx wrangler deploy
```

发信地址已在 `wrangler.toml` 的 `[vars]` 中配置：

```toml
RESEND_FROM = "noreply@suyuank.top"
```

本地开发时 `wrangler.toml` 的 `ENVIRONMENT = "production"` 同样生效，如需区分环境可改用 `[env.dev]` 或 `.dev.vars`。

### 本地开发

```bash
# 1. 安装依赖
npm install
cd frontend && npm install && cd ..

# 2. 启动后端 (端口 8787)
npm run dev

# 3. 启动前端 (端口 5173，另开终端)
cd frontend && npm run dev
```

前端已配置代理（`vite.config.js`），`/api` 请求自动转发到后端 `http://127.0.0.1:8787`。

### 部署到 Cloudflare

本项目支持两种部署方式：

**方式一：Cloudflare Direct Git 集成（推荐，已启用）**

在 Cloudflare Dashboard 中将本仓库连接为 Worker 的 Git 数据源后，推送 `main` 分支即自动触发构建部署。构建环境会执行 `wrangler.toml` 中的 `[build].command`：

```toml
[build]
command = "cd frontend && npm install && npm run build"
```

> ⚠️ 该命令**必须自包含前端依赖安装**。Cloudflare 构建环境默认只安装仓库根目录依赖，不会执行 GitHub Actions 里的 `npm install` 步骤，因此 `npm install` 不能省略，否则会出现 `sh: 1: vite: not found` 构建失败。

**方式二：本地手动部署**

```bash
# 一键编译前端 + 部署 Worker（predeploy 已配置前端构建）
npm run deploy
```

> 注：`.github/workflows/deploy.yml` 也提供 GitHub Actions 自动部署，使用 `cloudflare/wrangler-action`，需要仓库 Secrets 中配置 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`。

## 功能特性

### 用户认证
- ✅ 邮箱验证码注册（分步：发送验证码 → 输入验证码 + 密码）
- ✅ 密码登录（用户名/邮箱 + 密码）
- ✅ 验证码登录（邮箱 + 验证码，Tab 切换）
- ✅ 密码复杂度校验（≥8 位 + 大小写字母 + 数字）
- ✅ 验证码防刷（60 秒冷却 + 5 分钟过期 + **失败 5 次作废** + 一次性使用）
- ✅ Token 会话管理（KV，24 小时过期，存于 `Authorization` header，非 Cookie）

### 用户管理（管理员）
- ✅ 用户列表 / 添加 / 编辑 / 删除（不可删除自身）
- ✅ 用户名 / 邮箱 / 手机号唯一性校验
- ✅ 个人信息编辑、修改密码
- ✅ 兴趣标签设置（用于首页个性化推荐）
- ✅ 主题偏好（暗黑 / 浅色 / 跟随系统）

### 内容管理
- ✅ 文章 CRUD（用户可发布，管理员可管理）
- ✅ 标签系统、分类（6 大分类：综合/AI/编程/运维/产品/财经）
- ✅ 评论系统（登录可评，作者或管理员可删）
- ✅ 阅读历史（记录 / 查看 / 清空）
- ✅ 管理后台（文章、源、用户、阅读历史）

### 资讯采集（自动化）
- ✅ RSS 多源聚合：40+ 优质信息源，覆盖 6 大分类
- ✅ 热搜榜单采集：知乎热榜、百度热搜（每 30 分钟）
- ✅ 多实例容灾：每个源配置主 URL + 多个备份 RSSHub 实例
- ✅ KV 去重：基于链接 SHA-256 指纹，14 天窗口防重复入库
- ✅ 中文内容过滤：非 dev/ai 分类要求中文占比 ≥10%
- ✅ 手动触发采集 / 全量同步，后台异步执行 + 实时进度追踪

### AI 能力（Workers AI）
- ✅ 采集后异步生成 AI 摘要（≤100 字）
- ✅ 核心要点提炼（3-5 条）
- ✅ 后台手动对单篇生成摘要 + 要点

### UI/UX
- ✅ 玻璃拟态暗黑主题 + 浅色 / 跟随系统
- ✅ 响应式设计（桌面端表格 + 移动端卡片）
- ✅ SPA 路由（前端路由不会 404）
- ✅ 多级缓存（边缘 Cache API + 前端 SWR + sessionStorage）

### 安全
- ✅ CSP / HSTS / X-Frame-Options / X-Content-Type-Options 等响应头
- ✅ 严格 CORS 白名单（含 localhost 仅开发期，生产可经 `CORS_ORIGINS` 覆盖）
- ✅ 写操作 CSRF 双重提交校验（已登录请求）
- ✅ 文章内容 marked + DOMPurify 净化渲染，限制 https 资源
- ✅ PBKDF2 密码哈希（100k 迭代，带随机盐），兼容旧 SHA-256 自动升级
- ✅ SQL 参数化 + 排序字段白名单

### 规划中
- 🔲 GitHub OAuth 登录
- 🔲 图片上传 (R2)
- 🔲 友情链接

## 定时任务

`wrangler.toml` 配置两个 cron：

| 频率 | 任务 |
|------|------|
| 每 4 小时 (`0 */4 * * *`) | RSS 新闻采集 |
| 每 30 分钟 (`*/30 * * * *`) | 热搜榜单采集 |

## API 接口

### 认证 `/api/auth`
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/send-code` | 发送邮箱验证码 | 公开 |
| POST | `/register` | 注册（需验证码） | 公开 |
| POST | `/login` | 密码登录 | 公开 |
| POST | `/login-code` | 验证码登录 | 公开 |
| GET | `/me` | 获取当前用户信息 | 登录 |
| PUT | `/me` | 更新个人信息 | 登录 |
| POST | `/password` | 修改密码 | 登录 |
| PUT | `/interests` | 更新兴趣标签 | 登录 |
| PUT | `/theme` | 更新主题偏好 | 登录 |
| GET | `/categories` | 获取分类列表（公开缓存） | 公开 |
| GET | `/users` | 用户列表 | 管理员 |
| POST | `/users/add` | 添加用户 | 管理员 |
| PUT | `/users/:id` | 编辑用户 | 管理员 |
| DELETE | `/users/:id` | 删除用户 | 管理员 |
| GET | `/csrf-token` | 获取 CSRF Token | 已登录 |

### 文章 `/api/posts`
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 文章列表（支持 tag/category/source/keyword 筛选、排序、分页、个性化推荐） | 公开 |
| GET | `/stats` | 分类统计 | 公开 |
| GET | `/:id` | 文章详情 | 公开 |
| POST | `/` | 创建文章 | 登录 |
| DELETE | `/:id` | 删除文章 | 管理员 |
| POST | `/bulk-delete` | 批量删除 | 管理员 |
| POST | `/collect` | 手动采集 RSS | 管理员 |
| POST | `/collect-hot` | 手动采集热搜 | 管理员 |
| POST | `/:id/summarize` | 生成 AI 摘要 + 要点 | 管理员 |
| GET | `/:id/comments` | 评论列表 | 公开 |
| POST | `/:id/comments` | 发表评论 | 登录 |
| DELETE | `/:id/comments/:commentId` | 删除评论 | 作者/管理员 |
| POST | `/:id/read` | 记录阅读历史 | 登录 |
| GET | `/history` | 阅读历史列表 | 登录 |
| DELETE | `/history` | 清空阅读历史 | 登录 |

### 信息源 `/api/sources`
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/` | 源列表（首次访问自动种子化预设源） | 管理员 |
| GET | `/categories` | 源分类列表 | 管理员 |
| POST | `/` | 添加源 | 管理员 |
| PUT | `/:id` | 更新源 | 管理员 |
| PUT | `/:id/toggle` | 启用/停用 | 管理员 |
| DELETE | `/:id` | 删除源 | 管理员 |
| POST | `/:id/sync` | 同步单个源 | 管理员 |
| POST | `/sync-all` | 全量同步（后台异步） | 管理员 |
| GET | `/sync-all/status` | 同步任务进度 | 管理员 |

## 许可证

MIT
