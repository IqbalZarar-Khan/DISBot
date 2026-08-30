<p align="center">
  <img src="screenshots/icon.png" alt="DISBot Logo" width="120" />
</p>

# 🚀 Quick Start Guide

> 💡 **Not a developer?**  
> If you are a creator looking for a simple click-by-click guide without terminal commands, read the **[Simple Creator's Guide (Simple-Guide.md)](Simple-Guide.md)** instead.

Get DISBot running and connected to Patreon and Discord in minutes!

---

## 📋 Prerequisites Checklist

- [ ] **Node.js 20+** installed (`node -v`)
- [ ] **Discord Account** & access to [Discord Developer Portal](https://discord.com/developers/applications)
- [ ] **Patreon Creator Account** & access to [Patreon Developer Portal](https://www.patreon.com/portal/registration/register-clients)
- [ ] **Supabase Account** (free tier at [supabase.com](https://supabase.com))
- [ ] **Git** installed

---

## Step 1: Clone & Install Dependencies

```bash
git clone https://github.com/yourusername/DISBot.git
cd DISBot
npm install
```

---

## Step 2: Create Discord Bot & Copy Token

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Go to the **Bot** tab → click **Reset Token** and copy it (`DISCORD_TOKEN`).
3. Scroll to **Privileged Gateway Intents** and enable:
   - ✅ **Server Members Intent** (*Required*).
4. Go to **OAuth2** → **URL Generator**:
   - **Scopes**: `bot`, `applications.commands`
   - **Permissions**: `Send Messages`, `Embed Links`, `Use Slash Commands`, `Create Public Threads`, `Send Messages in Threads`, `Attach Files`
5. Open the generated invite URL in your browser and authorize the bot into your server.
6. Enable Discord Developer Mode (User Settings → Advanced) and copy:
   - Server ID → `GUILD_ID`
   - Your User ID → `ROOT_ADMIN_ID`

---

## Step 3: Get Patreon OAuth Credentials

1. Go to [Patreon Developer Portal](https://www.patreon.com/portal/registration/register-clients) → click **Create Client**.
2. Set Redirect URI to `http://localhost:3000/oauth/redirect` (or your public domain).
3. Copy:
   - **Client ID** → `PATREON_CLIENT_ID`
   - **Client Secret** → `PATREON_CLIENT_SECRET`
   - **Creator's Access Token** → `PATREON_ACCESS_TOKEN`
   - **Creator's Refresh Token** → `PATREON_REFRESH_TOKEN`
4. Get your Campaign ID:
   ```bash
   curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" https://www.patreon.com/api/oauth2/v2/campaigns
   ```
   Copy the `id` string (`PATREON_CAMPAIGN_ID`).

---

## Step 4: Get Supabase Database Credentials

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Project Settings** → **API**:
   - Copy **Project URL** → `SUPABASE_URL`
   - Copy **`service_role`** Secret Key → `SUPABASE_KEY`
   *(SQL migrations 000–015 apply automatically on startup)*

---

## Step 5: Configure Environment

```bash
cp .env.example .env
```

Populate your `.env` file:
```env
DISCORD_TOKEN=your_discord_bot_token
GUILD_ID=your_discord_server_id
ROOT_ADMIN_ID=your_discord_user_id
LOG_CHANNEL_ID=your_admin_channel_id

PATREON_CLIENT_ID=your_patreon_client_id
PATREON_CLIENT_SECRET=your_patreon_client_secret
PATREON_ACCESS_TOKEN=your_patreon_access_token
PATREON_REFRESH_TOKEN=your_patreon_refresh_token
PATREON_CAMPAIGN_ID=your_campaign_id

WEBHOOK_SECRET=your_random_32_character_secret
WEBHOOK_PORT=3000

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key

TIER_CONFIG='[{"name":"Diamond","id":"12345","rank":100,"cents":2500},{"name":"Gold","id":"23456","rank":75,"cents":1500}]'
```

> 💡 **Auto-Generate `TIER_CONFIG`**: Run `npm run setup:patreon` to auto-fetch your tier IDs and pledge amounts directly from Patreon!

---

## Step 6: Verify & Launch

```bash
# Verify environment and dependencies
npm run verify

# Start development server
npm run dev
```

You should see:
```
✅ Bot connected as DISBot#1234
✅ Webhook server listening on port 3000
📦 [MIGRATE] All migrations up to date.
```

---

## Step 7: Map Tiers in Discord

In Discord, type:
```
/admin status
```
Confirm all systems are green. Then map your tiers:
```
/admin setup
```
Select each Patreon tier and choose its Discord announcement channel from the interactive dropdown menu.

---

## Step 8: Register Patreon Webhook (Production / Tunnels)

### For Local Testing (Ngrok)
```bash
# Terminal 1:
ngrok http 3000

# Terminal 2:
npm run dev:ngrok
```

### For Production (Railway / Render / VPS)
1. Go to [Patreon Webhook Portal](https://www.patreon.com/portal/registration/register-webhooks).
2. Add Webhook URL: `https://<your-public-url>/webhooks/patreon`
3. Enter your `WEBHOOK_SECRET`.
4. Select all 9 event triggers (`members:*`, `members:pledge:*`, `posts:*`).

---

## Step 9: Test & Celebrate! 🎉

```
/admin test-alert tier_name:Diamond template_type:post_new
```

DISBot is now fully operational!

---

## 🛠️ Essential Commands

```bash
npm run setup:wizard    # Launch local HTML setup dashboard (port 3456)
npm run check:secrets   # Scan repository for exposed tokens
npm test                # Run test suite (53 tests)
npm run build           # Build TypeScript to dist/
npm start               # Start production bot (with prestart auto-build)
```
