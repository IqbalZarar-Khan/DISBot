<p align="center">
  <img src="screenshots/icon.png" alt="DISBot Logo" width="120" />
</p>

# 📖 Complete Step-by-Step Setup Guide

> 💡 **Looking for a non-technical guide?**  
> If you have zero coding experience and want a simple click-by-click walkthrough in plain English without terminal commands, follow the **[Simple Creator's Guide (Simple-Guide.md)](Simple-Guide.md)** (~8 minutes).

This guide walks you through setting up, deploying, configuring, and verifying DISBot from start to finish in the correct chronological order.

---

## 🗺️ Setup Roadmap

1. [Step 1: Discord Bot Setup](#step-1-discord-bot-setup) — Create Discord Application, Bot token, and invite permissions.
2. [Step 2: Patreon API Setup](#step-2-patreon-api-setup) — Create OAuth client, copy credentials, and get Campaign ID.
3. [Step 3: Database Setup](#step-3-database-setup) — Set up Supabase PostgreSQL (free) or embedded SQLite.
4. [Step 4: Deploy & Launch DISBot](#step-4-deploy--launch-disbot) — Deploy on Railway, Render, VPS, or run locally.
5. [Step 5: First-Time Configuration](#step-5-first-time-configuration) — Use the Web Setup Wizard or direct `.env`.
6. [Step 6: Register Patreon Webhook](#step-6-register-patreon-webhook) — Connect Patreon webhooks to your live bot URL.
7. [Step 7: Discord Server Mapping](#step-7-discord-server-mapping) — Map Patreon tiers to Discord announcement channels.
8. [Step 8: Testing & Verification](#step-8-testing--verification) — Test alerts, waterfall logic, and HMAC security.

---

## Step 1: Discord Bot Setup

### 1.1 Create Discord Application
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, enter a name (e.g. `DISBot`), and click **Create**.

### 1.2 Create Bot User & Copy Token
1. Go to the **Bot** tab on the left menu.
2. Under **Token**, click **Reset Token** and copy the string.
   - ⚠️ **Save this token** — you will need it for `DISCORD_TOKEN`.
3. Scroll down to **Privileged Gateway Intents** and enable:
   - ✅ **Server Members Intent** (*Required* — DISBot fails to connect without this).
   - ✅ **Message Content Intent** (*Optional* — enables keyword auto-responses).

### 1.3 Invite Bot to Your Server
1. Go to **OAuth2** → **URL Generator** on the left menu.
2. In **Scopes**, select:
   - ✅ `bot`
   - ✅ `applications.commands`
3. In **Bot Permissions**, select:
   - ✅ `Send Messages`
   - ✅ `Embed Links`
   - ✅ `Use Slash Commands`
   - ✅ `Create Public Threads`
   - ✅ `Send Messages in Threads`
   - ✅ `Attach Files` (for `/admin export-data`)
4. Copy the generated URL at the bottom, paste it into your browser, and authorize the bot for your server.

### 1.4 Copy Discord IDs
1. In your Discord app, enable Developer Mode:
   - **User Settings** (gear icon) → **Advanced** → **Developer Mode** (Toggle ON).
2. **Guild ID (`GUILD_ID`)**: Right-click your server icon in the left sidebar → **Copy Server ID**.
3. **Admin ID (`ROOT_ADMIN_ID`)**: Right-click your own username → **Copy User ID**.
4. **Log Channel ID (`LOG_CHANNEL_ID`)**: Right-click an admin text channel → **Copy Channel ID**.

---

## Step 2: Patreon API Setup

### 2.1 Create Patreon OAuth Client
1. Log in to [Patreon Clients Portal](https://www.patreon.com/portal/registration/register-clients).
2. Click **Create Client**.
3. Fill in basic client info:
   - **App Name**: `DISBot`
   - **Redirect URIs**: Set to `http://localhost:3000/oauth/redirect` (you can update this with your public domain later).
4. Click **Create Client**.

### 2.2 Copy Credentials
After creating the client, copy:
- **Client ID** → `PATREON_CLIENT_ID`
- **Client Secret** → `PATREON_CLIENT_SECRET`
- **Creator's Access Token** → `PATREON_ACCESS_TOKEN`
- **Creator's Refresh Token** → `PATREON_REFRESH_TOKEN`

### 2.3 Get Campaign ID
1. Fetch your campaign ID with curl:
   ```bash
   curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" https://www.patreon.com/api/oauth2/v2/campaigns
   ```
2. Copy the `id` string from the JSON response (`PATREON_CAMPAIGN_ID`).

> 💡 **Tip**: Once DISBot is deployed, you can also use the built-in 1-click `/oauth/start` route to automatically authenticate and persist tokens to the database without curl.

---

## Step 3: Database Setup

### Option A: Supabase PostgreSQL (Recommended for Production)
1. Sign up at [Supabase](https://supabase.com) and click **New Project**.
2. Set a project name, region, and strong database password.
3. Once provisioned, go to **Project Settings** (gear icon) → **API**:
   - Copy **Project URL** → `SUPABASE_URL`
   - Copy **`service_role`** secret key → `SUPABASE_KEY`
   > ⚠️ **Important**: Always use the `service_role` secret key (not the public anon key). DISBot enforces strict Row-Level Security (RLS) policies requiring service-role privileges.
4. **Migrations (000–015)**: Database migrations execute **automatically at bot startup** via `src/database/autoMigrate.ts`. No manual SQL execution is required!

### Option B: Embedded SQLite (Zero-Config / Local Testing)
- If `SUPABASE_URL` and `SUPABASE_KEY` are left blank, DISBot automatically initializes a local embedded database at `./data/disbot.sqlite`.

---

## Step 4: Deploy & Launch DISBot

Choose your preferred deployment platform:

### 🌟 Option 4A: Railway.app (Recommended Cloud)
1. Push your repository to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select your `DISBot` repository. Railway auto-detects `railway.json`.
4. In **Settings** → **Networking**, click **Generate Domain** (e.g. `https://your-bot.up.railway.app`).

### Option 4B: Render.com (Paid Starter Plan)
1. Go to [render.com](https://render.com) → **New +** → **Web Service**.
2. Connect your repository and select **Starter ($7/mo)** plan.
   > ⚠️ **Notice**: Do not use Render's Free tier for Discord bots due to Cloudflare IP rate limits.

### Option 4C: Bare-Metal VPS (PM2 / Docker)
```bash
git clone https://github.com/yourusername/DISBot.git /opt/DISBot
cd /opt/DISBot
npm install
npm run check:secrets
npm run build
```

### Option 4D: Local Testing
```bash
npm install
npm run dev
```

---

## Step 5: First-Time Configuration

Choose **Method A** (Visual Web Wizard) or **Method B** (Direct Environment Variables):

### Method A: Web Setup Wizard GUI (Fastest)

1. When DISBot starts on your hosting provider without full configuration, it enters **Secure Cloud Setup Mode** on its web port.
2. Check your hosting container/server logs:
   - If `DISCORD_TOKEN` was already provided, use `DISCORD_TOKEN` as the password.
   - If unconfigured, DISBot prints a secure, one-time `SETUP_TOKEN` to your server console:
     ```
     🔑 [SETUP SECURITY] One-time authorization token generated:
        Token: a1b2c3d4e5...
     ```
3. Open `https://<your-domain>/setup` in your browser (or `http://localhost:3456/wizard` if running locally).
4. Enter your `SETUP_TOKEN` or `DISCORD_TOKEN` to unlock the dashboard.
5. Follow the visual steps:
   - Connect Patreon and fetch tiers.
   - Connect Supabase.
   - Arrange Tier Priority Ranking cards (Diamond → Gold → Silver → Bronze).
   - Customize announcement templates.
6. Click **Save Configuration** / copy variables into your hosting dashboard.
7. Once configured, DISBot automatically locks `/setup` against unauthorized access.

### Method B: Direct Environment Variables

If you prefer configuring via dashboard or `.env`, add the following:

```env
DISCORD_TOKEN=your_bot_token_from_step_1
GUILD_ID=your_guild_id_from_step_1
ROOT_ADMIN_ID=your_user_id_from_step_1
LOG_CHANNEL_ID=your_log_channel_id_from_step_1
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key
PATREON_CLIENT_ID=your_client_id_from_step_2
PATREON_CLIENT_SECRET=your_client_secret_from_step_2
PATREON_ACCESS_TOKEN=your_access_token_from_step_2
PATREON_REFRESH_TOKEN=your_refresh_token_from_step_2
PATREON_CAMPAIGN_ID=your_campaign_id_from_step_2
WEBHOOK_SECRET=generate_a_random_32_character_secret
PUBLIC_URL=https://your-bot.up.railway.app
TIER_CONFIG='[{"name":"Diamond","id":"12345","rank":100,"cents":2500},{"name":"Gold","id":"23456","rank":75,"cents":1500}]'
NODE_ENV=production
```

> 💡 **Auto-Generate `TIER_CONFIG`**: Run `npm run setup:patreon` to automatically discover tier IDs and pledge amounts from Patreon's API.

---

## Step 6: Register Patreon Webhook

1. Log in to the [Patreon Webhooks Portal](https://www.patreon.com/portal/registration/register-webhooks).
2. Click **Create Webhook**.
3. **Webhook URL**: Enter `https://<your-domain>/webhooks/patreon` (e.g. `https://your-bot.up.railway.app/webhooks/patreon`).
4. **Secret**: Enter the exact string set in your `WEBHOOK_SECRET`.
5. **Triggers**: Check all 9 v2 event triggers:
   - `members:create`, `members:update`, `members:delete`
   - `members:pledge:create`, `members:pledge:update`, `members:pledge:delete`
   - `posts:publish`, `posts:update`, `posts:delete`
6. Click **Create**.

---

## Step 7: Discord Server Mapping

With DISBot online in your Discord server:

1. **Verify Health**:
   Type `/admin status` in any Discord channel. You should see all-green status indicators for Discord Gateway, Patreon API, and Supabase Database.
2. **Interactive Tier Mapping**:
   Type `/admin setup` to launch the interactive dropdown menu:
   - Select a Patreon tier (e.g. `Diamond`).
   - Select the corresponding Discord channel (e.g. `#diamond-announcements`).
   - Repeat for all tiers, or use `/admin bulk-map`.
3. **Set Event Channels (Optional)**:
   - `/admin set-event-channel event:member_join channel:#general-welcome`
   - `/admin set-event-channel event:pledge_upgrade channel:#upgrades`
   - `/admin set-event-channel event:member_leave channel:#admin-alerts`

---

## Step 8: Testing & Verification

1. **Test Announcement Templates**:
   ```
   /admin test-alert tier_name:Diamond template_type:post_new
   /admin test-alert tier_name:Gold template_type:post_waterfall
   ```
2. **Test HMAC Webhook Verification**:
   ```bash
   npm run test:webhook -- --event posts:publish --url https://<your-domain>/webhooks/patreon
   ```
3. **Verify Waterfall Release**:
   - Publish a test post on Patreon assigned only to your highest tier (e.g. Diamond).
   - Verify the announcement appears in `#diamond-announcements`.
   - Edit the post on Patreon to add a lower tier (e.g. Gold).
   - Verify that DISBot catches the waterfall update and announces to `#gold-announcements` without double-notifying Diamond!
4. **Check Logs in Discord**:
   - `/admin debug-logs` shows the last 50 log entries.
   - `/admin error-log` views diagnostic error buffers with cause/fix explanations.

---

## 🎉 Setup Complete!

DISBot is now fully operational, self-healing, and ready to automate your Patreon-to-Discord content distribution!
