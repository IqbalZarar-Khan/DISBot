# 🚀 Quick Deployment Guide

This guide provides quick reference for deploying DISBot using the included configuration files.

## 📁 Configuration Files Overview

| File | Platform | Purpose |
|------|----------|---------|
| `render.yaml` | Render.com | Automated deployment configuration |
| `railway.json` | Railway.app | Build and deploy settings |
| `Procfile` | Heroku | Process type declaration |
| `Dockerfile` | Docker/VPS | Container image definition |
| `docker-compose.yml` | Docker/VPS | Multi-container orchestration |
| `nginx.conf` | VPS | Reverse proxy configuration |
| `ecosystem.config.js` | VPS/PM2 | Process management |

---

## 🎯 Render.com (Recommended)

### Using render.yaml (Automated)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add deployment configs"
   git push origin main
   ```

2. **Create Render Service**
   - Go to [render.com](https://render.com)
   - Click **New +** → **Blueprint**
   - Connect your repository
   - Render will auto-detect `render.yaml`

3. **Add Environment Variables**
   - Go to **Environment** tab
   - Add all variables from `.env.example`
   - **Important**: Set `WEBHOOK_PORT=10000`

4. **Deploy**
   - Click **Apply**
   - Wait for deployment (~3-5 minutes)
   - Copy your URL: `https://yourbot.onrender.com`

5. **Configure Patreon Webhook**
   - URL: `https://yourbot.onrender.com/webhooks/patreon`

---

## 🚂 Railway.app

### Using railway.json

1. **Push to GitHub** (if not already done)

2. **Create Railway Project**
   - Go to [railway.app](https://railway.app)
   - Click **New Project** → **Deploy from GitHub repo**
   - Select your repository

3. **Railway Auto-Detects**
   - `railway.json` is automatically used
   - Build and start commands are configured

4. **Add Environment Variables**
   - Click **Variables** tab
   - Add all from `.env.example`

5. **Generate Domain**
   - **Settings** → **Networking** → **Generate Domain**
   - Copy: `https://yourbot.up.railway.app`

6. **Configure Patreon Webhook**
   - URL: `https://yourbot.up.railway.app/webhooks/patreon`

---

## 🟣 Heroku

### Using Procfile

1. **Install Heroku CLI**
   ```bash
   # Download from: https://devcenter.heroku.com/articles/heroku-cli
   heroku login
   ```

2. **Create Heroku App**
   ```bash
   heroku create your-bot-name
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set DISCORD_TOKEN=your_token
   heroku config:set GUILD_ID=your_guild_id
   # ... add all other variables
   heroku config:set WEBHOOK_PORT=3000
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

5. **Scale Dyno**
   ```bash
   heroku ps:scale web=1
   ```

6. **Get URL**
   ```bash
   heroku open
   ```
   - URL: `https://your-bot-name.herokuapp.com`

7. **Configure Patreon Webhook**
   - URL: `https://your-bot-name.herokuapp.com/webhooks/patreon`

---

## 🐳 Docker (VPS)

### Using Dockerfile & docker-compose.yml

1. **Prerequisites**
   - VPS with Docker installed
   - Domain name (optional, can use ngrok)

2. **Clone Repository**
   ```bash
   ssh user@your-vps
   cd /opt
   git clone https://github.com/yourusername/DISBot.git
   cd DISBot
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   nano .env  # Add your credentials
   ```

4. **Build and Run**
   ```bash
   docker-compose up -d
   ```

5. **Check Status**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

6. **Set Up Nginx (if using domain)**
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/disbot
   sudo nano /etc/nginx/sites-available/disbot  # Update domain
   sudo ln -s /etc/nginx/sites-available/disbot /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

7. **Get SSL Certificate**
   ```bash
   sudo certbot --nginx -d bot.yourdomain.com
   ```

8. **Configure Patreon Webhook**
   - URL: `https://bot.yourdomain.com/webhooks/patreon`

---

## ⚙️ PM2 (VPS without Docker)

### Using ecosystem.config.js

1. **Prerequisites**
   ```bash
   ssh user@your-vps
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
   sudo apt install -y nodejs
   sudo npm install -g pm2
   ```

2. **Clone and Build**
   ```bash
   cd /opt
   git clone https://github.com/yourusername/DISBot.git
   cd DISBot
   npm install
   npm run build
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   nano .env  # Add your credentials
   ```

4. **Start with PM2**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup  # Follow instructions
   ```

5. **Useful PM2 Commands**
   ```bash
   pm2 status          # Check status
   pm2 logs disbot     # View logs
   pm2 restart disbot  # Restart
   pm2 stop disbot     # Stop
   pm2 monit          # Monitor
   ```

6. **Set Up Nginx** (same as Docker section above)

---

## ✅ Post-Deployment Checklist

After deploying to any platform:

- [ ] Bot is online in Discord
- [ ] Run `/admin status` to verify connection
- [ ] Patreon webhook is configured
- [ ] Test with `/admin test-alert tier_name:YourTier`
- [ ] Check logs for errors
- [ ] Verify Supabase connection
- [ ] Test actual Patreon post (optional)

---

## 🔧 Environment Variables

All platforms require these environment variables:

```env
# Discord
DISCORD_TOKEN=your_discord_bot_token
GUILD_ID=your_discord_server_id
ROOT_ADMIN_ID=your_discord_user_id
LOG_CHANNEL_ID=channel_for_logs

# Patreon
PATREON_CLIENT_ID=your_client_id
PATREON_CLIENT_SECRET=your_client_secret
PATREON_ACCESS_TOKEN=your_access_token
PATREON_REFRESH_TOKEN=your_refresh_token
PATREON_CAMPAIGN_ID=your_campaign_id

# Webhook
WEBHOOK_SECRET=random_secret_string
WEBHOOK_PORT=10000  # Render: 10000, Others: 3000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key

# Tier Configuration
TIER_CONFIG='[{"name":"Diamond","id":"123","rank":100,"cents":2500}]'
```

---

## 🐛 Troubleshooting

### Bot Not Starting
- Check environment variables are set
- Verify `WEBHOOK_PORT` matches platform
- Check Node.js version (18+)
- Review logs for errors

### Webhooks Not Working
- Verify URL is HTTPS
- Check webhook secret matches
- Test health endpoint: `curl https://your-url/health`
- Verify Patreon webhook configuration

### Commands Not Showing
- Deploy commands: `npm run deploy-commands`
- Wait 5 minutes for Discord cache
- Verify `GUILD_ID` is correct
- Restart Discord client

---

## 📚 Additional Resources

- [Full Setup Guide](SETUP.md)
- [Detailed Deployment Guide](DEPLOYMENT.md)
- [Render Documentation](https://render.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Docker Documentation](https://docs.docker.com)
- [PM2 Documentation](https://pm2.keymetrics.io)

---

## 💡 Platform Recommendations

| Use Case | Recommended Platform |
|----------|---------------------|
| **Beginners** | Render.com (easiest setup) |
| **Developers** | Railway.app (best DX) |
| **Production** | VPS + Docker (full control) |
| **Budget** | Render.com free tier |
| **Enterprise** | VPS + PM2 + Nginx |
