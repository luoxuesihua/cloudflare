# Rin (Cloudflare Worker + Vue 3 Rewrite)

This project has been rewritten to match the architecture of **Rin**, using Cloudflare Workers (Hono) for the backend and Vue 3 for the frontend.

## Project Structure

- `frontend/`: Vue 3 Single Page Application (UI UX Pro Max Design System).
- `src/`: Cloudflare Worker API (Hono Framework).
- `wrangler.toml`: Cloudflare configuration (D1, KV).

## Prerequisites

- Node.js
- Cloudflare Wrangler (`npm install -g wrangler`)

## How to Run

### 1. Backend (Worker)

Start the local development server for the API:

```bash
npm install
wrangler dev
```

The API will run at `http://localhost:8787`.

### 2. Frontend (Vue)

In a new terminal, start the frontend development server:

```bash
cd frontend
npm install
npm run dev
```

The frontend will run at `http://localhost:5173`.
It is configured to proxy `/api` requests to the backend.

## Features implemented

- **Glassmorphism UI**: Premium dark mode design.
- **Hono API**: structured, fast, and standard-compliant.
- **Data Stores**: Uses D1 for content and KV for sessions/cache.
- **Auth**: Placeholder for login/registration flow.
