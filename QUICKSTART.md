# 🚀 Quick Start Guide

Get your Patreon-Discord Bot running in minutes!

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] Discord account
- [ ] Patreon Creator account
- [ ] Git installed

---

## Step 1: Install Dependencies

```bash
npm install
```

---

## Step 2: Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** → Name it → **"Create"**
3. Go to **"Bot"** tab → **"Add Bot"**
4. Copy the **Token** (you'll need this for `.env`)
5. Enable **Privileged Gateway Intents**:
   - ✅ Server Members Intent
6. Go to **"OAuth2"** → **"URL Generator"**
   - Scopes: `bot`, `applications.commands`
   - Permissions: Send Messages, Embed Links, Use Slash Commands
7. Copy the URL and invite bot to your server

### Get Your IDs
- Enable Developer Mode: Discord Settings → Advanced → Developer Mode
- **Server ID**: Right-click server → Copy Server ID
- **Your User ID**: Right-click your name → Copy User ID
- **Channel IDs**: Right-click channels → Copy Channel ID (for tier channels)

---

## Step 3: Setup Patreon OAuth

### Quick Method (For Testing)

1. Go to [Patreon Clients](https://www.patreon.com/portal/registration/register-clients)
2. Click **"Create Client"**
3. Fill in basic info (name, description, etc.)
4. **Redirect URI**: `http://localhost:3000/oauth/redirect`
5. Click **"Create"**
6. Copy **Client ID** and **Client Secret**

### Get Access Token

Open this URL in your browser (replace `YOUR_CLIENT_ID`):

```
https://www.patreon.com/oauth2/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/oauth/redirect&scope=campaigns campaigns.members campaigns.posts
```

You'll be redirected to: `http://localhost:3000/oauth/redirect?code=XXXXX`

Copy the `code` and run this (replace values):

```bash
curl -X POST https://www.patreon.com/api/oauth2/token \
  -d "code=YOUR_CODE" \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000/oauth/redirect"
```

Copy the `access_token` and `refresh_token` from the response.

### Get Campaign ID

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  https://www.patreon.com/api/oauth2/v2/campaigns
```

Copy the `id` from the response.

---

## Step 4: Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit .env file
notepad .env  # or use your preferred editor
```

Fill in your `.env`:

```env
# Discord
DISCORD_TOKEN=your_bot_token_from_step_2
GUILD_ID=your_server_id
ROOT_ADMIN_ID=your_user_id
LOG_CHANNEL_ID=optional_log_channel_id

# Patreon
PATREON_CLIENT_ID=from_step_3
PATREON_CLIENT_SECRET=from_step_3
PATREON_ACCESS_TOKEN=from_step_3
PATREON_REFRESH_TOKEN=from_step_3
PATREON_CAMPAIGN_ID=from_step_3

# Webhook
WEBHOOK_SECRET=create_a_random_32_char_string
WEBHOOK_PORT=3000

# Database
DATABASE_PATH=./data/bot.db
```

**Generate webhook secret:**
```bash
# Windows PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})

# Or just use any random 32+ character string
```

---

## Step 5: Verify Setup

```bash
npm run verify
```

This checks:
- ✅ Environment variables
- ✅ TypeScript compilation
- ✅ Patreon API connection
- ✅ Port availability

Fix any issues before continuing.

---

## Step 6: Deploy Commands

```bash
npm run deploy-commands
```

This registers all `/admin` commands with Discord.

---

## Step 7: Start the Bot

```bash
npm run dev
```

You should see:
```
✅ Bot logged in as YourBot#1234
✅ Webhook server listening on port 3000
```

---

## Step 8: Configure Tier Mappings

In Discord, run these commands:

```
/admin status
```

Should show Patreon API connected ✅

```
/admin set-channel tier_name:Diamond channel:#diamond-alerts
/admin set-channel tier_name:Gold channel:#gold-alerts
/admin set-channel tier_name:Silver channel:#silver-alerts
```

---

## Step 9: Test Alerts

```
/admin test-alert tier_name:Diamond
```

Check if the test message appears in `#diamond-alerts`.

---

## Step 10: Setup Webhooks (For Production)

### Development (ngrok)

1. Install [ngrok](https://ngrok.com/)
2. In a new terminal:
   ```bash
   ngrok http 3000
   ```
3. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Register Webhook

1. Go to [Patreon Webhooks](https://www.patreon.com/portal/registration/register-webhooks)
2. Click **"Create Webhook"**
3. **Webhook URL**: `https://your-ngrok-url/webhooks/patreon`
4. **Triggers**: Select ALL:
   - members:create
   - members:update
   - members:delete
   - posts:publish
   - posts:update
5. **Secret**: Use the same value as `WEBHOOK_SECRET` in `.env`
6. Click **"Create"**

---

## Step 11: Test End-to-End

1. Create a test post on Patreon (set to Diamond tier)
2. Check if alert appears in `#diamond-alerts` ✅
3. Edit the post to change tier to Gold
4. Check if alert appears in `#gold-alerts` ✅

---

## 🎉 You're Done!

Your bot is now running and ready to distribute content!

---

## Useful Commands

```bash
# Development (with auto-reload)
npm run dev

# Production build
npm run build
npm start

# Verify deployment readiness
npm run verify

# Test webhooks manually
npm run test:webhooks

# View logs (if using PM2)
pm2 logs patreon-bot
```

---

## Troubleshooting

### Bot doesn't appear online
- Check `DISCORD_TOKEN` is correct
- Verify bot is invited to your server

### Commands don't work
- Run `npm run deploy-commands` again
- Check `ROOT_ADMIN_ID` matches your Discord user ID
- Verify `GUILD_ID` is correct

### Webhooks not working
- Ensure ngrok is running
- Check webhook URL in Patreon matches ngrok URL
- Verify `WEBHOOK_SECRET` matches in both places
- Check bot logs for signature verification errors

### Patreon API errors
- Verify access token is valid
- Check if token expired (get new one)
- Ensure OAuth scopes include: `campaigns`, `campaigns.members`, `campaigns.posts`

---

## Next Steps

- Read [SETUP.md](SETUP.md) for detailed configuration
- Read [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
- Check [README.md](README.md) for full documentation

---

## Support

Need help? Check:
1. Bot logs for errors
2. `/admin status` in Discord
3. SETUP.md for detailed steps
4. GitHub issues
