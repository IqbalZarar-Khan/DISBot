# 🚀 Quick Deployment Configuration Guide

This guide provides a quick reference for deploying DISBot across cloud platforms, containers, and bare-metal VPS environments using the included configuration files.

---

## 📁 Configuration Files Overview

| File | Platform | Purpose |
|------|----------|---------|
| `railway.json` | Railway.app | Recommended cloud deployment config (Nixpacks, health check, auto-restart) |
| `render.yaml` | Render.com | Blueprint configuration for paid starter instances (`$7/mo`+) |
| `Procfile` | Heroku | Process type declaration (`web: npm start`) |
| `Dockerfile` | Docker/VPS | Multi-stage production container build (Node.js 20 Alpine) |
| `docker-compose.yml` | Docker/VPS | Orchestrates DISBot + Redis + PostgreSQL/PostgREST |
| `nginx.conf` | VPS | Reverse proxy with WebSocket and SSL/HTTPS support |
| `ecosystem.config.js` | VPS/PM2 | PM2 process management with cluster/fork restart rules |

---

## 🚂 Railway.app (Recommended)

Railway is the **strongly recommended** platform for DISBot due to dedicated outbound IPs (no Discord gateway Cloudflare bans), dynamic port binding, and WebSocket support.

### Deployment Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Configure DISBot deployment"
   git push origin main
   ```

2. **Create Railway Project**
   - Go to [railway.app](https://railway.app)
   - Click **New Project** → **Deploy from GitHub repo**
   - Select your repository (`DISBot`)
   - Railway auto-detects `railway.json` and configures Node.js 20+ Nixpacks.

3. **Add Environment Variables**
   In your Railway dashboard (**Variables** tab), add all required credentials (see [Environment Variables](#-environment-variables) below).
   > **Note**: Do **NOT** set `PORT` manually. Railway sets `PORT` dynamically, and DISBot auto-detects it.

4. **Generate Public Domain**
   - In Railway: **Settings** → **Networking** → **Generate Domain**
   - Copy domain: `https://your-bot.up.railway.app`
   - Set `PUBLIC_URL=https://your-bot.up.railway.app` in your Variables.

5. **Configure Patreon Webhook**
   - Webhook URL: `https://your-bot.up.railway.app/webhooks/patreon`
   - Secret: Matches your `WEBHOOK_SECRET`
   - Select all 9 v2 event triggers (`members:*`, `members:pledge:*`, `posts:*`).

---

## 🎯 Render.com (Paid Tier Only)

> ⚠️ **IMPORTANT**: Discord blocks connections from Render's free tier shared IP pool (Cloudflare HTTP 429 / error code 1015). **You must use a paid Web Service plan (Starter $7/mo+)**.

### Deployment Steps

