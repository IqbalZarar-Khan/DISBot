<p align="center">
  <img src="screenshots/icon.png" alt="DISBot Logo" width="120" />
</p>

# 🌱 The Super Simple Creator's Guide

> **Zero coding experience required!**  
> If you want DISBot to automatically post your Patreon chapters, artwork, or announcements into your Discord channels and unlock them on schedule, this guide walks you through every single click from start to finish in plain English — no terminal commands needed.

---

## ⏱️ 5 Easy Steps Roadmap (~8 Minutes Total)

1. [Step 1: Create Your Discord Bot](#step-1-create-your-discord-bot-2-mins) (2 mins — copy your bot token and invite it to your Discord server)
2. [Step 2: Collect Patreon & Free Database Keys](#step-2-collect-patreon--free-database-keys-2-mins) (2 mins — get your Patreon App keys and free database)
3. [Step 3: Put Your Bot Online with Railway](#step-3-put-your-bot-online-with-railway-2-mins) (2 mins — 1-click cloud host that runs 24/7)
4. [Step 4: 1-Click Patreon Login & Webhook](#step-4-1-click-patreon-login--webhook-1-min) (1 min — connect Patreon with one browser click)
5. [Step 5: Pick Your Discord Channels](#step-5-pick-your-discord-channels-1-min) (1 min — tell the bot where to send tier announcements)

---

## Step 1: Create Your Discord Bot (2 mins)

This creates the helper bot that will live inside your Discord server.

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) (log in with your Discord account).
2. Click the blue **"New Application"** button at the top right. Give it a name (e.g. `MyPatreonBot`) and click **Create**.
3. On the left menu, click **Bot**:
   - Click **"Reset Token"** and confirm. Copy that token and paste it somewhere safe on your notepad (this is your `DISCORD_TOKEN`).
   - Scroll down to **Privileged Gateway Intents** and turn ON ✅ **Server Members Intent**. Click **Save Changes**.
4. On the left menu, click **OAuth2** → **URL Generator**:
   - Under *Scopes*, check ✅ `bot` and ✅ `applications.commands`.
   - Under *Bot Permissions*, check ✅ `Administrator` (or Send Messages, Embed Links, Manage Roles, Create Public Threads).
5. Copy the generated invitation link at the bottom, paste it into a new browser tab, and select your Discord server to **invite your bot**!
6. In Discord, turn on Developer Mode (**User Settings ⚙️ → Advanced → Developer Mode** toggle ON):
   - Right-click your Server icon on the left → Click **Copy Server ID** (save as `GUILD_ID`).
   - Right-click your own username → Click **Copy User ID** (save as `ROOT_ADMIN_ID`).

---

## Step 2: Collect Patreon & Free Database Keys (2 mins)

### A. Patreon App Keys & Campaign ID

1. Go to the [Patreon Platform Portal](https://www.patreon.com/portal/registration/register-clients).
2. Click **"Create Client"**:
   - **App Name**: `DISBot`
   - **Redirect URI**: `http://localhost:3000/oauth/redirect` (we will update this with your live Railway link in Step 4).
3. Click **Create Client**. Copy your **Client ID** (save as `PATREON_CLIENT_ID`) and **Client Secret** (save as `PATREON_CLIENT_SECRET`).
4. Find your numeric **Campaign ID** (`PATREON_CAMPAIGN_ID`): In the [Patreon Client Portal](https://www.patreon.com/portal/registration/register-clients), click on your registered client. Your numeric Campaign ID is listed under the **Campaign** section.

### B. Free Cloud Database (Supabase)

1. Go to [Supabase.com](https://supabase.com) and sign up for a free account.
2. Click **"New Project"**, name it `DISBot`, set a secure database password, and click **Create**.
3. Go to **Project Settings ⚙️** (gear icon) → **API**:
   - Copy **Project URL** (save as `SUPABASE_URL`).
   - Copy **`service_role` secret** (save as `SUPABASE_KEY`).

---

## Step 3: Put Your Bot Online with Railway (2 mins)

Railway keeps your bot running 24/7 in the cloud so your home computer doesn't need to stay on.

1. Go to [Railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo** → Select `DISBot`.
3. Under **Settings** → **Networking**, click **"Generate Domain"**. Railway gives you your live URL (e.g. `https://my-bot.up.railway.app`). Save this link!
4. Under the **Variables** tab in Railway, paste your initial keys:

```env
DISCORD_TOKEN=your_bot_token_from_step_1
GUILD_ID=your_server_id_from_step_1
ROOT_ADMIN_ID=your_discord_user_id_from_step_1
PATREON_CLIENT_ID=your_patreon_client_id_from_step_2
PATREON_CLIENT_SECRET=your_patreon_client_secret_from_step_2
PATREON_CAMPAIGN_ID=your_numeric_campaign_id_from_step_2
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key
TIER_CONFIG='[{"name":"Diamond","id":"123456","rank":100,"cents":2500},{"name":"Gold","id":"234567","rank":75,"cents":1000},{"name":"Free","id":"345678","rank":0,"cents":0}]'

# Webhook Security (Leave blank — paste Patreon's generated secret after Step 4)
WEBHOOK_SECRET=

# Patreon OAuth Tokens (Populated and renewed automatically in Step 4)
PATREON_ACCESS_TOKEN=
PATREON_REFRESH_TOKEN=
```

> **💡 How to Find Your Patreon Tier IDs & Build TIER_CONFIG**
>
> `TIER_CONFIG` tells the bot which tiers exist, their rank priority, and their price.
>
> **How to find each Tier ID on Patreon (30 seconds):**
> 1. Log into Patreon and go to **Page Settings → Tiers**.
> 2. Click **"Edit Tier"** on any tier.
> 3. Look at your browser's address bar: the URL looks like `https://www.patreon.com/.../tiers/1234567/edit`. The number between `/tiers/` and `/edit` (e.g. `1234567`) is your **Tier ID**!
>
> **What the 4 fields mean:**
> - `name`: What you call it (e.g. `"Diamond"`, `"Gold"`, `"Free"`).
> - `id`: The numeric Patreon ID you copied from your browser URL above.
> - `rank`: Priority number (e.g. `100` for top tier = Day 1 unlock, `75` for mid tier, `0` for free). Higher ranks unlock earlier.
> - `cents`: Price in pennies ($25 = `2500`, $10 = `1000`, Free = `0`).

---

## Step 4: 1-Click Patreon Login & Webhook (1 min)

Now connect your Patreon account to your running bot:

### A. 1-Click Patreon Login

1. Go to your [Patreon Client Portal](https://www.patreon.com/portal/registration/register-clients), click **Edit** on your client, and set **Redirect URI** to your Railway domain + `/oauth/redirect` (e.g. `https://my-bot.up.railway.app/oauth/redirect`).
2. Now open your live Railway link + `/oauth/start` in your browser (e.g. `https://my-bot.up.railway.app/oauth/start`).
3. Click **"Allow"** on Patreon to authorize your bot.
4. DISBot automatically exchanges your creator tokens and stores them in your database with automated renewal.

### B. Register Patreon Webhook

1. Go to the [Patreon Webhooks Portal](https://www.patreon.com/portal/registration/register-webhooks).
2. Click **"Create Webhook"**:
   - **Webhook URL**: `https://my-bot.up.railway.app/webhooks/patreon` (your real Railway domain + `/webhooks/patreon`).
   - **Triggers**: Check all 9 triggers (members and posts).
3. Click **Create**. Patreon will now generate and display your **Webhook Secret**.
4. Copy that secret, return to **Railway → Variables**, and paste it as `WEBHOOK_SECRET`. Railway will save and restart your bot with webhook security enabled!

---

## Step 5: Pick Your Discord Channels (1 min)

Now open your Discord server and tell the bot where to send tier announcements:

```
# 1. Check that all systems report green checkmarks
/admin status

# 2. Map each Patreon tier to its Discord channel (or use interactive /admin setup)
/admin set-channel tier_name:Diamond channel:#diamond-vip
/admin set-channel tier_name:Gold channel:#gold-readers
/admin set-channel tier_name:Free channel:#public-announcements

# 3. Send a test alert to make sure your embed looks fantastic!
/admin test-alert tier_name:Diamond
```

---

## 🎉 You Are 100% Set Up!

Whenever you publish on Patreon, DISBot immediately posts to your top-tier channel, and then automatically unlocks and posts to lower-tier channels on your waterfall schedule!

---

### 📚 Need More Options or Advanced Developer Tools?
- **[SETUP.md](SETUP.md)** — Comprehensive developer guide with command-line tools & local setup.
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Alternative hosts (Render, Docker, VPS with PM2).
- **[README.md](README.md)** — Full feature overview, architectural diagrams, and documentation index.
