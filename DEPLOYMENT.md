# 🚀 Deployment Guide

This guide covers deploying the Patreon-Discord Bot to production.

## Deployment Options

### Option 1: VPS Deployment (Recommended)

#### Prerequisites
- VPS with Node.js 18+ installed
- Domain name with DNS configured
- SSL certificate (Let's Encrypt recommended)

#### Steps

1. **Prepare VPS**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js 18+
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # Install PM2 (process manager)
   sudo npm install -g pm2
   ```

2. **Clone and Setup**
   ```bash
   # Clone repository
   git clone <your-repo-url>
   cd DISBot
   
   # Install dependencies
   npm install
   
   # Create .env file
   nano .env
   # (Paste your environment variables)
   
   # Build project
   npm run build
   ```

3. **Deploy Commands**
   ```bash
   npm run deploy-commands
   ```

4. **Setup SSL with Nginx**
   ```bash
   # Install Nginx
   sudo apt install nginx
   
   # Install Certbot
   sudo apt install certbot python3-certbot-nginx
   
   # Get SSL certificate
   sudo certbot --nginx -d yourdomain.com
   ```

5. **Configure Nginx**
   ```nginx
   # /etc/nginx/sites-available/patreon-bot
   server {
       listen 80;
       server_name yourdomain.com;
       return 301 https://$server_name$request_uri;
   }
   
   server {
       listen 443 ssl;
       server_name yourdomain.com;
       
       ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
       
       location /webhooks/patreon {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
       
       location /health {
           proxy_pass http://localhost:3000;
       }
   }
   ```
   
   ```bash
   # Enable site
   sudo ln -s /etc/nginx/sites-available/patreon-bot /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

6. **Start Bot with PM2**
   ```bash
   # Start bot
   pm2 start dist/index.js --name patreon-bot
   
   # Save PM2 configuration
   pm2 save
   
   # Setup PM2 to start on boot
   pm2 startup
   ```

7. **Register Webhook**
   - Go to [Patreon Webhooks](https://www.patreon.com/portal/registration/register-webhooks)
   - Webhook URL: `https://yourdomain.com/webhooks/patreon`
   - Select all triggers
   - Use your `WEBHOOK_SECRET`

8. **Verify Deployment**
   ```bash
   # Check bot status
   pm2 status
   pm2 logs patreon-bot
   
   # Test webhook endpoint
   curl https://yourdomain.com/health
   ```

---

### Option 2: Heroku Deployment

#### Prerequisites
- Heroku account
- Heroku CLI installed

#### Steps

1. **Prepare Project**
   ```bash
   # Create Procfile
   echo "worker: node dist/index.js" > Procfile
   
   # Ensure start script in package.json
   # "start": "node dist/index.js"
   ```

2. **Create Heroku App**
   ```bash
   heroku login
   heroku create your-bot-name
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set DISCORD_TOKEN=your_token
   heroku config:set GUILD_ID=your_guild_id
   heroku config:set ROOT_ADMIN_ID=your_user_id
   heroku config:set PATREON_CLIENT_ID=your_client_id
   heroku config:set PATREON_CLIENT_SECRET=your_client_secret
   heroku config:set PATREON_ACCESS_TOKEN=your_access_token
   heroku config:set PATREON_CAMPAIGN_ID=your_campaign_id
   heroku config:set WEBHOOK_SECRET=your_webhook_secret
   heroku config:set WEBHOOK_PORT=3000
   ```

4. **Deploy**
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   
   # Scale worker
   heroku ps:scale worker=1
   ```

5. **Register Webhook**
   - Webhook URL: `https://your-bot-name.herokuapp.com/webhooks/patreon`

6. **View Logs**
   ```bash
   heroku logs --tail
   ```

---

### Option 3: Docker Deployment

#### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

#### docker-compose.yml
```yaml
version: '3.8'

services:
  bot:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
```

#### Deploy
```bash
docker-compose up -d
docker-compose logs -f
```

---

## Post-Deployment Checklist

- [ ] Bot appears online in Discord
- [ ] `/admin status` shows all green
- [ ] Tier mappings configured
- [ ] Test alerts working
- [ ] Webhook endpoint accessible via HTTPS
- [ ] Webhook registered in Patreon
- [ ] Test with real Patreon post
- [ ] Monitor logs for errors
- [ ] Set up monitoring/alerts
- [ ] Configure backups for database

---

## Monitoring

### PM2 Monitoring
```bash
# View status
pm2 status

# View logs
pm2 logs patreon-bot

# Monitor resources
pm2 monit

# Restart bot
pm2 restart patreon-bot
```

### Health Check
```bash
# Check webhook server
curl https://yourdomain.com/health

# Should return: {"status":"ok","timestamp":"..."}
```

---

## Troubleshooting

### Bot Not Starting
- Check environment variables: `pm2 env patreon-bot`
- Check logs: `pm2 logs patreon-bot --lines 100`
- Verify Node.js version: `node --version`

### Webhooks Not Working
- Verify HTTPS is working: `curl -I https://yourdomain.com/health`
- Check webhook signature in logs
- Verify webhook secret matches Patreon
- Test with curl:
  ```bash
  curl -X POST https://yourdomain.com/webhooks/patreon \
    -H "Content-Type: application/json" \
    -H "X-Patreon-Event: members:create" \
    -H "X-Patreon-Signature: test" \
    -d '{}'
  ```

### Database Issues
- Check database path exists
- Verify write permissions
- Backup database regularly: `cp data/bot.db data/bot.db.backup`

---

## Maintenance

### Update Bot
```bash
# Pull latest changes
git pull

# Install dependencies
npm install

# Rebuild
npm run build

# Restart
pm2 restart patreon-bot
```

### Backup Database
```bash
# Manual backup
cp data/bot.db backups/bot-$(date +%Y%m%d).db

# Automated backup (crontab)
0 2 * * * cp /path/to/DISBot/data/bot.db /path/to/backups/bot-$(date +\%Y\%m\%d).db
```

### Monitor Disk Space
```bash
df -h
du -sh data/
```

---

## Security Best Practices

1. **Never commit `.env` file**
2. **Use strong webhook secret** (32+ characters)
3. **Keep dependencies updated**: `npm audit fix`
4. **Enable firewall**: Only allow ports 80, 443, 22
5. **Regular backups** of database
6. **Monitor logs** for suspicious activity
7. **Use HTTPS** for all webhook endpoints

---

## Support

If you encounter issues:
1. Check logs: `pm2 logs patreon-bot`
2. Verify configuration: `/admin status` in Discord
3. Review SETUP.md for configuration steps
4. Check GitHub issues
