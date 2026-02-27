# 🚀 Deployment Guide

Complete guide for deploying your Patreon-Discord Bot to various hosting platforms.

## 📋 Table of Contents

- [Railway.app (Recommended)](#railwayapp-recommended)
- [Render.com](#rendercom)
- [Heroku](#heroku)
- [Local Hosting](#local-hosting-with-ngrok)
- [VPS Deployment](#vps-deployment)

---

## Railway.app (Recommended)

Railway is the **recommended** hosting platform for this bot. It provides dedicated IPs, fast deploys, and no Discord rate-limiting issues.

### Why Railway?

✅ **No Discord rate-limiting** — dedicated IPs, no shared IP blocking  
✅ **$5 free credit/month** (enough for 24/7 operation)  
✅ **Automatic HTTPS** with free SSL  
✅ **GitHub integration** — push code → auto-deploy  
✅ **Fast deploys** (~2-3 minutes)  
✅ **Dynamic `PORT` handling** — the bot auto-detects Railway's assigned port  

### Prerequisites

- GitHub account with your bot code pushed
- Discord bot token
- Patreon OAuth credentials
- Supabase account

### Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (recommended)

### Step 2: Create New Project

1. Click **New Project**
2. Select **Deploy from GitHub repo**
3. Choose your `DISBot` repository
4. Railway auto-detects the `railway.json` config file

### Step 3: Add Environment Variables

Click on your service → **Variables** tab → add all variables:

```
DISCORD_TOKEN=your_discord_bot_token
GUILD_ID=your_discord_server_id
ROOT_ADMIN_ID=your_discord_user_id
PATREON_CLIENT_ID=your_patreon_client_id
PATREON_CLIENT_SECRET=your_patreon_client_secret
PATREON_ACCESS_TOKEN=your_patreon_access_token
PATREON_REFRESH_TOKEN=your_patreon_refresh_token
PATREON_CAMPAIGN_ID=your_campaign_id
WEBHOOK_SECRET=your_webhook_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key
TIER_CONFIG='[{"name":"Diamond","id":"123","rank":100,"cents":2500}]'
NODE_ENV=production
```

> **⚠️ Important**: Use the Supabase **service_role** key (not the anon key). The strict RLS policies restrict database access to `service_role` connections only.

> **Note**: Do NOT set `PORT` or `WEBHOOK_PORT` — Railway dynamically assigns a port via the `PORT` environment variable, and the bot auto-detects it.

### Step 4: Generate a Domain

1. Go to **Settings** → **Networking**
2. Click **Generate Domain**
3. Copy your URL: `https://your-app.up.railway.app`

### Step 5: Configure Patreon Webhook

1. Go to [Patreon Webhooks](https://www.patreon.com/portal/registration/register-webhooks)
2. Add webhook: `https://your-app.up.railway.app/webhooks/patreon`
3. Select events: `members:create`, `members:update`, `members:delete`, `members:pledge:create`, `members:pledge:update`, `members:pledge:delete`, `posts:publish`, `posts:update`, `posts:delete`
4. Set the secret to the same value as your `WEBHOOK_SECRET`
5. Save

> **Note**: The bot also handles legacy `pledges:create/update/delete` events automatically.

### Step 6: Deploy Slash Commands

Use Railway's terminal or run locally:
```bash
npm run deploy-commands
```

✅ **Done!** Your bot is now live 24/7!

---

## Render.com

> ⚠️ **Important**: Render's **free tier does NOT work** for Discord bots. The free tier uses shared IP addresses that get rate-limited by Discord's Cloudflare protection (HTTP 429, error code 1015), causing the bot's gateway connection to hang indefinitely. **You must use a paid Render plan** ($7/month+) or choose another platform.

### Why Render (Paid Plan)?

✅ **Automatic HTTPS**: Get `https://yourbot.onrender.com` instantly  
✅ **Auto-deploy from GitHub**: Push code → Auto-deploy  
✅ **Built-in environment variables**  
⚠️ **Free tier**: Does NOT work for Discord bots (shared IP rate-limiting)  

### Deployment Steps

1. Go to [render.com](https://render.com) → Sign up with GitHub
2. Click **New +** → **Web Service** → Connect your repo
3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: **Starter** ($7/mo) or higher — ⚠️ do NOT use Free
4. Add environment variables (set `WEBHOOK_PORT=10000` for Render)
5. Deploy and copy your webhook URL
6. Configure Patreon webhook: `https://yourbot.onrender.com/webhooks/patreon`
7. Deploy slash commands via Render's Shell tab: `npm run deploy-commands`

---

## Heroku

Classic platform with free tier (requires credit card verification).

### Why Heroku?

✅ **550-1000 free hours/month**  
✅ **Automatic HTTPS**  
✅ **Mature platform**  
✅ **Add-ons ecosystem**  

### Deployment Steps

1. **Install Heroku CLI**
   ```bash
   # Windows (via Chocolatey)
   choco install heroku-cli
   
   # Or download from https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Login to Heroku**
   ```bash
   heroku login
   ```

3. **Create Heroku App**
   ```bash
   cd DISBot
   heroku create your-bot-name
   ```

4. **Add Buildpack**
   ```bash
   heroku buildpacks:set heroku/nodejs
   ```

5. **Set Environment Variables**
   ```bash
   heroku config:set DISCORD_TOKEN=your_token
   heroku config:set GUILD_ID=your_guild_id
   heroku config:set ROOT_ADMIN_ID=your_admin_id
   # ... add all other variables
   heroku config:set PORT=3000
   ```

   Or use the Heroku Dashboard → Settings → Config Vars

6. **Create Procfile**
   Create `Procfile` in your project root:
   ```
   web: npm start
   ```

7. **Deploy**
   ```bash
   git add Procfile
   git commit -m "Add Procfile for Heroku"
   git push heroku main
   ```

8. **Scale Dyno**
   ```bash
   heroku ps:scale web=1
   ```

9. **Get Your URL**
   ```bash
   heroku open
   ```
   Your URL: `https://your-bot-name.herokuapp.com`

10. **Configure Patreon Webhook**
    - Use: `https://your-bot-name.herokuapp.com/webhook`

11. **Deploy Commands**
    ```bash
    heroku run npm run deploy-commands
    ```

---

## Local Hosting with ngrok

Perfect for development and testing.

### Why Local + ngrok?

✅ **Free tier available**  
✅ **Instant HTTPS**  
✅ **Great for testing**  
✅ **No deployment needed**  

### Prerequisites

- Node.js 20+ installed
- ngrok account (free)

### Step 1: Install ngrok

**Windows:**
```bash
choco install ngrok
```

**Or download from:** [ngrok.com/download](https://ngrok.com/download)

### Step 2: Configure ngrok

1. Sign up at [ngrok.com](https://ngrok.com)
2. Get your authtoken
3. Configure:
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

### Step 3: Start Your Bot Locally

```bash
cd DISBot
npm install
npm run build
npm start
```

Bot should start on `http://localhost:3000`

### Step 4: Create ngrok Tunnel

**In a new terminal:**
```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

### Step 5: Configure Patreon Webhook

- Use your ngrok URL: `https://abc123.ngrok.io/webhook`
- **Note**: Free ngrok URLs change on restart!

### Auto-Update with `dev:ngrok` (Recommended)

Instead of manually copying the ngrok URL to Patreon every time, use the automated script:

**Terminal 1:**
```bash
ngrok http 3000
```

**Terminal 2:**
```bash
npm run dev:ngrok
```

This script will:
1. 📡 Auto-detect the ngrok HTTPS URL
2. 🔍 Find your Patreon webhook by campaign ID
3. 📤 PATCH the webhook URI to the new ngrok address
4. 🚀 Start the bot in dev mode with hot-reload

> **First time?** You'll need to create a webhook manually in the Patreon portal first. After that, the script handles URL updates automatically.

### Step 6: Deploy Commands

```bash
npm run deploy-commands
```

### Keeping ngrok URL Permanent (Paid)

With ngrok Pro ($8/month):
```bash
ngrok http 3000 --domain=your-custom-domain.ngrok.io
```

---

## VPS Deployment

Full control with your own server.

### Option 1: VPS with Domain (Recommended)

#### Prerequisites

- VPS (DigitalOcean, Linode, Vultr, etc.)
- Domain name
- Basic Linux knowledge

#### Step 1: Set Up VPS

1. **Create VPS**
   - Ubuntu 22.04 LTS recommended
   - Minimum: 1GB RAM, 1 CPU

2. **SSH into VPS**
   ```bash
   ssh root@your-vps-ip
   ```

3. **Update System**
   ```bash
   apt update && apt upgrade -y
   ```

4. **Install Node.js 20+**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs
   node --version  # Should show v20.x or higher
   ```

5. **Install PM2 (Process Manager)**
   ```bash
   npm install -g pm2
   ```

#### Step 2: Clone Your Bot

```bash
cd /opt
git clone https://github.com/yourusername/DISBot.git
cd DISBot
npm install
npm run build
```

#### Step 3: Configure Environment

```bash
nano .env
# Paste all your environment variables
# Set WEBHOOK_PORT=3000
```

#### Step 4: Set Up HTTPS with Nginx + Let's Encrypt

1. **Install Nginx**
   ```bash
   apt install -y nginx
   ```

2. **Install Certbot**
   ```bash
   apt install -y certbot python3-certbot-nginx
   ```

3. **Configure Domain DNS**
   - Point your domain to your VPS IP:
     - A record: `bot.yourdomain.com` → `your-vps-ip`

4. **Create Nginx Config**
   ```bash
   nano /etc/nginx/sites-available/disbot
   ```

   Add:
   ```nginx
   server {
       listen 80;
       server_name bot.yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
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

5. **Enable Site**
   ```bash
   ln -s /etc/nginx/sites-available/disbot /etc/nginx/sites-enabled/
   nginx -t  # Test configuration
   systemctl restart nginx
   ```

6. **Get SSL Certificate**
   ```bash
   certbot --nginx -d bot.yourdomain.com
   ```

   Follow prompts, choose redirect HTTP to HTTPS.

#### Step 5: Start Bot with PM2

```bash
cd /opt/DISBot
pm2 start npm --name "disbot" -- start
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

#### Step 6: Configure Patreon Webhook

- Use: `https://bot.yourdomain.com/webhook`

#### Step 7: Deploy Commands

```bash
cd /opt/DISBot
npm run deploy-commands
```

#### Useful PM2 Commands

```bash
pm2 status          # Check status
pm2 logs disbot     # View logs
pm2 restart disbot  # Restart bot
pm2 stop disbot     # Stop bot
pm2 delete disbot   # Remove from PM2
```

### Option 2: VPS with ngrok (No Domain Needed)

If you don't have a domain:

1. **Follow VPS setup steps 1-3 above**

2. **Install ngrok on VPS**
   ```bash
   wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
   tar xvzf ngrok-v3-stable-linux-amd64.tgz
   mv ngrok /usr/local/bin/
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

3. **Start Bot**
   ```bash
   cd /opt/DISBot
   pm2 start npm --name "disbot" -- start
   ```

4. **Start ngrok**
   ```bash
   pm2 start "ngrok http 3000" --name "ngrok"
   pm2 save
   ```

5. **Get ngrok URL**
   ```bash
   curl http://localhost:4040/api/tunnels | jq '.tunnels[0].public_url'
   ```

6. **Configure Patreon Webhook**
   - Use the ngrok URL from above

---

## 🔧 Post-Deployment Checklist

After deploying to any platform:

- [ ] Bot is online in Discord
- [ ] Slash commands are registered (`/admin status` works)
- [ ] Patreon webhook is configured
- [ ] Test webhook with `/admin test-alert`
- [ ] Environment variables are set correctly
- [ ] Supabase connection works (using **service_role** key)
- [ ] All migrations run (including `006_strict_rls_policies.sql`)
- [ ] Logs show no errors (`/admin debug-logs`)
- [ ] Tier mappings configured (`/admin set-channel` or `/admin bulk-map`)
- [ ] Event routing set up (optional: `/admin set-event-channel`)
- [ ] Discussion threads enabled if desired (`enable_threads` in config)

---

## 🐛 Troubleshooting

### Bot Not Starting

- Check logs for errors
- Verify all environment variables are set
- Ensure `WEBHOOK_PORT` matches platform requirements
- Check Node.js version (must be 20+)

### Webhooks Not Working

- Verify webhook URL is HTTPS
- Check webhook secret matches
- Test webhook endpoint: `curl https://your-url/webhook`
- Check Patreon webhook configuration

### Commands Not Showing

- Run `npm run deploy-commands`
- Wait 5 minutes for Discord to update
- Restart Discord client
- Verify `GUILD_ID` is correct

---

## 📊 Platform Comparison

| Platform | Discord Compatible | Free Tier | HTTPS | Ease | Best For |
|----------|-------------------|-----------|-------|------|----------|
| **Railway** | ✅ Yes | $5 credit/mo | ✅ Auto | ⭐⭐⭐⭐⭐ | **Recommended** |
| **Render (Paid)** | ✅ Yes | ❌ $7/mo+ | ✅ Auto | ⭐⭐⭐⭐⭐ | Production |
| **Render (Free)** | ❌ **No** | Free | ✅ Auto | — | ⚠️ Blocked by Discord |
| **Heroku** | ✅ Yes | 550-1000h | ✅ Auto | ⭐⭐⭐⭐ | Production |
| **Local + ngrok** | ✅ Yes | Limited | ✅ Auto | ⭐⭐⭐ | Development |
| **VPS + Domain** | ✅ Yes | Varies | ✅ Manual | ⭐⭐ | Full Control |
| **VPS + ngrok** | ✅ Yes | Varies | ✅ Auto | ⭐⭐⭐ | Budget VPS |

---

## 💡 Recommendations

**For Everyone**: Start with **Railway.app** — best developer experience, no Discord rate-limiting, generous free tier.

**For Production**: **VPS with Domain** — full control, best performance, professional setup.

**For Testing**: **Local + ngrok** — instant setup, perfect for development.

> ⚠️ **Avoid Render's free tier** for Discord bots. The shared IPs are rate-limited by Discord/Cloudflare.

---

## 🔗 Useful Links

- [Render Documentation](https://render.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Heroku Node.js Guide](https://devcenter.heroku.com/articles/getting-started-with-nodejs)
- [ngrok Documentation](https://ngrok.com/docs)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Let's Encrypt](https://letsencrypt.org/)
