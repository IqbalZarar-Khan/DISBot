# 🚀 Deployment Guide

Complete guide for deploying your Patreon-Discord Bot to various hosting platforms.

## 📋 Table of Contents

- [Render.com (Recommended)](#rendercom-recommended)
- [Railway.app](#railwayapp)
- [Heroku](#heroku)
- [Local Hosting](#local-hosting-with-ngrok)
- [VPS Deployment](#vps-deployment)

---

## Render.com (Recommended)

Deploy in ~10 minutes with automatic HTTPS!

### Why Render.com?

✅ **Free tier**: 750 hours/month (enough for 24/7 operation)  
✅ **Automatic HTTPS**: Get `https://yourbot.onrender.com` instantly  
✅ **No credit card required** for free tier  
✅ **Auto-deploy from GitHub**: Push code → Auto-deploy  
✅ **Built-in environment variables**  

### Prerequisites

- GitHub account
- Your bot code pushed to GitHub
- Discord bot token
- Patreon OAuth credentials
- Supabase account

### Step 1: Create Render Account

1. Go to [render.com](https://render.com)
2. Click **Sign Up**
3. Sign up with GitHub (recommended)

### Step 2: Create New Web Service

1. Click **New +** → **Web Service**
2. Connect your GitHub repository
3. Select your `DISBot` repository
4. Configure:
   - **Name**: `disbot` (or your choice)
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

### Step 3: Add Environment Variables

Click **Environment** tab and add all variables from your `.env` file:

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
WEBHOOK_PORT=10000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_key
TIER_CONFIG='[{"name":"Diamond","id":"123","rank":100,"cents":2500}]'
```

**Important**: Set `WEBHOOK_PORT=10000` (Render's default port)

### Step 4: Deploy

1. Click **Create Web Service**
2. Wait for deployment (2-5 minutes)
3. Copy your webhook URL: `https://yourbot.onrender.com`

### Step 5: Configure Patreon Webhook

1. Go to [Patreon Webhooks](https://www.patreon.com/portal/registration/register-webhooks)
2. Add webhook: `https://yourbot.onrender.com/webhook`
3. Select events: `members:create`, `members:update`, `posts:publish`, `posts:update`, `posts:delete`
4. Save

### Step 6: Deploy Slash Commands

Use Render's **Shell** feature:
1. Go to your service → **Shell** tab
2. Run: `npm run deploy-commands`

✅ **Done!** Your bot is now live 24/7!

---

## Railway.app

Modern platform with excellent developer experience.

### Why Railway?

✅ **$5 free credit/month** (enough for small bots)  
✅ **Automatic HTTPS**  
✅ **GitHub integration**  
✅ **Simple configuration**  

### Deployment Steps

1. **Create Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click **New Project**
   - Select **Deploy from GitHub repo**
   - Choose your `DISBot` repository

3. **Configure Environment Variables**
   - Click on your service
   - Go to **Variables** tab
   - Add all environment variables from `.env`
   - Set `PORT=3000` (Railway auto-assigns, but we use 3000)

4. **Configure Build**
   - Railway auto-detects Node.js
   - Build command: `npm install && npm run build`
   - Start command: `npm start`

5. **Generate Domain**
   - Go to **Settings** → **Networking**
   - Click **Generate Domain**
   - Copy your URL: `https://yourbot.up.railway.app`

6. **Configure Patreon Webhook**
   - Use your Railway URL: `https://yourbot.up.railway.app/webhook`

7. **Deploy Commands**
   - Use Railway's terminal or deploy locally with `npm run deploy-commands`

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

- Node.js 18+ installed
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

4. **Install Node.js 18+**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
   apt install -y nodejs
   node --version  # Should show v18.x or higher
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
- [ ] Supabase connection works
- [ ] Logs show no errors

---

## 🐛 Troubleshooting

### Bot Not Starting

- Check logs for errors
- Verify all environment variables are set
- Ensure `WEBHOOK_PORT` matches platform requirements
- Check Node.js version (must be 18+)

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

| Platform | Free Tier | HTTPS | Ease | Best For |
|----------|-----------|-------|------|----------|
| **Render** | 750h/mo | ✅ Auto | ⭐⭐⭐⭐⭐ | Production |
| **Railway** | $5 credit | ✅ Auto | ⭐⭐⭐⭐⭐ | Production |
| **Heroku** | 550-1000h | ✅ Auto | ⭐⭐⭐⭐ | Production |
| **Local + ngrok** | Limited | ✅ Auto | ⭐⭐⭐ | Development |
| **VPS + Domain** | Varies | ✅ Manual | ⭐⭐ | Full Control |
| **VPS + ngrok** | Varies | ✅ Auto | ⭐⭐⭐ | Budget VPS |

---

## 💡 Recommendations

**For Beginners**: Start with **Render.com** - easiest setup, free tier, automatic HTTPS.

**For Developers**: **Railway.app** - best developer experience, generous free tier.

**For Production**: **VPS with Domain** - full control, best performance, professional setup.

**For Testing**: **Local + ngrok** - instant setup, perfect for development.

---

## 🔗 Useful Links

- [Render Documentation](https://render.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Heroku Node.js Guide](https://devcenter.heroku.com/articles/getting-started-with-nodejs)
- [ngrok Documentation](https://ngrok.com/docs)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Let's Encrypt](https://letsencrypt.org/)
