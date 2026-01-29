export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      if (method === "GET") {
        if (url.pathname === "/") return this.renderUI('login');
        if (url.pathname === "/register") return this.renderUI('register');
        if (url.pathname === "/docs") return this.renderDocs();
        if (url.pathname === "/admin") return this.renderAdminUI(request, env);
      }

      if (method === "POST") {
        if (url.pathname === "/api/register") return this.handleRegister(request, env);
        if (url.pathname === "/api/login") return this.handleLogin(request, env);
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

  async renderAdminUI(request, env) {
    const user = await this.auth(request, env);
    if (!user || user.role !== 'admin') return new Response("Forbidden", { status: 403 });

    const { results } = await env.suyuan.prepare("SELECT id, username, role, created_at FROM users").all();
    let rows = results.map(u => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.role}</td><td>${u.created_at}</td></tr>`).join('');
    
    return new Response(this.htmlTemplate(`
      <h2>Admin Dashboard</h2>
      <nav>
        <a href="/docs">View Docs</a> | <a href="/">Logout</a>
      </nav>
      <h3>User Management</h3>
      <table border="1" style="width:100%">${rows}</table>
    `), { headers: { "Content-Type": "text/html" } });
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

  renderUI(type) {
    const isLogin = type === 'login';
    return new Response(this.htmlTemplate(`
      <h2>${isLogin ? 'Login' : 'Register'}</h2>
      <input type="text" id="u" placeholder="User"><br>
      <input type="password" id="p" placeholder="Pass"><br>
      <button onclick="doAction()">${isLogin ? 'Sign In' : 'Sign Up'}</button>
      <div style="margin-top: 20px;">
        <a href="/docs">View Documentation</a>
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
    `), { headers: { "Content-Type": "text/html" } });
  },

  htmlTemplate(content) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:sans-serif;max-width:400px;margin:50px auto;line-height:2}
      input{width:100%;box-sizing:border-box;margin-bottom:10px;padding:8px;}
      button{width:100%;background:#0070f3;color:#fff;border:none;padding:10px;cursor:pointer;}
      button:hover{background:#0051a2;}
      .card{border:1px solid #ddd;padding:15px;margin-bottom:10px;border-radius:4px;}
      .card h3{margin-top:0;}
      nav{margin-bottom:20px;padding-bottom:10px;border-bottom:1px solid #eee;}
      a{color:#0070f3;text-decoration:none;}
      a:hover{text-decoration:underline;}
    </style></head><body>${content}</body></html>`;
  }
};
