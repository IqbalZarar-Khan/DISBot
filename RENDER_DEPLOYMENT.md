# 🚀 Render.com Deployment Guide

Deploy your Patreon-Discord Bot to Render.com in ~10 minutes with automatic HTTPS!

## Why Render.com?

✅ **Free tier**: 750 hours/month (enough for 24/7 operation)  
✅ **Automatic HTTPS**: Get `https://yourbot.onrender.com` instantly  
✅ **No credit card required** for free tier  
✅ **Auto-deploy from GitHub**: Push code → Auto-deploy  
✅ **Built-in environment variables**  
✅ **Free PostgreSQL database** (if needed later)  

---

## Prerequisites

- [ ] GitHub account
- [ ] Your bot code pushed to GitHub
- [ ] Discord bot token
- [ ] Patreon OAuth credentials

---

## Step 1: Push Code to GitHub

If you haven't already:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Patreon Discord Bot"

# Create repo on GitHub, then:
git remote add origin https://github.com/yourusername/DISBot.git
git branch -M main
git push -u origin main
```

**Important**: Make sure `.env` is in `.gitignore` (it already is!)

---

## Step 2: Create Render Account

1. Go to https://render.com/
2. Click **"Get Started"**
3. Sign up with **GitHub** (easiest option)
4. Authorize Render to access your repositories

---

## Step 3: Create New Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your **DISBot** repository
3. Configure the service:

### Basic Settings
- **Name**: `patreon-discord-bot` (or your choice)
- **Region**: Choose closest to you
- **Branch**: `main`
- **Root Directory**: Leave blank
- **Runtime**: `Node`

### Build & Deploy Settings
- **Build Command**: `npm install && npm run build && npm run deploy-commands`
- **Start Command**: `npm start`

### Instance Type
- **Free** (750 hours/month)

---

## Step 4: Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add all these variables:

| Key | Value | Notes |
|-----|-------|-------|
| `DISCORD_TOKEN` | `your_bot_token` | From Discord Developer Portal |
| `GUILD_ID` | `your_server_id` | Your Discord server ID |
| `ROOT_ADMIN_ID` | `your_user_id` | Your Discord user ID |
| `LOG_CHANNEL_ID` | `channel_id` | Optional - for logs |
| `PATREON_CLIENT_ID` | `your_client_id` | From Patreon OAuth app |
| `PATREON_CLIENT_SECRET` | `your_client_secret` | From Patreon OAuth app |
| `PATREON_ACCESS_TOKEN` | `your_access_token` | From Patreon OAuth flow |
| `PATREON_REFRESH_TOKEN` | `your_refresh_token` | From Patreon OAuth flow |
| `PATREON_CAMPAIGN_ID` | `your_campaign_id` | Your Patreon campaign ID |
| `WEBHOOK_SECRET` | `random_32_char_string` | Generate a random secret |
| `WEBHOOK_PORT` | `10000` | **Important: Use 10000 for Render** |
| `DATABASE_PATH` | `./data/bot.db` | SQLite database path |

**Important**: Render uses port `10000` by default, not `3000`!

---

## Step 5: Update Code for Render

You need to make one small change to support Render's port:

### Update `src/config.ts`

Change the webhook port configuration to use Render's PORT environment variable:

```typescript
// Webhook
webhookSecret: getEnvVar('WEBHOOK_SECRET'),
webhookPort: parseInt(process.env.PORT || getEnvVar('WEBHOOK_PORT', false) || '3000'),
```

This allows Render to set the port dynamically.

**Commit and push this change:**

```bash
git add src/config.ts
git commit -m "Support Render.com PORT environment variable"
git push
```

Render will auto-deploy when you push!

---

## Step 6: Deploy!

1. Click **"Create Web Service"**
2. Wait for deployment (2-3 minutes)
3. Watch the logs - you should see:
   ```
   ✅ Bot logged in as YourBot#1234
   ✅ Webhook server listening on port 10000
   ```

---

## Step 7: Get Your HTTPS URL

After deployment completes:

1. Your service URL will be: `https://patreon-discord-bot.onrender.com`
2. Your webhook URL is: `https://patreon-discord-bot.onrender.com/webhooks/patreon`

**This URL is permanent and has HTTPS automatically!** ✅

---

## Step 8: Test Your Bot

### In Discord:

```
/admin status
```

Should show:
- ✅ Patreon API: Connected
- ✅ Webhooks: Listening
- ✅ Database: Connected

### Configure Tier Mappings:

```
/admin set-channel tier_name:Diamond channel:#diamond-alerts
/admin set-channel tier_name:Gold channel:#gold-alerts
/admin set-channel tier_name:Silver channel:#silver-alerts
```

### Test Alerts:

```
/admin test-alert tier_name:Diamond
```

---

## Step 9: Register Webhook in Patreon

