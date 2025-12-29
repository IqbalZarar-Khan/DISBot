# 📖 Setup Guide: Patreon-Discord Bot

This guide will walk you through setting up the Patreon-Discord Content Distribution Bot from scratch.

## Table of Contents

1. [Discord Bot Setup](#1-discord-bot-setup)
2. [Patreon OAuth Application](#2-patreon-oauth-application)
3. [Supabase Database Setup](#3-supabase-database-setup)
4. [Tier Configuration](#4-tier-configuration)
5. [Environment Configuration](#5-environment-configuration)
6. [Webhook Configuration](#6-webhook-configuration)
7. [Initial Bot Configuration](#7-initial-bot-configuration)
8. [Testing](#8-testing)

---

## 1. Discord Bot Setup

### Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Name your application (e.g., "Patreon Tier Bot")
4. Click **"Create"**

### Create a Bot User

1. In your application, go to the **"Bot"** tab
2. Click **"Add Bot"** → **"Yes, do it!"**
3. Under **"Token"**, click **"Reset Token"** and copy it
   - ⚠️ **Save this token** - you'll need it for `DISCORD_TOKEN`
4. Enable these **Privileged Gateway Intents**:
   - ✅ Server Members Intent
   - ✅ Message Content Intent (optional)

### Invite Bot to Your Server

1. Go to **"OAuth2"** → **"URL Generator"**
2. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select bot permissions:
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Use Slash Commands
4. Copy the generated URL and open it in your browser
5. Select your server and authorize

### Get Your IDs

1. Enable **Developer Mode** in Discord:
   - User Settings → Advanced → Developer Mode
2. **Get Guild ID**:
   - Right-click your server → Copy Server ID
3. **Get Your User ID**:
   - Right-click your username → Copy User ID
4. **Get Channel IDs** (for tier channels):
   - Right-click each channel → Copy Channel ID

---

## 2. Patreon OAuth Application

### Create Patreon OAuth Client

1. Go to [Patreon Clients Portal](https://www.patreon.com/portal/registration/register-clients)
2. Click **"Create Client"**
3. Fill in the details:
   - **App Name**: Your bot name
   - **Description**: Brief description
   - **App Category**: Tools & Utilities
   - **Author or Organization Name**: Your name
   - **Privacy Policy URL**: Your privacy policy (or use a template)
   - **Terms of Service URL**: Your TOS (or use a template)
   - **Redirect URIs**: `http://localhost:3000/oauth/redirect` (for local testing)
4. Click **"Create Client"**

### Get OAuth Credentials

1. After creating, you'll see:
   - **Client ID** → Save for `PATREON_CLIENT_ID`
   - **Client Secret** → Save for `PATREON_CLIENT_SECRET`

### Get Access Token

You'll need to perform an OAuth flow to get your access token. Here's a simple method:

1. **Authorization URL** (replace `YOUR_CLIENT_ID`):
   ```
   https://www.patreon.com/oauth2/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/oauth/redirect&scope=campaigns campaigns.members campaigns.posts
   ```

2. Open this URL in your browser and authorize

3. You'll be redirected to `http://localhost:3000/oauth/redirect?code=XXXXX`
   - Copy the `code` parameter

4. Exchange the code for tokens using curl or Postman:
   ```bash
   curl -X POST https://www.patreon.com/api/oauth2/token \
     -d "code=YOUR_CODE" \
     -d "grant_type=authorization_code" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "redirect_uri=http://localhost:3000/oauth/redirect"
   ```

5. Response will contain:
   - `access_token` → Save for `PATREON_ACCESS_TOKEN`
   - `refresh_token` → Save for `PATREON_REFRESH_TOKEN`

### Get Campaign ID

1. Make a request to get your campaigns:
   ```bash
   curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     https://www.patreon.com/api/oauth2/v2/campaigns
   ```

2. Copy the `id` from the response → Save for `PATREON_CAMPAIGN_ID`

---

## 3. Supabase Database Setup

The bot uses Supabase for persistent data storage.

### Create Supabase Project

1. Go to [Supabase](https://supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - **Name**: Your project name
   - **Database Password**: Strong password (save this!)
   - **Region**: Choose closest to you
5. Click **"Create new project"**
6. Wait for setup to complete (~2 minutes)

### Run Database Migration

1. Go to **SQL Editor** in Supabase dashboard
2. Click **"New Query"**
3. Copy and paste the migration SQL from `supabase/migrations/`
4. Click **"Run"**

### Get Supabase Credentials

1. Go to **Project Settings** → **API**
2. Copy:
   - **Project URL** → Save for `SUPABASE_URL`
   - **anon public** key → Save for `SUPABASE_KEY`

---

## 4. Tier Configuration

The bot uses a dynamic tier system configured via the `TIER_CONFIG` environment variable.

### Find Your Tier IDs

1. Start the bot (after completing environment setup)
2. Create a test post on Patreon for each tier
3. Check the bot logs for messages like:
   ```
   ✅ Extracted Tier IDs: ["12345678"]
   ```
4. Note down the tier ID for each tier

### Configure TIER_CONFIG

Create a JSON array with your tiers:

```json
[
  {
    "name": "Diamond",
    "id": "YOUR_DIAMOND_TIER_ID",
    "rank": 100,
    "cents": 2500
  },
  {
    "name": "Gold",
    "id": "YOUR_GOLD_TIER_ID",
    "rank": 75,
    "cents": 1500
  },
  {
    "name": "Silver",
    "id": "YOUR_SILVER_TIER_ID",
    "rank": 50,
    "cents": 1000
  },
  {
    "name": "Bronze",
    "id": "YOUR_BRONZE_TIER_ID",
    "rank": 25,
    "cents": 300
  },
  {
    "name": "Free",
    "id": "YOUR_FREE_TIER_ID",
    "rank": 0,
    "cents": 0
  }
]
```

**Fields:**
- `name`: Tier name (used in `/admin set-channel` commands)
- `id`: Patreon tier ID (from bot logs)
- `rank`: Priority (100 = highest, 0 = free)
- `cents`: (Optional) Pledge amount in cents for fallback detection

**Convert to single line for .env:**
```bash
TIER_CONFIG='[{"name":"Diamond","id":"12345","rank":100,"cents":2500},{"name":"Gold","id":"67890","rank":75,"cents":1500}]'
```

---

## 5. Environment Configuration

Create a `.env` file in the project root:

```env
# Discord Configuration
DISCORD_TOKEN=your_bot_token_from_step_1
GUILD_ID=your_server_id
ROOT_ADMIN_ID=your_user_id
LOG_CHANNEL_ID=channel_id_for_logs

# Patreon Configuration
PATREON_CLIENT_ID=from_step_2
PATREON_CLIENT_SECRET=from_step_2
PATREON_ACCESS_TOKEN=from_step_2
PATREON_REFRESH_TOKEN=from_step_2
PATREON_CAMPAIGN_ID=from_step_2

# Webhook Configuration
WEBHOOK_SECRET=create_a_random_secret_string
WEBHOOK_PORT=3000

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key

# Tier Configuration (JSON array - see Step 4)
TIER_CONFIG='[{"name":"Diamond","id":"YOUR_TIER_ID","rank":100,"cents":2500}]'
```

**Generate a webhook secret:**
```bash
# On Linux/Mac:
openssl rand -hex 32

# Or use any random string generator
```

---

## 6. Webhook Configuration

### Option A: Local Development (ngrok)

1. Install [ngrok](https://ngrok.com/)
2. Start your bot: `npm run dev`
3. In another terminal, expose port 3000:
   ```bash
   ngrok http 3000
   ```
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Option B: Production (Render.com)

See [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) for detailed deployment instructions.

### Register Webhook with Patreon

1. Go to [Patreon Webhooks](https://www.patreon.com/portal/registration/register-webhooks)
2. Click **"Create Webhook"**
3. Fill in:
   - **Webhook URL**: `https://your-url/webhooks/patreon`
   - **Triggers**: Select all:
     - ✅ members:create
     - ✅ members:update
     - ✅ members:delete
     - ✅ posts:publish
     - ✅ posts:update
   - **Secret**: Use the same value as `WEBHOOK_SECRET` in your `.env`
4. Click **"Create"**

---

## 7. Initial Bot Configuration

### Install Dependencies

```bash
npm install
```

### Build the Project

```bash
npm run build
```

### Deploy Commands

```bash
npm run deploy-commands
```

This registers all slash commands with Discord.

### Start the Bot

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### Configure Tier Mappings

In Discord, use the `/admin set-channel` command to map tiers to channels.

**Important:** Use the same tier names as in your `TIER_CONFIG`:

```
/admin set-channel tier_name:Diamond channel:#diamond-alerts
/admin set-channel tier_name:Gold channel:#gold-alerts
/admin set-channel tier_name:Silver channel:#silver-alerts
/admin set-channel tier_name:Bronze channel:#bronze-alerts
/admin set-channel tier_name:Free channel:#free-content
```

---

## 8. Testing

### Test Bot Status

```
/admin status
```

Should show:
- ✅ Patreon API: Connected
- ✅ Webhooks: Listening
- ✅ Database: Connected (Supabase)
- ✅ Your tier mappings

### Test Alerts

```
/admin test-alert tier_name:Diamond
```

Check if the test message appears in your #diamond-alerts channel.

### Test Tier Detection

1. Create a test post on Patreon (set to your highest tier)
2. Check bot logs for:
   ```
   ✅ Extracted Tier IDs: ["12345678"]
   ✅ ID Translation: 12345678 -> Diamond
   ✅ Final Determined Tier Name: Diamond
   ```
3. Check if alert appears in the correct channel

### Test Waterfall Logic

1. Create a post for your highest tier (e.g., Diamond)
2. Edit the post to add a lower tier (e.g., Gold)
3. Check if waterfall alert appears in the Gold channel
4. Bot logs should show:
   ```
   🌊 Waterfall event: Post Title (Diamond → Gold)
   ✅ Waterfall alert sent to Gold channel
   ```

---

## 🎉 You're Done!

Your bot is now ready to automatically distribute content based on Patreon tiers!

## Troubleshooting

### Bot doesn't respond to commands
- Verify bot is online in Discord
- Check `ROOT_ADMIN_ID` matches your Discord user ID
- Ensure commands were deployed with `npm run deploy-commands`

### Webhooks not working
- Verify webhook URL is accessible via HTTPS
- Check webhook secret matches in both Patreon and `.env`
- Look at bot logs for signature verification errors

### Patreon API errors
- Verify access token is valid
- Check if token needs refreshing
- Ensure OAuth scopes include `campaigns`, `campaigns.members`, `campaigns.posts`

### Tier detection issues
- Verify `TIER_CONFIG` is valid JSON
- Check tier IDs match your Patreon tiers
- Look for tier translation logs in bot output

### Database connection errors
- Verify `SUPABASE_URL` and `SUPABASE_KEY` are correct
- Check Supabase project is active
- Ensure migration was run successfully

---

## Next Steps

- **Deploy to Production**: See [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md)
- **Contribute**: See [CONTRIBUTING.md](CONTRIBUTING.md)
- **Report Issues**: Open an issue on GitHub

For more help, check the [README.md](README.md) or open an issue on GitHub.
