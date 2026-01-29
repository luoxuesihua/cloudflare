# Suyuank Cloudflare Worker

This project is a Cloudflare Worker application that provides a user authentication system with an admin dashboard. It utilizes Cloudflare D1 for data persistence and KV for session management.

## 🚀 Live Demo

The project is automatically deployed to: **[https://m.suyuank.top/](https://m.suyuank.top/)**

## ✨ Features

- **User Authentication**:
  - User Registration (`/register`)
  - User Login (`/`)
- **Role-Based Access Control**:
  - The first registered user is automatically assigned the `admin` role.
  - Subsequent users are assigned the `user` role.
- **Admin Dashboard**:
  - Accessible at `/admin` (requires admin privileges).
  - View a list of all registered users.
- **Technology Stack**:
  - **Runtime**: Cloudflare Workers
  - **Database**: Cloudflare D1 (binding: `suyuan`)
  - **Session Store**: Cloudflare KV (binding: `suyuankv`)

## 🛠️ Development

To run this project locally, you need [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

## 📂 Project Structure

- `src/index.js`: Main application logic (API endpoints and HTML rendering).
- `wrangler.toml`: Cloudflare Workers configuration.
- `.github`: GitHub Actions workflows for automatic deployment.
