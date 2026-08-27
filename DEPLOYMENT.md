<p align="center">
  <img src="screenshots/icon.png" alt="DISBot Logo" width="120" />
</p>

# 🚀 DISBot Comprehensive Deployment Guide

Complete guide for deploying DISBot to production platforms: **Railway.app**, **Render.com**, **Docker**, **Bare-Metal VPS**, and **Heroku**.

---

## 📋 Table of Contents

1. [Railway.app (Recommended)](#railwayapp-recommended)
2. [Render.com (Paid Tier Only)](#rendercom-paid-tier-only)
3. [VPS with Nginx & PM2](#vps-deployment-with-nginx--pm2)
4. [Docker & Docker Compose](#docker--docker-compose-deployment)
5. [Heroku](#heroku)
6. [Local Development & Webhook Tunnels](#local-development--webhook-tunnels)
7. [Post-Deployment Verification](#-post-deployment-verification)
8. [Troubleshooting & Diagnostics](#-troubleshooting--diagnostics)

---

## Railway.app (Recommended)

Railway is the **recommended production host** for DISBot. It provides dedicated outbound IPs, fast builds with Nixpacks, WebSocket compatibility, and zero Discord gateway rate limits.

### Why Railway?
- ✅ **No Discord Gateway Rate-Limits**: Dedicated IP ranges prevent Cloudflare 1015 IP blocking.
- ✅ **Automatic HTTPS**: Provides a production-grade SSL domain instantly.
- ✅ **Auto-Deploy on Git Push**: Triggers zero-downtime builds upon pushes to `main`.
- ✅ **Dynamic Port Handling**: Fastify automatically binds to Railway's assigned `$PORT`.

### Step-by-Step Instructions

1. **Push Repository to GitHub**
   ```bash
   git add .
   git commit -m "Deploy DISBot to Railway"
   git push origin main
   ```

2. **Create Project in Railway**
   - Navigate to [railway.app](https://railway.app).
   - Click **New Project** → **Deploy from GitHub repo**.
   - Select your `DISBot` repository.
   - Railway will auto-detect `railway.json`.

3. **Configure the Bot (Choose Option A or Option B)**

   **Option A: Web Setup Wizard (Easiest)**
   - Start the service. DISBot will launch in **Cloud Setup Mode**.
   - View Railway **Deploy Logs** to copy the generated one-time `SETUP_TOKEN`.
   - Open `https://your-app.up.railway.app/setup` and enter the token to visually configure Patreon, Supabase, and tier rankings.

   **Option B: Direct Variables**
   Open your service → **Variables** tab → add your production variables:

   ```env
   DISCORD_TOKEN=your_bot_token
   GUILD_ID=your_discord_server_id
   ROOT_ADMIN_ID=your_discord_user_id
   LOG_CHANNEL_ID=your_log_channel_id
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your_supabase_service_role_key
   PATREON_CLIENT_ID=your_patreon_client_id
   PATREON_CLIENT_SECRET=your_patreon_client_secret
   PATREON_ACCESS_TOKEN=your_patreon_access_token
   PATREON_REFRESH_TOKEN=your_patreon_refresh_token
   PATREON_CAMPAIGN_ID=your_patreon_campaign_id
   WEBHOOK_SECRET=your_32_char_webhook_secret
   PUBLIC_URL=https://your-app.up.railway.app
   TIER_CONFIG='[{"name":"Diamond","id":"12345","rank":100,"cents":2500}]'
   NODE_ENV=production
   ```

   > ⚠️ **Important**: Use your Supabase **service_role** secret key (not the anon key). Strict Row-Level Security (RLS) restricts database operations to service-role clients.

4. **Generate Public Domain**
   - Go to **Settings** → **Networking** → **Generate Domain**.
   - Copy domain (e.g., `https://your-app.up.railway.app`).
   - Set `PUBLIC_URL` to match this URL.

5. **Register Patreon Webhook**
   - Visit [Patreon Webhook Portal](https://www.patreon.com/portal/registration/register-webhooks).
   - URL: `https://your-app.up.railway.app/webhooks/patreon`
   - Secret: Matches `WEBHOOK_SECRET`.
   - Select all 9 event triggers:
     - `members:create`, `members:update`, `members:delete`
     - `members:pledge:create`, `members:pledge:update`, `members:pledge:delete`
     - `posts:publish`, `posts:update`, `posts:delete`

---

## Render.com (Paid Tier Only)

> ⚠️ **CRITICAL NOTICE**: Render's **Free Tier does NOT work** for Discord bots. Discord's Cloudflare DDoS protection blocks the shared free-tier IP pool (HTTP 429 / error code 1015), causing gateway connection timeouts. **You must use a paid Web Service plan (Starter $7/mo+)**.

### Deployment Steps

1. Go to [render.com](https://render.com) and click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Configure Build Settings:
   - **Environment**: Node.js 20+
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: **Starter** ($7/mo) or higher.
4. Add environment variables (set `WEBHOOK_PORT=10000` and `PUBLIC_URL=https://your-app.onrender.com`).
5. Configure Patreon Webhook to `https://your-app.onrender.com/webhooks/patreon`.

---

## VPS Deployment with Nginx & PM2

For full hardware sovereignty and bare-metal performance on Ubuntu/Debian VPS.

### 1. Server Prerequisites & Node.js 20 Setup
```bash
ssh root@your-server-ip
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx
npm install -g pm2
```

### 2. Clone & Build Application
```bash
cd /opt
git clone https://github.com/yourusername/DISBot.git
cd DISBot
npm install
npm run check:secrets
npm run build
```

### 3. Configure Environment
```bash
cp .env.example .env
nano .env # Populate with your credentials; set WEBHOOK_PORT=3000
```

### 4. Configure Nginx Reverse Proxy
Create `/etc/nginx/sites-available/disbot`:
```nginx
server {
    listen 80;
    server_name bot.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site and acquire SSL certificate:
```bash
ln -s /etc/nginx/sites-available/disbot /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
certbot --nginx -d bot.yourdomain.com
```

### 5. Launch with PM2
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

---

## Docker & Docker Compose Deployment

DISBot includes a multi-stage production Docker image and Compose orchestrator.

### Using Docker Compose
```bash
cd /opt/DISBot
cp .env.example .env
nano .env
docker-compose up -d --build
docker-compose logs -f disbot
```

---

## Heroku

1. **Initialize CLI & App**:
   ```bash
   heroku login
   heroku create your-bot-name
   heroku buildpacks:set heroku/nodejs
   ```
2. **Set Configuration**:
   ```bash
   heroku config:set DISCORD_TOKEN=your_token GUILD_ID=your_guild_id ROOT_ADMIN_ID=your_admin_id SUPABASE_URL=https://your-proj.supabase.co SUPABASE_KEY=your_key PATREON_CLIENT_ID=your_id PATREON_CLIENT_SECRET=your_secret PATREON_ACCESS_TOKEN=your_token PATREON_REFRESH_TOKEN=your_refresh PATREON_CAMPAIGN_ID=your_id WEBHOOK_SECRET=your_secret NODE_ENV=production
   ```
3. **Deploy**:
   ```bash
   git push heroku main
   heroku ps:scale web=1
   ```

---

## Local Development & Webhook Tunnels

For testing webhooks on your local workstation without deployment:

### Zero-Config Tunnel (LocalTunnel)
```bash
npm run dev:tunnel
```

### Automated Ngrok Tunnel with Auto-Patreon Registration
```bash
# Terminal 1:
ngrok http 3000

# Terminal 2:
npm run dev:ngrok
```
`dev:ngrok` auto-detects your active HTTPS tunnel and updates your webhook destination on Patreon via API!

---

## ✅ Post-Deployment Verification

Run through this checklist after deploying:

- [ ] **Online Status**: Bot shows green "Online" dot in Discord member list.
- [ ] **Slash Command Deployment**: Commands auto-deploy on startup (`/admin status` displays server health).
- [ ] **Database Migrations**: Check startup logs to verify migrations `000` through `015` applied cleanly.
- [ ] **Realtime Cache Sync**: Run `/admin sync-tiers` to confirm instant in-memory tier map updates.
- [ ] **HMAC Verification**: Run `npm run test:webhook` to send signed test payloads to your live URL.
- [ ] **Error Logging**: Verify `/admin error-log` reports zero critical unhandled exceptions.

---

## 🐛 Troubleshooting & Diagnostics

### Bot Fails Discord Connection (Gateway Timeout / 429)
- **Cause**: Shared hosting IP blocked by Cloudflare (common on Render free tier).
- **Fix**: Deploy to Railway, paid Render instance, or a VPS with a dedicated IP address.

### Webhook Returns 403 Forbidden / Signature Failed
- **Cause**: Mismatch between `WEBHOOK_SECRET` in `.env` and the secret in Patreon portal.
- **Fix**: Update the secret in the Patreon Webhook settings and restart the bot.

### Tier Rank Inversion Fatal Exit (`process.exit(1)`)
- **Cause**: Cheaper tier has a higher rank number than an expensive tier in `TIER_CONFIG`.
- **Fix**: Correct the rank values (higher rank = more exclusive), or set `ALLOW_RANK_INVERSION=true`.

### Patreon OAuth Token Revocation Alert
- **Cause**: Access/Refresh token was revoked in the creator portal.
- **Fix**: Click the 1-click authorization link in Discord (`/oauth/start`) to re-authorize.
