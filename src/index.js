export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      if (method === "GET") {
        if (url.pathname === "/") return this.renderBlogList(request, env);
        if (url.pathname === "/login") {
          const user = await this.auth(request, env);
          if (user) return Response.redirect(url.origin + "/profile", 302);
          return this.renderUI('login');
        }
        if (url.pathname === "/register") return this.renderUI('register');
        if (url.pathname === "/docs") return this.renderDocs();
        if (url.pathname === "/blog") return this.renderBlogList(request, env);
        if (url.pathname === "/write") {
          const user = await this.auth(request, env);
          if (!user) return Response.redirect(url.origin + "/login?redirect=" + encodeURIComponent(url.pathname), 302);
          return this.renderBlogEditor(request, env);
        }
        if (url.pathname === "/profile") {
          const user = await this.auth(request, env);
          if (!user) return Response.redirect(url.origin + "/login?redirect=" + encodeURIComponent(url.pathname), 302);
          return this.renderProfile(request, env, user);
        }
        if (url.pathname === "/admin/users/add") return this.renderAddUser(request, env);
        if (url.pathname.startsWith("/blog/")) {
          const id = url.pathname.split('/')[2];
          if (id) return this.renderBlogView(env, id);
        }
        if (url.pathname === "/admin") return this.renderAdminUI(request, env);
      }

      if (method === "POST") {
        if (url.pathname === "/api/register") return this.handleRegister(request, env);
        if (url.pathname === "/api/login") return this.handleLogin(request, env);
        if (url.pathname === "/api/notes") return this.handleCreateNote(request, env);
        if (url.pathname === "/api/password") return this.handleChangePassword(request, env);
        if (url.pathname === "/api/users/add") return this.handleAddUser(request, env);
      }
      return new Response("Not Found", { status: 404 });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  },

  async handleRegister(request, env) {
    const { username, password } = await request.json();
    const hash = await this.hashPassword(password);
    const userCount = await env.suyuan.prepare("SELECT count(*) as count FROM users").first("count");
    const role = userCount === 0 ? 'admin' : 'user';

    await env.suyuan.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
      .bind(username, hash, role).run();

    return new Response(JSON.stringify({ success: true }), { status: 201 });
  },

  async handleLogin(request, env) {
    const { username, password } = await request.json();
    const hash = await this.hashPassword(password);
    const user = await env.suyuan.prepare("SELECT id, username, role FROM users WHERE username = ? AND password_hash = ?")
      .bind(username, hash).first();

    if (!user) return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });

    const token = crypto.randomUUID();
    await env.suyuankv.put(token, JSON.stringify(user), { expirationTtl: 86400 });

    return new Response(JSON.stringify({ token, role: user.role }), {
      headers: { "Content-Type": "application/json" }
    });
  },

  async handleCreateNote(request, env) {
    const user = await this.auth(request, env);
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const { title, content, tags } = await request.json();
    if (!title || !content) return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });

    await this.initDB(env);
    await env.suyuan.prepare("INSERT INTO notes (user_id, username, title, content, tags) VALUES (?, ?, ?, ?, ?)")
      .bind(user.id, user.username, title, content, tags || "").run();

    return new Response(JSON.stringify({ success: true }), { status: 201 });
  },

  async handleChangePassword(request, env) {
    const user = await this.auth(request, env);
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const { oldPassword, newPassword } = await request.json();
    if (!oldPassword || !newPassword) return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });

    const currentHash = await this.hashPassword(oldPassword);

    // Explicitly fetch the column value to avoid object/property ambiguity
    const dbHash = await env.suyuan.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first("password_hash");

    // Check if user exists (dbHash will be null if no row found)
    if (dbHash === null) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    if (dbHash !== currentHash) {
      // Return detailed error for debugging if needed, but standard logic implies mismatch
      return new Response(JSON.stringify({ error: "Incorrect old password" }), { status: 400 });
    }

    const newHash = await this.hashPassword(newPassword);
    await env.suyuan.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, user.id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  },

  async handleAddUser(request, env) {
    const user = await this.auth(request, env);
    if (!user || user.role !== 'admin') return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

    const { username, password, role } = await request.json();
    if (!username || !password) return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });

    // Check if user exists
    const existing = await env.suyuan.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return new Response(JSON.stringify({ error: "Username taken" }), { status: 409 });

    const hash = await this.hashPassword(password);
    const newRole = role === 'admin' ? 'admin' : 'user';

    await env.suyuan.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
      .bind(username, hash, newRole).run();

    return new Response(JSON.stringify({ success: true }), { status: 201 });
  },

  async renderBlogList(request, env) {
    await this.initDB(env);
    const url = new URL(request.url);
    const tagFilter = url.searchParams.get('tag');

    const { results } = await env.suyuan.prepare("SELECT id, title, username, created_at, tags FROM notes ORDER BY created_at DESC").all();

    let filteredResults = results;
    if (tagFilter) {
      filteredResults = results.filter(n => (n.tags || '').split(',').map(t => t.trim()).includes(tagFilter));
    }

    const list = filteredResults.map(n => {
      const tagsHtml = (n.tags || '').split(',').filter(t => t).map(t =>
        `<a href="/?tag=${t.trim()}" class="tag">#${t.trim()}</a>`
      ).join(' ');

      return `
      <article class="card">
        <h3><a href="/blog/${n.id}" class="title-link">${n.title}</a></h3>
        <div class="meta">
          <span class="date">${new Date(n.created_at).toLocaleDateString()}</span>
          <span class="author">@${n.username}</span>
        </div>
        <div class="tags">${tagsHtml}</div>
      </article>
    `}).join('') || '<p>暂无文章。</p>';

    return new Response(this.htmlTemplate(`
      <header class="page-header">
        <h1>博客</h1>
        ${tagFilter ? `<p>标签筛选: <strong>#${tagFilter}</strong> <a href="/" class="clear-filter">×</a></p>` : ''}
      </header>
      <div class="blog-list">
        ${list}
      </div>
    `, 'Blog'), { headers: { "Content-Type": "text/html" } });
  },

  async renderBlogView(env, id) {
    await this.initDB(env);
    const note = await env.suyuan.prepare("SELECT * FROM notes WHERE id = ?").bind(id).first();
    if (!note) return new Response("文章不存在", { status: 404 });

    const tagsHtml = (note.tags || '').split(',').filter(t => t).map(t => `<span class="tag">#${t.trim()}</span>`).join(' ');

    return new Response(this.htmlTemplate(`
      <article class="post-view">
        <header>
            <h1 class="post-title">${note.title}</h1>
            <div class="meta">
                <span>${new Date(note.created_at).toLocaleString()}</span>
                <span>@${note.username}</span>
            </div>
            <div class="tags">${tagsHtml}</div>
        </header>
        <hr class="divider">
        <div id="content" class="markdown-body">${note.content}</div> <!-- Raw markdown, handled by script -->
        <hr class="divider">
        <nav class="post-nav"><a href="/">← 返回博客</a></nav>
      </article>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
      <script>
        document.getElementById('content').innerHTML = marked.parse(document.getElementById('content').textContent);
      </script>
    `, note.title), { headers: { "Content-Type": "text/html" } });
  },

  async renderBlogEditor(request, env) {
    const user = await this.auth(request, env);
    if (!user) return new Response(this.htmlTemplate(`
      <h2>访问被拒绝</h2>
      <p>您必须 <a href="/">登录</a> 才能写文章。</p>
    `, '访问被拒绝'), { status: 403, headers: { "Content-Type": "text/html" } });

    return new Response(this.htmlTemplate(`
      <h2>撰写新文章</h2>
      <nav><a href="/">返回博客</a></nav>
      <div class="editor-form">
        <input type="text" id="title" placeholder="标题" class="input-field">
        <input type="text" id="tags" placeholder="标签 (用逗号分隔，例如 dev, life)" class="input-field">
        <textarea id="content" placeholder="使用 Markdown 编写您的文章..." class="textarea-field"></textarea>
        <div class="actions">
            <button onclick="publish()" class="btn-primary">发布</button>
        </div>
      </div>
      <script>
        async function publish() {
          const title = document.getElementById('title').value;
          const tags = document.getElementById('tags').value;
          const content = document.getElementById('content').value;
          if(!title || !content) return alert('请填写标题和内容');
          
          const res = await fetch('/api/notes', {
            method: 'POST',
            body: JSON.stringify({ title, content, tags })
          });
          
          if(res.ok) {
            window.location.href = '/blog';
          } else {
            const data = await res.json();
            alert(data.error || '创建文章失败');
          }
        }
      </script>
    `, '新文章'), { headers: { "Content-Type": "text/html" } });
  },

  async renderAdminUI(request, env) {
    const user = await this.auth(request, env);
    if (!user || user.role !== 'admin') return new Response("Forbidden", { status: 403 });

    const { results } = await env.suyuan.prepare("SELECT id, username, role, created_at FROM users").all();
    let rows = results.map(u => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.role}</td><td>${u.created_at}</td></tr>`).join('');

    return new Response(this.htmlTemplate(`
      <h2>管理后台</h2>
      <nav>
        <a href="/docs">查看文档</a> | <a href="/admin/users/add">添加用户</a> | <a href="/profile">个人中心</a> | <a href="/">退出登录</a>
      </nav>
      <h3>用户管理</h3>
      <table border="1" style="width:100%">${rows}</table>
    `, '管理后台'), { headers: { "Content-Type": "text/html" } });
  },

  renderProfile(request, env, user) {
    const adminLinks = user.role === 'admin' ? `
      <div class="card" style="border-color: var(--accent-secondary);">
        <h3>管理员功能</h3>
        <p>您拥有管理员权限，可以进行以下操作：</p>
        <div class="actions">
            <a href="/admin" class="btn-primary" style="display:inline-block; text-align:center; margin-right: 10px;">用户管理仪表盘</a>
            <a href="/admin/users/add" class="btn-primary" style="display:inline-block; text-align:center;">添加新用户</a>
        </div>
      </div>
    ` : '';

    return new Response(this.htmlTemplate(`
      <h2>个人中心</h2>
      <nav><a href="/">返回首页</a></nav>
      
      <div class="card">
        <h3>用户信息</h3>
        <p><strong>用户名:</strong> ${user.username}</p>
        <p><strong>用户ID:</strong> ${user.id}</p>
        <p><strong>角色:</strong> <span class="tag">${user.role}</span></p>
      </div>

      ${adminLinks}

      <div class="card">
        <h3>修改密码</h3>
        <input type="password" id="oldPass" placeholder="当前密码" class="input-field">
        <input type="password" id="newPass" placeholder="新密码" class="input-field">
        <button onclick="changePass()" class="btn-primary">更新密码</button>
      </div>

      <script>
        async function changePass() {
          const oldPassword = document.getElementById('oldPass').value;
          const newPassword = document.getElementById('newPass').value;
          
          if(!oldPassword || !newPassword) return alert('请填写所有字段');

          const res = await fetch('/api/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword, newPassword })
          });

          if(res.ok) {
            alert('密码更新成功！');
            document.getElementById('oldPass').value = '';
            document.getElementById('newPass').value = '';
          } else {
            const data = await res.json();
            alert(data.error);
          }
        }
      </script>
    `, '个人中心'), { headers: { "Content-Type": "text/html" } });
  },

  renderAddUser(request, env) {
    return new Response(this.htmlTemplate(`
      <h2>添加新用户</h2>
      <nav><a href="/admin">返回管理后台</a></nav>
      
      <div class="card">
        <input type="text" id="newUsername" placeholder="用户名" class="input-field">
        <input type="password" id="newPassword" placeholder="密码" class="input-field">
        <div style="margin-bottom: 15px;">
            <label><input type="checkbox" id="isAdmin"> 是否为管理员?</label>
        </div>
        <button onclick="addUser()" class="btn-primary">创建用户</button>
      </div>

      <script>
        async function addUser() {
          const username = document.getElementById('newUsername').value;
          const password = document.getElementById('newPassword').value;
          const role = document.getElementById('isAdmin').checked ? 'admin' : 'user';
          
          if(!username || !password) return alert('请填写所有字段');

          const res = await fetch('/api/users/add', {
            method: 'POST',
            body: JSON.stringify({ username, password, role })
          });

          if(res.ok) {
            alert('用户创建成功！');
            window.location.href = '/admin';
          } else {
            const data = await res.json();
            alert(data.error);
          }
        }
      </script>
    `, '添加用户'), { headers: { "Content-Type": "text/html" } });
  },

  renderDocs() {
    const docs = [
      { title: "Opencode Antigravity Auth", url: "https://github.com/NoeFabris/opencode-antigravity-auth", desc: "认证系统文档" }
    ];

    const list = docs.map(d => `
       <div class="card">
         <h3><a href="${d.url}" target="_blank">${d.title}</a></h3>
         <p>${d.desc}</p>
       </div>
     `).join('');

    return new Response(this.htmlTemplate(`
       <h2>文档</h2>
       <nav><a href="/">返回首页</a></nav>
       <div class="docs-list">
         ${list}
       </div>
     `, '文档'), { headers: { "Content-Type": "text/html" } });
  },

  async auth(request, env) {
    const token = (request.headers.get("Cookie") || "").match(/auth_token=([^;]+)/)?.[1];
    return token ? JSON.parse(await env.suyuankv.get(token) || "null") : null;
  },

  async hashPassword(password) {
    const msg = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msg);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  },

  async initDB(env) {
    await env.suyuan.prepare(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    // Try to add column if not exists (for existing deploys)
    try {
      await env.suyuan.prepare("ALTER TABLE notes ADD COLUMN tags TEXT DEFAULT ''").run();
    } catch (e) {
      // Column likely exists
    }
  },

  renderUI(type) {
    const isLogin = type === 'login';
    return new Response(this.htmlTemplate(`
      <div class="auth-container">
        <h2>${isLogin ? 'Welcome Back' : 'Create Account'}</h2>
        <input type="text" id="u" placeholder="Username" class="input-field"><br>
        <input type="password" id="p" placeholder="Password" class="input-field"><br>
        <button onclick="doAction()" class="btn-primary">${isLogin ? 'Sign In' : 'Sign Up'}</button>
        <div class="auth-links">
          ${isLogin ? '<a href="/register">No account? Register</a>' : '<a href="/login">Have account? Login</a>'}
          | <a href="/">Back to Home</a>
        </div>
      </div>
      <script>
        async function doAction() {
          const res = await fetch('/api/${type}', { method: 'POST', body: JSON.stringify({username: u.value, password: p.value}) });
          const data = await res.json();
          if (res.ok) {
            if ('${type}' === 'login') { 
              document.cookie = "auth_token=" + data.token + "; path=/"; 
              const redirect = new URLSearchParams(window.location.search).get('redirect');
              if (redirect) {
                location.href = redirect;
              } else {
                location.href = data.role === 'admin' ? '/admin' : '/'; 
              }
            }
            else { alert('Success'); location.href = '/'; }
          } else { alert(data.error); }
        }
      </script>
    `, isLogin ? 'Login' : 'Register'), { headers: { "Content-Type": "text/html" } });
  },

  htmlTemplate(content, title = 'Suyuan Worker') {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Suyuank</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Orbitron:wght@400;500;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
    <style>
      :root {
        --bg-color: #050505;
        --bg-gradient: radial-gradient(circle at 50% 0%, #1a1a2e 0%, #050505 100%);
        --card-bg: rgba(255, 255, 255, 0.03);
        --card-border: rgba(0, 243, 255, 0.2);
        --text-main: #e0e0e0;
        --text-muted: #94a3b8;
        --accent-primary: #00f3ff; /* Cyber Cyan */
        --accent-secondary: #bc13fe; /* Neon Purple */
        --danger: #ff2a6d;
        --success: #05ffa1;
        --font-head: 'Orbitron', sans-serif;
        --font-body: 'Inter', sans-serif;
        --font-code: 'JetBrains Mono', monospace;
      }
      
      * { box-sizing: border-box; }
      
      body {
        font-family: var(--font-body);
        background: var(--bg-color);
        background-image: var(--bg-gradient);
        background-attachment: fixed;
        color: var(--text-main);
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        line-height: 1.6;
        min-height: 100vh;
      }

      /* Scanline effect */
      body::before {
        content: "";
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
        background-size: 100% 2px, 3px 100%;
        pointer-events: none;
        z-index: 9999;
      }

      a { color: var(--text-main); text-decoration: none; transition: all 0.3s; }
      a:hover { color: var(--accent-primary); text-shadow: 0 0 8px var(--accent-primary); }

      h1, h2, h3 { 
        font-family: var(--font-head); 
        color: var(--text-main); 
        text-transform: uppercase; 
        letter-spacing: 2px;
        margin-top: 1.5em; 
        margin-bottom: 0.8em; 
        text-shadow: 0 0 10px rgba(0, 243, 255, 0.3);
      }
      
      h1 { 
        font-size: 2rem; 
        border-bottom: 2px solid var(--accent-primary); 
        display: inline-block; 
        padding-bottom: 10px; 
        background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        border-image: linear-gradient(90deg, var(--accent-primary), transparent) 1;
      }
      
      /* Header & Nav */
      nav { 
        margin-bottom: 50px; 
        display: flex; 
        gap: 25px; 
        font-family: var(--font-head);
        font-size: 0.9rem;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        padding-bottom: 20px;
      }
      nav a { 
        position: relative;
        opacity: 0.7;
      }
      nav a:hover { 
        opacity: 1; 
        color: var(--accent-primary);
      }
      nav a::after {
        content: '';
        position: absolute;
        width: 0;
        height: 2px;
        bottom: -5px;
        left: 0;
        background-color: var(--accent-primary);
        transition: width 0.3s;
        box-shadow: 0 0 8px var(--accent-primary);
      }
      nav a:hover::after { width: 100%; }

      /* Cards */
      .card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        padding: 25px;
        margin-bottom: 25px;
        backdrop-filter: blur(10px);
        border-radius: 8px;
        position: relative;
        overflow: hidden;
        transition: transform 0.3s, box-shadow 0.3s, border-color 0.3s;
      }
      .card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; width: 4px; height: 100%;
        background: var(--accent-primary);
        opacity: 0;
        transition: opacity 0.3s;
      }
      .card:hover { 
        transform: translateY(-5px); 
        box-shadow: 0 10px 30px -10px rgba(0, 243, 255, 0.2); 
        border-color: var(--accent-primary);
      }
      .card:hover::before { opacity: 1; }

      .title-link { font-size: 1.5rem; font-weight: 700; display: block; margin-bottom: 12px; }
      .meta { font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 15px; align-items: center; margin-bottom: 15px; font-family: var(--font-code); }
      
      /* Tags */
      .tags { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px; }
      .tag { 
        font-size: 0.75rem; 
        font-family: var(--font-code);
        color: var(--accent-primary); 
        background: rgba(0, 243, 255, 0.1);
        padding: 4px 10px;
        border-radius: 4px;
        border: 1px solid rgba(0, 243, 255, 0.2);
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .tag:hover { 
        background: rgba(0, 243, 255, 0.2);
        box-shadow: 0 0 10px rgba(0, 243, 255, 0.3);
      }

      /* Forms */
      .input-field, .textarea-field {
        width: 100%;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: var(--text-main);
        padding: 15px;
        margin-bottom: 20px;
        font-family: var(--font-body);
        border-radius: 4px;
        transition: all 0.3s;
      }
      .input-field:focus, .textarea-field:focus { 
        outline: none; 
        border-color: var(--accent-secondary); 
        box-shadow: 0 0 15px rgba(188, 19, 254, 0.3); 
        background: rgba(0, 0, 0, 0.5);
      }
      .textarea-field { height: 300px; resize: vertical; }
      
      .btn-primary {
        background: transparent;
        color: var(--accent-primary);
        border: 1px solid var(--accent-primary);
        padding: 12px 30px;
        font-family: var(--font-head);
        font-weight: 700;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.3s;
        letter-spacing: 2px;
        position: relative;
        overflow: hidden;
      }
      .btn-primary:hover { 
        background: var(--accent-primary); 
        color: #000;
        box-shadow: 0 0 20px var(--accent-primary); 
      }

      /* Auth */
      .auth-container { 
        max-width: 420px; 
        margin: 100px auto; 
        text-align: center; 
        background: var(--card-bg);
        padding: 40px;
        border: 1px solid var(--card-border);
        border-radius: 12px;
        backdrop-filter: blur(20px);
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      }
      .auth-links { margin-top: 25px; font-size: 0.9rem; display: flex; justify-content: center; gap: 20px; opacity: 0.7; }

      /* Post View */
      .post-view {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        padding: 40px;
        border-radius: 8px;
        backdrop-filter: blur(10px);
        box-shadow: 0 0 30px rgba(0,0,0,0.5);
        margin-top: 20px;
      }

      /* Markdown Content */
      .markdown-body { margin-top: 40px; font-size: 1.1rem; }
      .markdown-body pre { 
        background: rgba(0,0,0,0.4); 
        border: 1px solid rgba(255,255,255,0.1);
        color: var(--text-main); 
        padding: 20px; 
        overflow-x: auto; 
        border-radius: 6px; 
        font-family: var(--font-code);
      }
      .markdown-body blockquote { 
        border-left: 4px solid var(--accent-secondary); 
        padding-left: 20px; 
        color: var(--text-muted); 
        margin: 1.5em 0; 
        background: linear-gradient(90deg, rgba(188,19,254,0.1), transparent);
      }
      .markdown-body img { max-width: 100%; border-radius: 4px; border: 1px solid var(--card-border); }
      
      .divider { border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 40px 0; }
      
      /* Utilities */
      .page-header { text-align: center; margin-bottom: 60px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      table th, table td { border: 1px solid rgba(255,255,255,0.1); padding: 12px; text-align: left; }
      table th { background: rgba(255,255,255,0.05); color: var(--accent-primary); font-family: var(--font-head); }
      
    </style>
</head>
<body>
    <nav>
        <a href="/">首页</a>
        <a href="/login">登录</a>
        <a href="/write">写作</a>
        <a href="/profile">个人中心</a>
        <a href="/docs">文档</a>
    </nav>
    <main>
        ${content}
    </main>
    <footer style="margin-top: 80px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 30px; font-size: 0.8rem; color: var(--text-muted); text-align: center; font-family: var(--font-code);">
        &copy; ${new Date().getFullYear()} Suyuank. SYSTEM ONLINE. Powered by Cloudflare Workers.
    </footer>
</body>
</html>`;
  }
};