1. **Create Web Service**
   - Go to [render.com](https://render.com) → **New +** → **Blueprint** (or **Web Service**)
   - Select your GitHub repository.
   - Render detects `render.yaml`.

2. **Configure Settings**
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node.js 20+
   - **Plan**: Starter (`$7/mo`+)

3. **Set Environment Variables**
   - Add all variables from `.env.example`
   - Set `WEBHOOK_PORT=10000` (or leave default for auto-detection)
   - Set `PUBLIC_URL=https://yourbot.onrender.com`

---

## 🟣 Heroku

### Deployment Steps

1. **CLI Authentication & App Creation**
   ```bash
   heroku login
   heroku create your-bot-name
   heroku buildpacks:set heroku/nodejs
   ```

2. **Set Configuration Variables**
   ```bash
   heroku config:set DISCORD_TOKEN=your_token
   heroku config:set GUILD_ID=your_guild_id
   heroku config:set ROOT_ADMIN_ID=your_admin_id
   heroku config:set SUPABASE_URL=https://your-project.supabase.co
   heroku config:set SUPABASE_KEY=your_supabase_service_role_key
   heroku config:set PATREON_CLIENT_ID=your_patreon_client_id
   heroku config:set PATREON_CLIENT_SECRET=your_patreon_client_secret
   heroku config:set PATREON_ACCESS_TOKEN=your_patreon_access_token
   heroku config:set PATREON_REFRESH_TOKEN=your_patreon_refresh_token
   heroku config:set PATREON_CAMPAIGN_ID=your_campaign_id
   heroku config:set WEBHOOK_SECRET=your_webhook_secret
   heroku config:set NODE_ENV=production
   ```

3. **Deploy & Scale Dyno**
   ```bash
   git push heroku main
   heroku ps:scale web=1
   ```

4. **Patreon Webhook Target**
   `https://your-bot-name.herokuapp.com/webhooks/patreon`

---

## 🐳 Docker (VPS Orchestration)

### Using Dockerfile & docker-compose.yml

1. **Clone & Configure**
   ```bash
   git clone https://github.com/yourusername/DISBot.git /opt/DISBot
   cd /opt/DISBot
   cp .env.example .env
   nano .env
   ```

2. **Build and Run Multi-Container Stack**
   ```bash
   docker-compose up -d --build
   ```

3. **Verify Containers**
   ```bash
   docker-compose ps
   docker-compose logs -f disbot
   ```

4. **Reverse Proxy (Nginx / Caddy)**
   Point your reverse proxy to `http://localhost:3000` (or `WEBHOOK_PORT`).

---

## ⚙️ PM2 (Bare Metal VPS)

### Using ecosystem.config.js

1. **Install Node.js 20+ & PM2**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
   sudo apt install -y nodejs nginx certbot python3-certbot-nginx
   sudo npm install -g pm2
   ```

2. **Clone, Install & Build**
   ```bash
   cd /opt
   git clone https://github.com/yourusername/DISBot.git
   cd DISBot
   npm install
   npm run check:secrets
   npm run build
   ```

3. **Start Process Manager**
   ```bash
   pm2 start ecosystem.config.js --env production
   pm2 save
   pm2 startup
   ```

4. **Helpful PM2 Commands**
   ```bash
   pm2 status          # View status & memory
   pm2 logs disbot     # View real-time logs
   pm2 restart disbot  # Restart (prestart auto-builds)
   pm2 monit          # Live CPU/memory monitor
   ```

---

## 🔧 Environment Variables Reference

| Variable | Required | Description | Default / Example |
|---|---|---|---|
| `DISCORD_TOKEN` | Yes | Discord Bot token from Developer Portal | `MTA...` |
| `GUILD_ID` | Yes | Discord Server / Guild ID | `123456789012345678` |
| `ROOT_ADMIN_ID` | Yes | Discord User ID of the primary administrator | `987654321098765432` |
| `LOG_CHANNEL_ID` | Recommended | Discord Channel ID for administrative alerts and errors | `112233445566778899` |
| `SUPABASE_URL` | Recommended | Supabase Project REST URL | `https://xyz.supabase.co` |
| `SUPABASE_KEY` | Recommended | Supabase `service_role` Secret Key | `eyJhbG...` |
| `PATREON_CLIENT_ID` | Yes | Patreon OAuth2 Client ID | `client_id_here` |
| `PATREON_CLIENT_SECRET` | Yes | Patreon OAuth2 Client Secret | `client_secret_here` |
| `PATREON_ACCESS_TOKEN` | Yes | Patreon Creator Access Token | `access_token_here` |
| `PATREON_REFRESH_TOKEN` | Yes | Patreon Creator Refresh Token | `refresh_token_here` |
| `PATREON_CAMPAIGN_ID` | Yes | Patreon Creator Campaign ID | `1234567` |
| `WEBHOOK_SECRET` | Yes | HMAC MD5 secret for webhook verification | `32+ char secret` |
| `PUBLIC_URL` | Recommended | Public domain where the bot is hosted | `https://disbot.up.railway.app` |
| `TIER_CONFIG` | Yes | JSON array of configured tiers, ranks, IDs, and cents | `'[{"name":"Diamond","id":"123","rank":100,"cents":2500}]'` |
| `REDIS_URL` | Optional | Redis connection URL for BullMQ distributed queue | `redis://default:pass@host:6379` |
| `BOT_LOCALE` | Optional | Language locale code (`en`, `es`, `de`, `fr`, `ja`, `zh-CN`, `ru`) | `en` |
| `METRICS_TOKEN` | Optional | Bearer token required to access `GET /metrics` | `secure_metrics_token` |
| `DISABLE_SETUP_WIZARD` | Optional | Locks `/setup` endpoint against unauthorized reconfiguration | `false` |
| `ALLOW_RANK_INVERSION` | Optional | Bypasses fatal boot exit if cheaper tiers outrank expensive ones | `false` |

---

## 🩺 Health & Diagnostic Endpoints

| Endpoint | Method | Purpose | Auth Required |
|---|---|---|---|
| `/health` | `GET` | Container liveness and uptime check | No |
| `/metrics` | `GET` | Prometheus metrics exposition format | If `METRICS_TOKEN` set |
| `/setup` | `GET`/`POST` | Cloud onboarding wizard | Requires `SETUP_TOKEN` or `DISCORD_TOKEN` |
| `/oauth/start` | `GET` | 1-Click Patreon OAuth authorization flow | No |
| `/oauth/redirect` | `GET` | Patreon OAuth callback & token persistence | No |
| `/dashboard` | `GET` | Patron Analytics Single-Page Application | JWT (`/admin dashboard`) |
| `/webhooks/patreon` | `POST` | Inbound Patreon webhook receiver | HMAC Signature (`X-Patreon-Signature`) |

---

## ✅ Post-Deployment Verification Checklist

- [ ] Bot appears **Online** in your Discord server.
- [ ] Slash commands are auto-registered (`/admin status` reports health metrics).
- [ ] Run `npm run check:secrets` before commits to verify no credentials are leak-prone.
- [ ] Patreon Webhook URL is set to `https://<your-domain>/webhooks/patreon` with all 9 event triggers.
- [ ] Supabase auto-migrations (000–015) applied successfully on startup.
- [ ] In-memory tier maps synchronize across instances on `/admin sync-tiers`.