1. Go to [Patreon Webhooks](https://www.patreon.com/portal/registration/register-webhooks)
2. Click **"Create Webhook"**
3. Fill in:
   - **Webhook URL**: `https://patreon-discord-bot.onrender.com/webhooks/patreon`
   - **Triggers**: Select ALL:
     - ✅ members:create
     - ✅ members:update
     - ✅ members:delete
     - ✅ posts:publish
     - ✅ posts:update
   - **Secret**: Use the same value as `WEBHOOK_SECRET` in Render
4. Click **"Create"**

---

## Step 10: Test End-to-End

1. Create a test post on Patreon (set to Diamond tier)
2. Check if alert appears in `#diamond-alerts` ✅
3. Edit the post to change tier to Gold
4. Check if alert appears in `#gold-alerts` ✅

---

## 🎉 You're Live!

Your bot is now running 24/7 with automatic HTTPS!

---

## Managing Your Deployment

### View Logs

1. Go to your service in Render dashboard
2. Click **"Logs"** tab
3. See real-time logs

### Redeploy

Render auto-deploys when you push to GitHub, or:

1. Click **"Manual Deploy"** → **"Deploy latest commit"**

### Update Environment Variables

1. Go to **"Environment"** tab
2. Edit variables
3. Click **"Save Changes"**
4. Service will auto-restart

### Monitor Uptime

1. Go to **"Metrics"** tab
2. See CPU, memory, and request metrics

---

## Important Notes

### Free Tier Limitations

- **750 hours/month** (31.25 days) - enough for 24/7
- **Spins down after 15 minutes of inactivity**
  - First request after spin-down takes ~30 seconds
  - Webhooks might be delayed if bot is sleeping
  - **Solution**: Upgrade to paid tier ($7/month) for always-on

### Keep Bot Awake (Optional)

If you want to prevent spin-down on free tier, you can:

1. Use a service like **UptimeRobot** (free)
2. Ping your `/health` endpoint every 10 minutes
3. This keeps the bot awake 24/7

**UptimeRobot Setup:**
1. Go to https://uptimerobot.com/
2. Add monitor: `https://patreon-discord-bot.onrender.com/health`
3. Check every 5 minutes

---

## Troubleshooting

### Bot Not Starting

**Check Logs:**
1. Go to Render dashboard → Logs
2. Look for errors

**Common Issues:**
- Missing environment variables
- Wrong `WEBHOOK_PORT` (should be `10000`)
- Discord token invalid

### Webhooks Not Working

**Check:**
1. Webhook URL in Patreon matches Render URL
2. `WEBHOOK_SECRET` matches in both places
3. Bot logs show webhook received

**Test Webhook:**
```bash
curl -X POST https://patreon-discord-bot.onrender.com/webhooks/patreon \
  -H "Content-Type: application/json" \
  -H "X-Patreon-Event: members:create" \
  -d '{}'
```

### Commands Not Working

**Re-deploy commands:**
1. SSH into Render shell (in dashboard)
2. Run: `npm run deploy-commands`

Or add to build command:
```
npm install && npm run build && npm run deploy-commands
```

### Unhandled Webhook Events

**Error**: `Unhandled webhook event type: members:pledge:create`

**Cause**: Missing webhook handler for the event type.

**Solution**: The bot now supports all Patreon webhook events:
- ✅ `members:create` - New member account
- ✅ `members:update` - Member account update
- ✅ `members:delete` - Member account deletion
- ✅ `members:pledge:create` - New pledge/subscription
- ✅ `members:pledge:update` - Pledge tier change
- ✅ `members:pledge:delete` - Pledge cancellation
- ✅ `posts:publish` - New post published
- ✅ `posts:update` - Post updated
- ✅ `posts:delete` - Post deleted

If you see this error, ensure you've deployed the latest code with all handlers.

### "No Mapping" Errors

**Error**: `No tier mapping found for tier: Diamond`

**Cause**: Tier mappings are stored in the SQLite database, which resets on Render's free tier.

**Solutions**:

**Option 1: Recreate Mappings After Each Deploy** (Temporary)
After each deployment, run these commands in Discord:
```
/admin set-channel tier_name:Diamond channel:#diamond-alerts
/admin set-channel tier_name:Gold channel:#gold-alerts
/admin set-channel tier_name:Silver channel:#silver-alerts
```

**Option 2: Migrate to Supabase** (Recommended for Production)
Render's free tier uses ephemeral storage. For persistent data:
1. Create a free Supabase account at https://supabase.com
2. Create a new project (free tier: 500MB PostgreSQL)
3. Migrate the bot to use Supabase instead of SQLite
4. Your tier mappings will persist across deployments

**Verify Mappings**:
```
/admin status
```
This shows all configured tier mappings. If empty, you need to recreate them.

**Check Database Path**:
In Render logs, verify the database is being created:
```
✅ Database loaded from file
✅ Database tables created
```

If you see "New database created" on every restart, the database is being reset.

---

## Upgrading to Paid Tier

If you need always-on service:

1. Go to service settings
2. Change instance type to **"Starter"** ($7/month)
3. Benefits:
   - No spin-down
   - Faster response times
   - More resources

---

## Database Persistence

**Important**: Render's free tier has **ephemeral storage**. Your SQLite database will reset when:
- Service restarts
- You redeploy
- Service spins down (sometimes)

**Solutions:**

### Option 1: Use Render's PostgreSQL (Free)
1. Create a PostgreSQL database in Render
2. Update bot to use PostgreSQL instead of SQLite
3. Free tier: 90 days, then $7/month

### Option 2: Use External Storage
- **Supabase**: Free PostgreSQL database
- **MongoDB Atlas**: Free MongoDB database
- **Turso**: Free SQLite in the cloud

### Option 3: Upgrade to Paid Tier
- Persistent disk storage included
- $7/month

For now, SQLite works fine for testing, but plan to migrate for production!

---

## Next Steps

- [ ] Bot deployed and online ✅
- [ ] Webhooks registered ✅
- [ ] Test end-to-end ✅
- [ ] Set up UptimeRobot (optional)
- [ ] Plan database migration (for production)
- [ ] Monitor logs for issues

---

## Cost Summary

- **Free Tier**: $0/month (with spin-down)
- **Starter Tier**: $7/month (always-on)
- **PostgreSQL**: $0 for 90 days, then $7/month

**Total for production**: ~$7-14/month

---

## Support

- **Render Docs**: https://render.com/docs
- **Render Community**: https://community.render.com/
- **Your Bot Logs**: Check Render dashboard

---

Enjoy your deployed bot! 🎉
