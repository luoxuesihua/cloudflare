export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      if (method === "GET") {
        if (url.pathname === "/") return this.renderBlogList(request, env);
        if (url.pathname === "/login") return this.renderUI('login');
        if (url.pathname === "/register") return this.renderUI('register');
        if (url.pathname === "/docs") return this.renderDocs();
        if (url.pathname === "/blog") return this.renderBlogList(request, env);
        if (url.pathname === "/write") return this.renderBlogEditor(request, env);
        if (url.pathname === "/profile") return this.renderProfile(request, env);
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
    const dbUser = await env.suyuan.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first();

    if (dbUser.password_hash !== currentHash) {
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
      filteredResults = results.filter(n => (n.tags || '').split(',').map(t=>t.trim()).includes(tagFilter));
    }
    
    const list = filteredResults.map(n => {
      const tagsHtml = (n.tags || '').split(',').filter(t=>t).map(t => 
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
    `}).join('') || '<p>No notes found.</p>';

    return new Response(this.htmlTemplate(`
      <header class="page-header">
        <h1>Blog</h1>
        ${tagFilter ? `<p>Tagged with <strong>#${tagFilter}</strong> <a href="/" class="clear-filter">×</a></p>` : ''}
      </header>
      <div class="blog-list">
        ${list}
      </div>
    `, 'Blog'), { headers: { "Content-Type": "text/html" } });
  },

  async renderBlogView(env, id) {
    await this.initDB(env);
    const note = await env.suyuan.prepare("SELECT * FROM notes WHERE id = ?").bind(id).first();
    if (!note) return new Response("Note not found", { status: 404 });

    const tagsHtml = (note.tags || '').split(',').filter(t=>t).map(t => `<span class="tag">#${t.trim()}</span>`).join(' ');

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
        <nav class="post-nav"><a href="/">← Back to Blog</a></nav>
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
      <h2>Access Denied</h2>
      <p>You must <a href="/">login</a> to write notes.</p>
    `, 'Access Denied'), { status: 403, headers: { "Content-Type": "text/html" } });

    return new Response(this.htmlTemplate(`
      <h2>Write New Note</h2>
      <nav><a href="/">Back to Blog</a></nav>
      <div class="editor-form">
        <input type="text" id="title" placeholder="Title" class="input-field">
        <input type="text" id="tags" placeholder="Tags (comma separated, e.g. dev, life)" class="input-field">
        <textarea id="content" placeholder="Write your note in Markdown..." class="textarea-field"></textarea>
        <div class="actions">
            <button onclick="publish()" class="btn-primary">Publish</button>
        </div>
      </div>
      <script>
        async function publish() {
          const title = document.getElementById('title').value;
          const tags = document.getElementById('tags').value;
          const content = document.getElementById('content').value;
          if(!title || !content) return alert('Please fill title and content');
          
          const res = await fetch('/api/notes', {
            method: 'POST',
            body: JSON.stringify({ title, content, tags })
          });
          
          if(res.ok) {
            window.location.href = '/blog';
          } else {
            const data = await res.json();
            alert(data.error || 'Error creating note');
          }
        }
      </script>
    `, 'New Note'), { headers: { "Content-Type": "text/html" } });
  },

  async renderAdminUI(request, env) {
    const user = await this.auth(request, env);
    if (!user || user.role !== 'admin') return new Response("Forbidden", { status: 403 });

    const { results } = await env.suyuan.prepare("SELECT id, username, role, created_at FROM users").all();
    let rows = results.map(u => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.role}</td><td>${u.created_at}</td></tr>`).join('');
    
    return new Response(this.htmlTemplate(`
      <h2>Admin Dashboard</h2>
      <nav>
        <a href="/docs">View Docs</a> | <a href="/admin/users/add">Add User</a> | <a href="/profile">Profile</a> | <a href="/">Logout</a>
      </nav>
      <h3>User Management</h3>
      <table border="1" style="width:100%">${rows}</table>
    `), { headers: { "Content-Type": "text/html" } });
  },

  renderProfile(request, env) {
    // We fetch user info in client via auth token check, but for SSR we assume user is logged in if they reach here (middleware-ish check usually)
    // For simplicity, we just render the form, auth check happens on submission or we can do a quick check.
    // Ideally we pass 'user' object to render functions.
    // Let's do a quick client-side auth check pattern or server check.
    return new Response(this.htmlTemplate(`
      <h2>Profile</h2>
      <nav><a href="/">Back to Blog</a></nav>
      
      <div class="card">
        <h3>Change Password</h3>
        <input type="password" id="oldPass" placeholder="Current Password" class="input-field">
        <input type="password" id="newPass" placeholder="New Password" class="input-field">
        <button onclick="changePass()" class="btn-primary">Update Password</button>
      </div>

      <script>
        async function changePass() {
          const oldPassword = document.getElementById('oldPass').value;
          const newPassword = document.getElementById('newPass').value;
          
          if(!oldPassword || !newPassword) return alert('Fill all fields');

          const res = await fetch('/api/password', {
            method: 'POST',
            body: JSON.stringify({ oldPassword, newPassword })
          });

          if(res.ok) {
            alert('Password updated!');
            document.getElementById('oldPass').value = '';
            document.getElementById('newPass').value = '';
          } else {
            const data = await res.json();
            alert(data.error);
          }
        }
      </script>
    `, 'Profile'), { headers: { "Content-Type": "text/html" } });
  },

  renderAddUser(request, env) {
    return new Response(this.htmlTemplate(`
      <h2>Add New User</h2>
      <nav><a href="/admin">Back to Admin</a></nav>
      
      <div class="card">
        <input type="text" id="newUsername" placeholder="Username" class="input-field">
        <input type="password" id="newPassword" placeholder="Password" class="input-field">
        <div style="margin-bottom: 15px;">
            <label><input type="checkbox" id="isAdmin"> Is Admin?</label>
        </div>
        <button onclick="addUser()" class="btn-primary">Create User</button>
      </div>

      <script>
        async function addUser() {
          const username = document.getElementById('newUsername').value;
          const password = document.getElementById('newPassword').value;
          const role = document.getElementById('isAdmin').checked ? 'admin' : 'user';
          
          if(!username || !password) return alert('Fill all fields');

          const res = await fetch('/api/users/add', {
            method: 'POST',
            body: JSON.stringify({ username, password, role })
          });

          if(res.ok) {
            alert('User created!');
            window.location.href = '/admin';
          } else {
            const data = await res.json();
            alert(data.error);
          }
        }
      </script>
    `, 'Add User'), { headers: { "Content-Type": "text/html" } });
  },

  renderDocs() {
    const docs = [
      { title: "Opencode Antigravity Auth", url: "https://github.com/NoeFabris/opencode-antigravity-auth", desc: "Authentication system documentation" }
    ];

    const list = docs.map(d => `
      <div class="card">
        <h3><a href="${d.url}" target="_blank">${d.title}</a></h3>
        <p>${d.desc}</p>
      </div>
    `).join('');

    return new Response(this.htmlTemplate(`
      <h2>Documentation</h2>
      <nav><a href="/">Home</a></nav>
      <div class="docs-list">
        ${list}
      </div>
    `), { headers: { "Content-Type": "text/html" } });
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
            if ('${type}' === 'login') { document.cookie = "auth_token=" + data.token + "; path=/"; location.href = data.role === 'admin' ? '/admin' : '/'; }
            else { alert('Success'); location.href = '/'; }
          } else { alert(data.error); }
        }
      </script>
    `, isLogin ? 'Login' : 'Register'), { headers: { "Content-Type": "text/html" } });
  },

  htmlTemplate(content, title = 'Suyuan Worker') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Suyuank</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      :root {
        --bg-color: #f6f6f6;
        --card-bg: #ffffff;
        --text-main: #2d2d2d;
        --text-muted: #666;
        --accent: #dca54c; /* Astro Paper-ish Gold/Yellow */
        --accent-hover: #c69443;
        --border: #e0e0e0;
        --code-bg: #2d2d2d;
        --code-text: #eee;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg-color: #1e1e2e;
          --card-bg: #252535;
          --text-main: #e0e0e0;
          --text-muted: #a0a0a0;
          --accent: #f4c063;
          --accent-hover: #e0b050;
          --border: #333;
        }
      }
      body {
        font-family: 'IBM Plex Mono', monospace;
        background: var(--bg-color);
        color: var(--text-main);
        max-width: 720px;
        margin: 0 auto;
        padding: 20px;
        line-height: 1.6;
        transition: background 0.3s, color 0.3s;
      }
      a { color: var(--text-main); text-decoration: none; transition: color 0.2s; }
      a:hover { color: var(--accent); }
      h1, h2, h3 { color: var(--text-main); font-weight: 600; margin-top: 1.5em; margin-bottom: 0.5em; }
      h1 { font-size: 1.8rem; border-bottom: 2px solid var(--accent); display: inline-block; padding-bottom: 5px; }
      
      /* Header & Nav */
      nav { margin-bottom: 40px; display: flex; gap: 20px; font-weight: 600; font-size: 1.1rem; }
      nav a { border-bottom: 2px solid transparent; }
      nav a:hover { border-bottom-color: var(--accent); }

      /* Cards */
      .card {
        background: var(--card-bg);
        border: 1px solid var(--border);
        padding: 20px;
        margin-bottom: 20px;
        border-radius: 2px; /* Brutalist/Paper feel */
        box-shadow: 2px 2px 0 var(--border);
        transition: transform 0.2s;
      }
      .card:hover { transform: translateY(-2px); box-shadow: 3px 3px 0 var(--accent); border-color: var(--accent); }
      .title-link { font-size: 1.4rem; font-weight: 600; display: block; margin-bottom: 8px; }
      .meta { font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
      
      /* Tags */
      .tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      .tag { 
        font-size: 0.8rem; 
        color: var(--accent); 
        cursor: pointer;
        opacity: 0.9;
      }
      .tag:hover { text-decoration: underline; opacity: 1; }

      /* Forms */
      .input-field, .textarea-field {
        width: 100%;
        background: var(--card-bg);
        border: 1px solid var(--border);
        color: var(--text-main);
        padding: 12px;
        margin-bottom: 15px;
        font-family: inherit;
        box-sizing: border-box;
      }
      .input-field:focus, .textarea-field:focus { outline: none; border-color: var(--accent); box-shadow: 1px 1px 0 var(--accent); }
      .textarea-field { height: 300px; resize: vertical; }
      .btn-primary {
        background: var(--text-main);
        color: var(--bg-color);
        border: none;
        padding: 12px 24px;
        font-family: inherit;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
      }
      .btn-primary:hover { opacity: 0.9; }

      /* Auth */
      .auth-container { max-width: 400px; margin: 100px auto; text-align: center; }
      .auth-links { margin-top: 20px; font-size: 0.9rem; display: flex; justify-content: center; gap: 20px; }

      /* Markdown Content */
      .markdown-body { margin-top: 30px; font-size: 1rem; }
      .markdown-body pre { background: var(--code-bg); color: var(--code-text); padding: 15px; overflow-x: auto; border-radius: 4px; }
      .markdown-body blockquote { border-left: 4px solid var(--accent); padding-left: 15px; color: var(--text-muted); margin: 1em 0; }
      .markdown-body img { max-width: 100%; border-radius: 4px; }
      
      .divider { border: 0; border-top: 1px dashed var(--border); margin: 30px 0; }
    </style>
</head>
<body>
    <nav>
        <a href="/">Home</a>
        <a href="/login">Login</a>
        <a href="/write">Write</a>
        <a href="/profile">Profile</a>
        <a href="/docs">Docs</a>
    </nav>
    <main>
        ${content}
    </main>
    <footer style="margin-top: 50px; border-top: 1px solid var(--border); padding-top: 20px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">
        &copy; ${new Date().getFullYear()} SuyuanK. Powered by Cloudflare Workers.
    </footer>
</body>
</html>`;
  }
};
