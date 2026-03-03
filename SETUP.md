# 📖 Setup Guide: Patreon-Discord Bot

This guide will walk you through setting up the Patreon-Discord Content Distribution Bot from scratch.

## Table of Contents

1. [Quick Start (Setup Wizard)](#0-quick-start-setup-wizard)
2. [Discord Bot Setup](#1-discord-bot-setup)
3. [Patreon OAuth Application](#2-patreon-oauth-application)
4. [Supabase Database Setup](#3-supabase-database-setup)
5. [Tier Configuration](#4-tier-configuration)
6. [Environment Configuration](#5-environment-configuration)
7. [Webhook Configuration](#6-webhook-configuration)
8. [Initial Bot Configuration](#7-initial-bot-configuration)
9. [Testing](#8-testing)

---

## 0. Quick Start (Setup Wizard)

The fastest way to get started — launch a local HTML dashboard that handles everything visually:

```bash
npm install
npm run setup:wizard
```

Open `http://localhost:3456/wizard` in your browser. The wizard provides:
- **"Connect Patreon"** button — handles the full OAuth flow, saves tokens to `.env`
- **"Test Supabase"** button — verifies database connectivity
- **"Save to .env"** — writes all config, auto-generates `WEBHOOK_SECRET`

After the wizard saves your `.env`, skip to [Step 7: Initial Bot Configuration](#7-initial-bot-configuration).

> If you prefer manual setup, continue below.

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
   - ✅ **Server Members Intent** (required — bot will fail to connect without this)
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
   - ✅ Create Public Threads
   - ✅ Send Messages in Threads
   - ✅ Attach Files (for `/admin export-data`)
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

You have two options:

**Option A: Automated (Recommended)**

If the bot is already running, navigate to:
```
https://your-bot-url/oauth/start
```
The bot handles the entire OAuth flow automatically and saves the tokens to the database.

**Option B: Setup Wizard**

Run `npm run setup:wizard` and click the "Connect Patreon" button.

**Option C: Manual (curl/Postman)**

1. **Authorization URL** (replace `YOUR_CLIENT_ID`):
   ```
   https://www.patreon.com/oauth2/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/oauth/redirect&scope=campaigns campaigns.members campaigns.posts
   ```

2. Open this URL in your browser and authorize

3. You'll be redirected to `http://localhost:3000/oauth/redirect?code=XXXXX`
   - Copy the `code` parameter

4. Exchange the code for tokens:
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

> **Note**: The bot automatically refreshes expired tokens on 401 errors. You don't need to manually refresh tokens.

### Get Campaign ID

Run `npm run setup:patreon` to auto-fetch your campaign ID and tier config.

Or manually:
```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  https://www.patreon.com/api/oauth2/v2/campaigns
```

---

## 3. Database Setup

The bot supports two database backends:

- **☁️ Supabase (Recommended)** — Cloud-hosted PostgreSQL with RLS, recommended for production
- **💾 SQLite (Zero-Config)** — Embedded local database, great for single-server setups

### Option A: Supabase (Recommended)

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

> **Automatic**: Database migrations run automatically on bot startup. No manual SQL needed!

If you prefer to run migrations manually:
1. Go to **SQL Editor** in Supabase dashboard
2. Click **"New Query"**
3. Copy and paste the migration SQL from `supabase/migrations/`
4. Click **"Run"**

1. Go to **Project Settings** → **API**
2. Copy:
   - **Project URL** → Save for `SUPABASE_URL`
   - **service_role** key → Save for `SUPABASE_KEY`

> ⚠️ **Important**: Use the **service_role** key (not the anon key). The strict RLS policies (migration `006`) restrict access to `service_role` only, protecting your patron data from unauthorized access.

### Option B: SQLite (Zero-Config)

For simple setups or single-server deployments, you can skip Supabase entirely:

1. Install the SQLite dependency:
   ```bash
   npm install better-sqlite3
   ```
2. Leave `SUPABASE_URL` and `SUPABASE_KEY` **blank** in your `.env` file (or select "SQLite" in the Setup Wizard)
3. The bot will automatically create `./data/disbot.sqlite` on first start
4. All tables are created automatically — no manual SQL needed

> **Note**: SQLite stores data locally on your server. It doesn't support multi-instance deployments or cloud database features. Supabase is still recommended for production.

---

## 4. Tier Configuration

The bot uses a dynamic tier system configured via the `TIER_CONFIG` environment variable.

### Automated Setup (Recommended)

The easiest way to configure your tiers is using the setup script. It uses your **Creator Access Token** to fetch everything from the Patreon API.

1. **Get your Creator Access Token**:
   - Go to [Patreon Clients Portal](https://www.patreon.com/portal/registration/register-clients)
   - Click on your client (or create one)
   - Copy the **"Creator's Access Token"** value

2. **Set your token** in `.env`:
   ```bash
   PATREON_ACCESS_TOKEN=your_creator_access_token
   ```

3. **Run the setup script**:
   ```bash
   npm run setup:patreon
   ```

4. The script will automatically:
   - Fetch your `PATREON_CAMPAIGN_ID`
   - Display a formatted table of all your tiers
   - **Auto-write** `TIER_CONFIG`, `PATREON_CAMPAIGN_ID`, and `WEBHOOK_SECRET` to your `.env`
   - Auto-assign ranks based on price (highest = 100)

5. **Adjust ranks** (optional):
   - Ranks are auto-assigned but you can tweak them in `.env` if needed
   - Higher rank = higher tier priority

### Manual Setup (Alternative)

If you prefer to configure manually:

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
SUPABASE_KEY=your_supabase_service_role_key

# Tier Configuration (JSON array - see Step 4)
TIER_CONFIG='[{"name":"Diamond","id":"YOUR_TIER_ID","rank":100,"cents":2500}]'
```

> ⚠️ **`SUPABASE_KEY`** must be the **service_role** key for strict RLS policies to work correctly.

**Generate a webhook secret:**

> **Automatic**: `npm run setup:patreon` and `npm run setup:wizard` both auto-generate a `WEBHOOK_SECRET` if one doesn't exist.

Manual alternative:
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

### Option B: Production (Railway or Render)

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions. **Railway** is the recommended platform.

### Option C: VPS with Automatic HTTPS (Caddy)

Run the included setup script for automatic Caddy + PM2 + SSL provisioning:
```bash
sudo ./setup-vps.sh your-domain.com
```

This single command installs Node.js 20, PM2, and Caddy (automatic HTTPS via Let's Encrypt), configures the reverse proxy, and starts the bot. Your webhook URL becomes `https://your-domain.com/webhooks/patreon`.

### Register Webhook with Patreon

1. Go to [Patreon Webhooks](https://www.patreon.com/portal/registration/register-webhooks)
2. Click **"Create Webhook"**
3. Fill in:
   - **Webhook URL**: `https://your-url/webhooks/patreon`
   - **Triggers**: Select all:
     - ✅ members:create
     - ✅ members:update
     - ✅ members:delete
     - ✅ members:pledge:create
     - ✅ members:pledge:update
     - ✅ members:pledge:delete
     - ✅ posts:publish
     - ✅ posts:update
     - ✅ posts:delete
   - **Secret**: Use the same value as `WEBHOOK_SECRET` in your `.env`
4. Click **"Create"**

> **Note**: Patreon may also send legacy `pledges:create/update/delete` events — the bot handles both formats automatically.

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

Or use the **Bulk Mapping Wizard** to map all tiers at once:
```
/admin bulk-map
```
This walks you through each unmapped tier with a channel dropdown.

### Configure Event Routing (Optional)

Route member events to specific channels:
```
/admin set-event-channel event_type:member_join channel:#welcome
/admin set-event-channel event_type:member_leave channel:#audit-log
/admin set-event-channel event_type:pledge_upgrade channel:#celebrations
```

If not configured, all events fall back to the `LOG_CHANNEL_ID`.

### Enable Discussion Threads (Optional)

To auto-create discussion threads under post alerts:
```
/admin set-config key:enable_threads value:true
```

Threads will be named after the post title (e.g., "💬 My New Chapter") and auto-archive after 1 week.

### Enable Keyword Detection (Optional)

If you've enabled **Message Content Intent** in the Discord Developer Portal, you can activate FAQ auto-replies:
```
/admin set-config key:enable_keyword_detection value:true
```

The bot will auto-reply when users ask common questions like "when is the next chapter?" or "next release?". It also enables prefix commands (`!status`, `!help`) as slash-command fallbacks.

---

## 8. Testing

### Test Bot Status

```
/admin status
```

Should show:
- ✅ Patreon API: Connected (with latency in ms)
- ✅ Database: Connected (member count, post count)
- ✅ Uptime, last webhook timestamp
- ✅ Webhook success rate, tier detection accuracy
- ✅ Your tier mappings
- ⚠️ Recent errors (last 3)

### Test Alerts

```
/admin test-alert tier_name:Diamond
```

Check if the test message appears in your #diamond-alerts channel.

### Preview Custom Templates

```
/admin test-alert tier_name:Diamond template_type:post_new
/admin test-alert tier_name:Gold template_type:post_waterfall
/admin test-alert tier_name:Silver template_type:welcome
```

This previews your custom message templates with sample data.

### View Debug Logs (In-Discord)

```
/admin debug-logs
```

Shows the last 50 log entries as an ephemeral message — no need to SSH into your host.

### Export Patron Data

```
/admin export-data
```

Generates CSV files (patrons, posts, tier mappings) and DMs them to the root admin.

### Test Webhook Security (HMAC)

Test your webhook endpoint with a properly signed mock payload:
```bash
npm run test:webhook
```

Options:
```bash
# Test a specific event type
npm run test:webhook -- --event members:create

# Test against a custom URL
npm run test:webhook -- --url https://your-domain.com/webhooks/patreon
```

Available event types: `posts:publish`, `posts:update`, `members:create`, `members:delete`

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
- Ensure you are using the **service_role** key (not anon key)
- Check Supabase project is active
- Ensure all migrations (including `006_strict_rls_policies.sql`) were run
- The bot uses an in-memory DB cache — it can continue routing posts even during brief Supabase outages

### Token expiration
- The bot automatically refreshes expired Patreon tokens using the refresh token
- If the refresh token itself expires, run `npm run setup:wizard` or visit `/oauth/start` to re-authorize
- On startup, the bot validates OAuth scopes and warns if they're missing

### Ghost/duplicate webhooks
- The bot automatically filters duplicate webhooks (exact body match within 60s)
- "Ghost" webhooks (no meaningful state change) are silently discarded within a 5-minute window
- Check logs for `👻 [GHOST]` entries to confirm filtering

---

## Next Steps

- **Deploy to Production**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Contribute**: See [CONTRIBUTING.md](CONTRIBUTING.md)
- **Report Issues**: Open an issue on GitHub

For more help, check the [README.md](README.md) or open an issue on GitHub.

> **Note**: This bot requires **Node.js 20+** and the **Server Members Intent** enabled in the Discord Developer Portal.
