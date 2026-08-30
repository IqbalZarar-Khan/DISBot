<p align="center">
  <img src="screenshots/icon.png" alt="DISBot Logo" width="150" />
</p>

# DISBot — Intelligent Content Distribution

<p align="center">
  <img src="screenshots/1.jpg" alt="DISBot Hero — Intelligent Content Distribution" width="100%" />
</p>

<p align="center">
  <strong>Automate your Patreon-to-Discord workflow.</strong> Open Source · Secure · Self-Hosted.
</p>

<p align="center">
  <a href="https://railway.app/new/template/disbot?referralCode=nLfB6T">
    <img src="https://railway.com/button.svg" alt="Deploy on Railway" />
  </a>
</p>

---

<p align="center">
  <img src="screenshots/2.jpg" alt="The Creator's Dilemma — Manual Chaos vs Automated Order" width="100%" />
</p>

## ✨ Features

### 🏗️ Architecture

<p align="center">
  <img src="screenshots/3.jpg" alt="Architecture — Patreon Webhooks → DISBot Core → Discord API" width="100%" />
</p>

### 🌟 Core Features
- **🎯 Waterfall Release System**: Smart, tiered content distribution that prevents spam
- **⚡ Hybrid Broadcast System**: Detects multi-tier releases and alerts all relevant channels simultaneously
- **👥 Member Tracking**: Logs new pledges, upgrades, and departures to Supabase
- **🔄 Automated Role Sync**: Auto-grants/revokes Discord roles based on Patreon tier changes
- **📊 Web Analytics Dashboard**: JWT-gated Chart.js SPA with patron growth, tier distribution, and activity
- **🔒 Zero-Trust Security**: HMAC webhook verification, Row-Level Security, whitelist-protected admin commands
- **💎 Dynamic Tier System**: Configurable via JSON or live-synced from the Patreon API
- **🗄️ Graceful Degradation**: In-memory DB cache keeps the bot running if Supabase goes offline

<p align="center">
  <img src="screenshots/4.jpg" alt="The Waterfall Release System — Day 1 Diamond, Day 7 Gold, Day 14 Public" width="100%" />
</p>

### 🛠️ Setup & Deployment
- **🧙 Setup Wizard GUI**: `npm run setup:wizard` launches a local HTML dashboard for frictionless first-time setup
- **🎩 Interactive Discord Setup**: Wizard generates exact invite URL with all scopes/permissions pre-selected
- **📡 Automated Webhook Creation**: Setup wizard auto-creates Patreon webhooks with all 9 triggers via API
- **🎯 Drag-and-Drop Tier Ranker**: Visual tier priority cards in wizard — no JSON editing needed
- **📝 Visual Template Editor**: Drag-and-drop placeholders with live Discord embed preview in wizard
- **🚂 Railway Domain Auto-Detection**: Dynamically detects Railway public domains during cloud setup mode for 1-click Patreon config
- **🚀 1-Click Railway Deploy**: Deploy button in README auto-provisions the entire app with env var form
- **🚀 One-Command VPS Setup**: `setup-vps.sh` installs Node.js, PM2, Caddy (auto-HTTPS) in a single script
- **🐳 Self-Contained Docker Compose**: Full stack (bot + PostgreSQL + PostgREST) — no Supabase Cloud needed
- **🚇 Zero-Auth Local Tunnels**: `npm run dev:tunnel` — no ngrok account required (uses localtunnel)
- **🔨 Auto-Capture IDs**: Type `!claim` in any channel — bot captures Guild ID, Admin ID, Channel ID automatically
- **🎉 First-Deploy Welcome DM**: Interactive onboarding DM with setup checklist on first deployment

### 💬 Community & Engagement
- **💬 Custom Message Templates**: Fully customizable with placeholders (`{tier}`, `{title}`, `{url}`, `{user}`, `{post_snippet}`, `{pledge_amount}`, `{patron_count}`)
- **🧵 Auto-Thread Creation**: Optionally creates discussion threads under post alerts to keep channels clean
- **🗑️ Silent Post Deletion**: Automatically removes deleted posts without spammy notifications
- **💌 Win-Back DMs**: Auto-DMs departing patrons with a customizable farewell message
- **🎂 Anniversary Celebrations**: Daily checker posts celebratory messages for 1yr/2yr pledge milestones
- **🔑 Keyword Detection**: Auto-replies to FAQ keywords ("next chapter?") when Message Content Intent is enabled
- **📖 Serialized Content Formatting**: Auto-detects "Chapter N" / "Part N" in titles for spoiler-tagged embeds

### 🤖 Automation & Management
- **🔀 Event Routing**: Route member events (joins, departures, upgrades) to specific Discord channels
- **📋 Interactive Setup**: `/admin setup` with dropdown menus for tier→channel mapping
- **🔧 Bulk Mapping Wizard**: `/admin bulk-map` maps all unmapped tiers in a guided sequence
- **🔄 Live Tier Sync**: `/admin sync-tiers` fetches tiers from Patreon API without restarting
- **🔐 OAuth Token Exchange**: Built-in `/oauth/start` route eliminates curl/Postman for token setup
- **🔄 Automatic Token Refresh**: `patreonClient.ts` auto-refreshes expired tokens on 401 errors
- **🌍 Currency-Aware Pledges**: Normalizes international currencies to USD cents for accurate tier detection
- **👻 Ghost Webhook Filter**: Silently discards duplicate webhooks with no meaningful state change
- **🔄 Poller Toggle**: `/admin poller` lets admins start/stop the background poller to save resources
- **🔗 `/link` Command**: Members self-link their Discord to Patreon via email/name for role sync
- **⌨️ Prefix Commands**: `!status` and `!help` as slash-command fallbacks

### 📊 Diagnostics & Analytics
- **📊 Patron Analytics**: `/admin stats` shows growth, tier distribution, and recent activity
- **📊 Weekly Digest**: Every Sunday, DMs root admin a detailed community digest (total active, new joins, **paid joins with tier details**, cancellations, and tier changes)
- **📦 Data Export**: `/admin export-data` generates CSV files of all patron data and DMs them to the admin
- **🖥️ Server Monitoring**: `/admin server-stats` shows live CPU, memory, uptime, and PM2 info
- **🔍 In-Discord Debug Logs**: `/admin debug-logs` shows the last 50 X-Ray log entries without leaving Discord
- **🕵️ Enhanced Diagnostics**: `/admin status` shows API latency, uptime, webhook stats, and tier detection accuracy
- **🧪 Template Preview**: `/admin test-alert <tier> <template_type>` previews custom templates with sample data
- **🛡️ Proactive Fallback Warnings**: DMs admin when tier detection falls back to cents/title matching
- **⚠️ Tier Rank Validation**: Warns on startup if cheaper tiers outrank expensive tiers in config
- **🔬 Startup Scope Validation**: Verifies Patreon OAuth token scopes on boot, warns if missing
- **🩺 Startup Health Checks**: Verifies Server Members Intent + Patreon webhook registration on boot
- **🏗️ Auto DB Migrations**: Runs pending SQL migrations automatically on startup
- **💥 HMAC Webhook Tester**: `npm run test:webhook` sends properly signed mock payloads to your endpoint
- **💾 SQLite Fallback Database**: Zero-config embedded DB when Supabase is not configured

### 🚀 Performance & Scalability
- **⚡ Fastify Server**: Express replaced with Fastify for 2–3× webhook throughput
- **📬 BullMQ + Redis Queue**: Webhook events queued via BullMQ for controlled concurrency, with auto-fallback to direct processing when Redis is unavailable
- **🗄️ Redis-Backed Caching**: Distributed cache layer enables horizontal scaling across multiple instances
- **📝 Batched DB Writes**: Member upserts buffered and flushed every 5 seconds to reduce Supabase load
- **📋 Webhook Event Cache**: Every verified webhook persisted to `webhook_log` table for audit, replay, and missed-announcement recovery
- **🔀 Centralized Event Router**: Extracted webhook routing for reuse by both Fastify (direct) and BullMQ worker (queued)
- **🚨 Smart Error Buffer**: In-memory error log with severity classification, cause/fix explanations, and `/admin error-log` viewer

<p align="center">
  <img src="screenshots/5.jpg" alt="A Complete Community Toolkit" width="100%" />
</p>

## 📚 Documentation

> 💡 **Non-Developer or Creator?**  
> If you have zero coding experience and want a simple click-by-click walkthrough in plain English, follow **[Simple-Guide.md (Super Simple Creator's Guide)](Simple-Guide.md)** (~8 minutes, zero terminal commands required!).

- **[🌱 Simple Creator's Guide](Simple-Guide.md)** — **For Non-Developers**: Zero-code, click-by-click setup guide
- **[📖 Detailed Setup Guide](SETUP.md)** — Step-by-step developer setup for Discord, Patreon, and Supabase
- **[🚀 Deployment Guide](DEPLOYMENT.md)** — Production deployment on Railway, Render, VPS/PM2, Docker, and Heroku
- **[⚡ Deployment Quick Reference](DEPLOY_CONFIG_GUIDE.md)** — Environment variables & platform blueprints
- **[📜 Changelog](CHANGELOG.md)** — Full release history
- **[🤝 Contributing Guide](CONTRIBUTING.md)** — How to contribute to this project
- **[🛡️ Permissions & Security Architecture](CPDSC.md)** — Discord slash command permissions & security model

### 📖 Wiki (Maintainer Knowledge Base)

| Page | Description |
|------|-------------|
| [Home](docs/wiki/Home.md) | Index, 30-second overview, tech stack, repo orientation |
| [Architecture](docs/wiki/Architecture.md) | Boot sequence, component diagram, graceful degradation |
| [Diagrams](docs/wiki/Diagrams.md) | Mermaid graphs: system overview, webhook lifecycle, waterfall, data layers, module map |
| [Configuration](docs/wiki/Configuration.md) | All env vars, `TIER_CONFIG`, `METRICS_TOKEN`, setup mode |
| [Webhook Pipeline](docs/wiki/Webhook-Pipeline.md) | Ingestion lifecycle: verify → log → filter → queue → route → replay |
| [Tiers & Waterfall](docs/wiki/Tiers-and-Waterfall.md) | 5-layer tier detection cascade, ranks, waterfall mechanics, hybrid broadcast |
| [Commands](docs/wiki/Commands.md) | All 18 `/admin` subcommands + `/link` reference |
| [Database](docs/wiki/Database.md) | 7 tables, migrations, Supabase/SQLite adapters, batch writer |
| [Monitoring](docs/wiki/Monitoring.md) | `/metrics` endpoint, analytics dashboard, diagnostics, replay tooling |
| [Deployment](docs/wiki/Deployment.md) | Runtime model, hosting targets, gotchas |
| [Development](docs/wiki/Development.md) | Testing, conventions, extension points, i18n, known tech debt |

## 🚀 Quick Start

> 💡 **Are you a non-developer?** Use the **[Simple Creator's Guide (Simple-Guide.md)](Simple-Guide.md)** instead of the developer instructions below.

### Prerequisites

- Node.js 20+ and npm
- A Discord bot token ([Create one here](https://discord.com/developers/applications))
- A Patreon Creator account with OAuth app ([Setup guide](https://www.patreon.com/portal/registration/register-clients))
- A Supabase account ([Sign up here](https://supabase.com))
- A server with HTTPS support for webhooks (Railway, Render, ngrok, etc.)

### 3-Step Setup Flow

#### Step 1: Deploy or Clone
- **Cloud (1-Click Railway)**: Click [Deploy on Railway](https://railway.app/new/template/disbot?referralCode=nLfB6T)
- **Local / Self-Hosted**:
  ```bash
  git clone https://github.com/yourusername/DISBot.git
  cd DISBot
  npm install
  ```

#### Step 2: Configure Credentials
Choose your preferred setup method:

- **Option A — Web Setup Wizard (Recommended)**:
  - Deploy to your host or run `npm run dev`.
  - Check your container/server logs for the secure one-time `SETUP_TOKEN` (or use `DISCORD_TOKEN` if already set).
  - Open `https://<your-domain>/setup` (or `http://localhost:3456/wizard` for `npm run setup:wizard`).
  - Follow the visual setup to connect Patreon, Supabase, and configure your tier priority rankings.

- **Option B — Direct `.env` File**:
  ```bash
  cp .env.example .env
  # Populate DISCORD_TOKEN, PATREON_*, SUPABASE_*, and TIER_CONFIG
  ```
  *(Run `npm run setup:patreon` to auto-discover your tiers and auto-populate `TIER_CONFIG`)*

#### Step 3: Register Patreon Webhook & Map Discord Channels
1. In Patreon Portal, create a webhook pointing to `https://<your-domain>/webhooks/patreon` with all 9 triggers.
2. In Discord, run `/admin setup` to map your Patreon tiers to Discord announcement channels.

> 📚 For comprehensive step-by-step guidance with screenshots, see **[SETUP.md](SETUP.md)**.

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
GUILD_ID=your_discord_server_id
ROOT_ADMIN_ID=your_discord_user_id
LOG_CHANNEL_ID=channel_for_logs (optional)

# Patreon Configuration
PATREON_CLIENT_ID=your_patreon_client_id
PATREON_CLIENT_SECRET=your_patreon_client_secret
PATREON_ACCESS_TOKEN=your_patreon_access_token
PATREON_REFRESH_TOKEN=your_patreon_refresh_token
PATREON_CAMPAIGN_ID=your_campaign_id

# Webhook Configuration
WEBHOOK_SECRET=your_webhook_secret
WEBHOOK_PORT=3000

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_or_service_key

# Tier Configuration (JSON array)
# Format: [{"name":"TierName","id":"PatreonTierID","rank":RankNumber,"cents":AmountInCents}]
# Rank: 100 = Highest priority, 0 = Free
# cents: Optional pledge amount in cents for fallback tier detection
TIER_CONFIG='[{"name":"Tier1","id":"TIER_ID_1","rank":100,"cents":2500},{"name":"Tier2","id":"TIER_ID_2","rank":75,"cents":1500}]'
```

### Tier Configuration

The bot uses a dynamic tier system configured via the `TIER_CONFIG` environment variable:

**JSON Structure:**
```json
[
  {
    "name": "YourTierName",
    "id": "PatreonTierID",
    "rank": 100,
    "cents": 2500
  }
]
```

- **name**: Tier name used in `/admin set-channel` commands
- **id**: Patreon tier ID (found using tool setup:patreon)
- **rank**: Priority level (100 = highest, 0 = free)
- **cents**: (Optional) Minimum pledge amount in cents for fallback tier detection

**Examples:**

Standard 5-tier setup with cents fallback:
```bash
TIER_CONFIG='[{"name":"Tier1","id":"TIER_ID_1","rank":100,"cents":2500},{"name":"Tier2","id":"TIER_ID_2","rank":75,"cents":1500},{"name":"Tier3","id":"TIER_ID_3","rank":50,"cents":1000},{"name":"Tier4","id":"TIER_ID_4","rank":25,"cents":300},{"name":"Tier5","id":"TIER_ID_5","rank":0,"cents":0}]'
```

Custom tier names:
```bash
TIER_CONFIG='[{"name":"Captain","id":"123","rank":100},{"name":"Crew","id":"456","rank":50}]'
```

### Initial Setup

1. **Invite the bot to your server** with these permissions:
   - Send Messages
   - Embed Links
   - Use Slash Commands

2. **Enable Privileged Gateway Intents** in the [Discord Developer Portal](https://discord.com/developers/applications):
   - ✅ **Server Members Intent** (required)
   - ✅ Message Content Intent (optional)

3. **Configure tier mappings** using `/admin set-channel`:
   ```
   /admin set-channel tier_name:Tier1 channel:#tier1-alerts
   /admin set-channel tier_name:Tier2 channel:#tier2-alerts
   ```

4. **Test the setup**:
   ```
   /admin status
   /admin test-alert tier_name:Tier1
   ```

## 📚 Admin Commands

All admin commands are restricted to the user specified in `ROOT_ADMIN_ID`.

| Command | Description |
|---------|-------------|
| `/admin status` | Display bot status, config, API latency, and tier accuracy |
| `/admin set-channel <tier> <channel>` | Map a Patreon tier to a Discord channel |
| `/admin set-message <type> <content>` | Customize bot message templates |
| `/admin set-owner <user>` | Transfer bot control to another user |
| `/admin test-alert <tier>` | Send a test alert to verify setup |
| `/admin sync-tiers` | Live-sync tiers from Patreon API |
| `/admin setup` | Interactive tier→channel mapping wizard |
| `/admin bulk-map` | Map all unmapped tiers in a guided sequence |
| `/admin stats` | View patron growth, tier distribution, recent activity |
| `/admin digest [days] [dm_admin]` | Generate and preview the patron community digest on-demand |
| `/admin set-event-channel <event> <channel>` | Route member events to specific channels |
| `/admin debug-logs` | View last 50 X-Ray debug log entries |
| `/admin export-data` | Export patron data as CSV files via DM |
| `/admin poller <action>` | Start, stop, or check the Patreon post poller |
| `/admin server-stats` | Live CPU, memory, uptime, and PM2 monitoring |
| `/admin role-map <action>` | Toggle role sync (on/off/status) and map tiers to Discord roles |
| `/admin dashboard` | Generate a time-limited JWT link to the web analytics dashboard |
| `/admin error-log [severity] [count]` | View recent errors with cause/fix explanations, filter by severity |
| `/link <email_or_name>` | (User command) Link your Discord account to your Patreon membership |

## 🔄 How It Works

### Waterfall Release Strategy

1. **New Content**: When you publish content for Tier1, the bot alerts #tier1-alerts
2. **Tier Update**: When you change access from Tier1 to Tier2, the bot alerts #tier2-alerts
3. **Cascade**: Continue lowering tiers, and each channel gets notified when they gain access

### Tier Detection

The bot uses multiple methods to detect post tiers:

1. **Tier ID Translation**: Converts Patreon tier IDs to tier names using `TIER_CONFIG`
2. **Included Data Lookup**: Searches for tier information in webhook payload
3. **Pledge Amount Fallback**: Uses `min_cents_pledged_to_view` as last resort

### Hybrid Broadcast System

The bot intelligently handles multi-tier post releases:

**BROADCAST Mode** (Multiple Tiers):
- Post released to Diamond + Gold + Silver → All 3 channels get alerts
- Each tier sees their own customized notification
- Perfect for simultaneous multi-tier releases

**STANDARD Mode** (Single Tier):
- Post released to Diamond only → Only #diamond-chat gets alert
- Traditional single-channel notification

**WATERFALL Mode** (Updates):
- Edit post to add lower tiers → Only new tier gets alert
- Prevents spam by only notifying newly-added tiers

**Example:**
```
Day 1: Release to Diamond + Gold
→ Bot sends to #diamond-chat AND #gold-chat (BROADCAST)

Day 7: Edit to add Silver access
→ Bot sends ONLY to #silver-chat (WATERFALL)
```

### Custom Message Templates

Customize all bot messages using the `/admin set-message` command:

**Available Templates:**
- `post_new` - New post notifications
- `post_waterfall` - Waterfall update alerts
- `welcome` - Welcome messages for new patrons
- `win_back` - Farewell DM for departing patrons (placeholders: `{user}`, `{name}`)
- `anniversary` - Pledge anniversary celebrations (placeholders: `{user}`, `{years}`)

**Placeholders:**
- `{tier}` - Tier name (e.g., "Diamond", "Gold")
- `{title}` - Post title
- `{url}` - Post URL
- `{user}` - User mention (for welcome/win-back messages)
- `{post_snippet}` - First 200 chars of post content
- `{pledge_amount}` - Pledge amount (e.g., "$25.00")
- `{patron_count}` - Total patron count
- `{years}` - Anniversary year count

**Example:**
```
/admin set-message type:post_new content:🎉 New {tier} exclusive: {title} - {url}
/admin set-message type:win_back content:Hey {user}, thanks for your support! We'd love to have you back 💙
```

### Member Tracking

- **New Pledge**: Bot logs new members and their tier
- **Upgrade**: Bot detects and celebrates tier upgrades
- **Departure**: Bot logs when members end their pledge

## 🛠️ Development

### Project Structure

```
src/
├── commands/           # Slash command handlers
│   ├── admin/         # Admin-only commands
│   │   ├── handler.ts        # Command router
│   │   ├── set-channel.ts
│   │   ├── set-message.ts
│   │   ├── set-owner.ts
│   │   ├── status.ts
│   │   ├── test-alert.ts
│   │   ├── sync-tiers.ts
│   │   ├── setup.ts          # Interactive mapping wizard
│   │   ├── stats.ts          # Patron analytics
│   │   ├── bulk-map.ts
│   │   ├── set-event-channel.ts
│   │   ├── debug-logs.ts
│   │   ├── export-data.ts
│   │   ├── poller.ts         # Poller toggle command
│   │   ├── server-stats.ts   # Server monitoring
│   │   ├── role-map.ts       # Discord role sync management
│   │   ├── dashboard-cmd.ts  # JWT dashboard link generator
│   │   └── error-log.ts      # Severity-classified error viewer
│   ├── link.ts               # /link — user self-links Discord↔Patreon
│   ├── commandData.ts        # Shared command definitions
│   └── deploy-commands.ts
├── database/          # Database layer (Supabase)
│   ├── db.ts         # Database operations
│   ├── dbCache.ts    # In-memory cache for graceful degradation
│   ├── autoMigrate.ts # Automatic SQL migrations on startup
│   ├── batchWriter.ts # Batched member upserts (5s flush)
│   ├── redis.ts      # Redis connection manager
│   ├── schema.ts     # TypeScript interfaces
│   ├── webhookCache.ts # Webhook audit log + digest queries
│   └── supabase.ts   # Supabase client
├── queue/            # Message queue (BullMQ)
│   ├── webhookQueue.ts  # Queue producer (enqueue events)
│   └── webhookWorker.ts # Queue consumer (process events)
├── middleware/        # Authorization middleware
│   └── adminCheck.ts
├── utils/            # Utility functions
│   ├── anniversaryChecker.ts # Daily pledge anniversary detector
│   ├── chapterFormatter.ts  # Serialized content (Chapter/Part) formatting
│   ├── currencyHelper.ts    # International currency normalization
│   ├── embedBuilder.ts      # Discord embed creation
│   ├── errorHandler.ts      # Error handling
│   ├── formatter.ts         # Message template formatting
│   ├── keywordDetector.ts   # FAQ keyword auto-replies + prefix commands
│   ├── logger.ts            # Logging (console + Discord + error buffer)
│   ├── firstDeploy.ts       # First-deployment welcome DM
│   ├── healthChecks.ts      # Startup intent + webhook health checks
│   ├── roleSync.ts          # Discord role sync engine + reconciliation
│   ├── setupMode.ts         # Auto-capture Discord IDs (!claim)
│   ├── patreonClient.ts     # Axios wrapper with auto token-refresh
│   ├── patreonPoller.ts     # Background tier-change poller
│   ├── testHelpers.ts       # Webhook test utilities
│   ├── tierRanking.ts       # Dynamic tier system
│   └── weeklyDigest.ts      # Weekly patron digest scheduler
├── webhooks/         # Webhook server and handlers
│   ├── handlers/     # Event-specific handlers
│   │   ├── members-create.ts    # + win-back DMs on departure
│   │   ├── members-update.ts
│   │   ├── members-delete.ts
│   │   ├── members-pledge-create.ts
│   │   ├── members-pledge-update.ts
│   │   ├── members-pledge-delete.ts
│   │   ├── posts-publish.ts     # + chapter formatting
│   │   ├── posts-update.ts
│   │   └── posts-delete.ts
│   ├── dashboard.ts  # Chart.js analytics SPA (JWT-gated)
│   ├── router.ts     # Centralized webhook event router
│   ├── server.ts     # Fastify server + OAuth routes + ghost filter
│   ├── wizard.ts     # Cloud setup wizard plugin
│   └── verify.ts     # HMAC signature verification
├── config.ts         # Configuration + tier rank validation
└── index.ts          # Main entry point + startup orchestration
scripts/
├── setup-wizard.ts   # Local HTML setup dashboard (template editor + tier ranker)
├── test-webhook.ts   # HMAC-signed webhook tester (npm run test:webhook)
├── dev-tunnel.ts     # Zero-auth local tunnel (npm run dev:tunnel)
├── fetch-patreon-config.ts  # Auto-fetch tiers + write .env
└── dev-ngrok.ts      # Auto-tunnel for local development
setup-vps.sh          # One-command VPS setup (Caddy + PM2 + Node.js)
.github/
├── ISSUE_TEMPLATE/
│   ├── bug_report.md
│   └── feature_request.md
└── PULL_REQUEST_TEMPLATE.md
```

### Architecture

The bot follows an **early port-binding** architecture to work correctly on cloud platforms:

1. **Redis connection** → Connects to Redis if `REDIS_URL` is configured (optional)
2. **Supabase initialization** → Database connection test
3. **Auto-migrations** → Runs pending SQL migrations from `supabase/migrations/`
4. **Webhook server starts** → Fastify binds to `PORT` immediately (required by Railway/Render)
5. **BullMQ worker starts** → Queue consumer begins processing (if Redis is available)
6. **Discord client login** → Connects to Discord gateway
7. **Ready** → Auto-deploys slash commands, validates OAuth scopes, initializes DB cache, starts batch writer + poller + anniversary checker + weekly digest + role reconciliation

This startup order ensures cloud platforms detect the open port before the Discord gateway connection completes.

**Webhook Processing Pipeline:**
```
Patreon → HMAC Verify → Dedup Guard → Ghost Filter → Webhook Cache (audit log)
  ↓
  Redis available? → BullMQ Queue → Worker → Event Router → Handler
  Redis unavailable? → Direct Processing → Event Router → Handler
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload (nodemon) |
| `npm run dev:ngrok` | Auto-tunnel local dev with ngrok |
| `npm run build` | Compile TypeScript |
| `npm start` | Run production build |
| `npm run deploy-commands` | Register slash commands (also auto-runs on startup) |
| `npm run setup:patreon` | Fetch tiers from Patreon + auto-write `.env` |
| `npm run setup:wizard` | Launch local HTML setup dashboard on port 3456 |
| `npm run test:webhook` | Send HMAC-signed mock webhook to test your endpoint |
| `npm test` | Run tests |
| `npm run verify` | Run deployment verification script |

## 🚢 Deployment

### ⚠️ Important: Hosting Compatibility

> **Render.com free tier does NOT work for Discord bots.** Render's free tier uses shared IP addresses that are rate-limited by Discord's Cloudflare protection (HTTP 429, error code 1015). The bot's gateway connection will hang indefinitely. Use Railway, a paid Render plan, or another platform instead.

### Railway (Recommended)

One-click deploy — click the button below or follow the manual steps.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.app/new/template/disbot?referralCode=nLfB6T)

**Manual steps:**
1. Go to [railway.app](https://railway.app) → Sign in with GitHub
2. **New Project** → **Deploy from GitHub repo** → select your repo
3. Add environment variables in the **Variables** tab
4. Railway auto-detects the `railway.json` config and deploys
5. Generate a domain in **Settings** → **Networking**
6. Update your Patreon webhook URL to `https://your-app.up.railway.app/webhooks/patreon`

**Why Railway?**
- ✅ Automatic HTTPS with free SSL
- ✅ No shared IP rate-limiting issues with Discord
- ✅ $5 free credit/month
- ✅ Fast deploys (~2-3 minutes)
- ✅ Auto-deploy from GitHub pushes

See [DEPLOYMENT.md](DEPLOYMENT.md) for all deployment options.

### Docker Compose (Self-Hosted)

Run everything locally or on your own VPS — **no Supabase Cloud account required**.

Docker Compose bundles PostgreSQL, PostgREST (REST API), and the bot together:

```bash
# 1. Configure
cp .env.example .env        # fill in Discord/Patreon credentials

# 2. Start all services
docker compose up -d

# 3. Register slash commands
docker compose exec bot npm run deploy-commands
```

The database is automatically initialized with all required tables on first start (`docker/init.sql`).

> **Note**: When using Docker Compose, `SUPABASE_URL` and `SUPABASE_KEY` are automatically overridden to point at the local PostgREST instance — you don't need a Supabase Cloud account.

### Docker Only (Bring Your Own Database)

If you already have a Supabase project or external PostgreSQL + PostgREST:

```bash
docker build -t patreon-bot .
docker run -d --env-file .env patreon-bot
```

The Dockerfile uses a multi-stage build with Node.js 20 Alpine for a lean production image.

## 🔐 Security

- **User ID Whitelisting**: Only the root admin can execute admin commands
- **Webhook Verification**: All Patreon webhooks are verified using HMAC signatures
- **Environment Variables**: Sensitive data stored in `.env` (never committed)
- **Supabase RLS**: Row-level security policies protect database access

## ❓ Frequently Asked Questions

### 🛡️ Privacy & Transparency

**Q: Is this bot completely transparent? How do I know it's safe?**

A: Yes. This project is released under the MIT License, which is a permissive open-source license. This means the entire codebase—from the database logic to the webhook handlers—is fully visible and free for you to audit. Nothing is obfuscated or hidden in compiled binaries; what you see in the `src/` folder is exactly what runs on your server.

**Q: Does the bot collect my data or send it to the developer?**

A: No. This is a strictly self-hosted solution.
- **Data Flow**: The bot acts as a direct bridge between your Patreon and your Discord. Data flows from Patreon's webhooks directly to your hosted instance.
- **Storage**: All data, including channel mappings and member tracking, is stored in your Supabase database (PostgreSQL). No data is ever transmitted to the bot creator or any third-party analytics services.

**Q: How is my Patreon data secured?**

A: Security is handled through multiple layers:
1. **Environment Variables**: Sensitive credentials (like your `DISCORD_TOKEN` and `PATREON_ACCESS_TOKEN`) are stored in a `.env` file or your cloud provider's secure environment dashboard. They are never hardcoded into the source code.
2. **Webhook Verification**: The bot uses your `WEBHOOK_SECRET` to verify an HMAC signature on every request. This ensures the bot only accepts data that genuinely comes from Patreon.
3. **Supabase RLS**: Row-level security policies protect your database from unauthorized access.

> ⚠️ **Git History Warning**: If any secret (Discord token, Patreon credentials, Supabase key, webhook secret, database password) was **ever** committed to this repository — even if it has since been removed — the old value is still recoverable from `git log`. You **must** rotate (regenerate) any such credential immediately:
> - **Discord Bot Token**: Discord Developer Portal → Bot → Reset Token
> - **Patreon Client Secret / Access Token**: Patreon Developer Portal → Reset or re-authorize via `/oauth/start`
> - **Supabase Keys**: Supabase Dashboard → Settings → API → Regenerate keys
> - **Webhook Secret**: Generate a new one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
> - **Database Passwords**: Change via your hosting provider's dashboard
>
> Old credentials in git history can be exploited even after removal from the working tree.

### ⚙️ Configuration & Tiers

**Q: Is this bot hardcoded for specific tiers like "Diamond" or "Gold"?**

A: No. While the default examples use these names, the system is 100% configuration-driven. You define your own tier hierarchy using a standard JSON format in your environment variables (`TIER_CONFIG`). Whether you have 2 tiers or 20, and whatever you choose to name them, the bot adapts automatically without requiring code changes.

**Q: How does the bot know which tier is which?**

A: It uses a smart "Waterfall" logic with three layers of detection to ensure notifications never fail:
1. **ID Match (Primary)**: It checks the unique Tier ID from Patreon using the `tierIdMap`.
2. **Price Fallback (Secondary)**: If the ID is missing, it checks the `min_cents_pledged_to_view` (e.g., 2500 cents = $25.00) using the `centsMap`.
3. **Title Match (Legacy)**: As a last resort, it attempts to match the tier title text from the `included` data.

**Q: What happens when I update a post (e.g., from "Diamond" to "Gold")?**

A: The bot detects the update and calculates the **lowest** tier that now has access (widest audience). For example, if a post was Diamond-only and you add Gold access, the bot identifies Gold as the new audience and sends the waterfall alert specifically to the Gold channel. This is the core "waterfall" feature.

**💡 Pro Tip: The "Invisible Space" Trick**

Sometimes, when you only change the "Who can access this post?" settings (e.g., checking the box for Gold), Patreon's website may not immediately trigger the `posts:update` webhook. If the webhook isn't sent, the bot cannot detect the change.

**To force the update without altering your content:**
1. Open the Post: Go to the edit screen of your existing post
2. Change Access: Check the box for the new lower tier (e.g., Gold)
3. **The Trick**: Click inside your Post Title and add a single space at the very end
4. Click Update/Publish

**Why this works**: To your readers, "My Post Title" and "My Post Title " look exactly the same—the browser renders them identically. However, Patreon's server sees a difference in the text string. This forces Patreon to mark the post as "modified" and immediately send the `posts:update` signal to your bot, triggering the waterfall logic.

### ☁️ Deployment

**Q: Which hosting platform should I use?**

A: **Railway** is recommended. Here's why:

| Platform | Discord Compatible | Free Tier | HTTPS | Notes |
|----------|-------------------|-----------|-------|-------|
| **Railway** | ✅ Yes | $5 credit/mo | ✅ Auto | **Recommended** |
| **Render (Paid)** | ✅ Yes | ❌ $7/mo+ | ✅ Auto | Works on paid plans |
| **Render (Free)** | ❌ **No** | Free | ✅ Auto | ⚠️ Shared IPs are blocked by Discord |
| **Heroku** | ✅ Yes | 550-1000h | ✅ Auto | Requires credit card |
| **VPS** | ✅ Yes | Varies | Manual | Full control |
| **Local + ngrok** | ✅ Yes | Limited | ✅ Auto | Development only |

> ⚠️ **Render's free tier does NOT work** — Discord/Cloudflare rate-limits the shared IP addresses (HTTP 429, error 1015), causing the bot's gateway connection to hang indefinitely.

**Q: What do I need to get started?**

A: You need:
- Node.js 20+
- A Discord Bot Token ([Create one here](https://discord.com/developers/applications))
- A Patreon Creator account with OAuth app
- A Supabase account (free tier available)
- A server with HTTPS support for webhooks (Railway, VPS, etc.)

See [SETUP.md](SETUP.md) for detailed setup instructions.

## 🆕 Recent Updates

### Latest (Aug 2026 — Architectural Hardening & Reliability Pass)
- 🔒 **Setup Mode Hijacking Prevention**: Setup wizard generates a secure, one-time `SETUP_TOKEN` printed to the server console when `DISCORD_TOKEN` is unset; setup is locked once completed
- 🛡️ **Tier Rank-Inversion Guard & Safe Waterfall**: Config validator fails fast with `process.exit(1)` on rank inversions; added `getWidestAudienceTier()` ensuring lowest access cost selection without leaking premium content
- 🗄️ **Multi-Tier Deduplication (Redis + DB + Memory)**: Redis `SETNX` (60s TTL) with database query fallback (migration `015` with `dedup_hash`) and local memory fallback; direct webhook processor includes 3x retry with exponential backoff
- 🚨 **Proactive Patreon Token Revocation Alerting**: Automatically detects `invalid_grant` / revoked OAuth tokens and alerts Root Admin via Discord embed with 1-click `/oauth/start` authorization link
- 🔁 **Configurable Replay Batches & Legacy Post Hydration**: `/admin replay-webhook` supports `limit` (1–50) with 300ms pacing and queries `tracked_posts` to restore missing/redacted URLs on legacy post events
- ⚠️ **Stale Build Prevention & Prestart Automation**: Auto-runs `prestart: npm run build`; boot sequence verifies compilation freshness and warns on stale `dist/` builds
- 🔍 **Secrets Scanner**: Added `npm run check:secrets` pre-commit script to detect and prevent committed credentials
- 🌐 **Expanded Localization**: Full i18n support for `en`, `es`, `de`, `fr`, `ja`, `zh-CN`, and `ru` with automatic key-level fallback to English
- 💾 **DB-Persisted Diagnostics & Error Buffers**: Error ring buffers (`error_log_<id>`) and diagnostic counters persist to `bot_config` and flush synchronously on `SIGINT`/`SIGTERM` shutdowns
- 🔑 **32-Bit Overflow Proof Token Polling**: Hourly polling timer checks database `patreon_token_refreshed_at` to avoid 32-bit `setInterval` integer clamping, providing reliable 25-day token refreshes
- ⚡ **Rate-Limit Safe Command Deployment**: Auto-deploy fingerprints command schemas via MD5 hash to skip redundant Discord API registration on restarts
- 🔄 **Multi-Node Cache Invalidation**: `/admin sync-tiers` synchronizes in-memory tier maps across all cluster nodes via dual-channel invalidation: Redis pub/sub (`disbot:cache:invalidate`) and native Supabase Realtime WebSockets (`postgres_changes`) for non-Redis environments
- 🎯 **Targeted Replay with Discord ID**: Migration `014` captures `discord_user_id` pre-redaction; `/admin replay-webhook` re-hydrates Discord IDs for win-back DMs
- 🗃️ **SQLite Schema Auto-Upgrades**: SQLite adapter auto-applies missing columns (`member_name`, `discord_user_id`, `dedup_hash`, `is_active`) on initialization
- ⏱️ **Ephemeral Scheduler Persistence**: Weekly digest and anniversary checkers persist run states to `bot_config` to avoid missed or repeated schedules across container recycles
- 🩹 **Member Lifecycle Fixes**: Fixed join/rejoin announcements for paid members; added `is_active` tracking (migration `013`), cross-handler welcome guards, and fallback upgrade channels
- 📊 **Paid Joined Section in Weekly Digest**: Added dedicated `✨ Paid Joined (N)` embed and metric field in Sunday digests listing paying patrons and tier names
- 🛡️ **Multi-Layer Patron Extraction in Pledge Webhooks**: Fixed false `No patron data in pledge:delete webhook` warnings by supporting Patreon v2 `relationships.user`, `relationships.patron`, `payload.data`, and database fallbacks
- ⚡ **Instant Zero-Delay Healthcheck**: Webhook server starts immediately (<50ms) on boot so Railway, Render, and Docker `/health` health checks pass on Attempt #1 while database and Discord connections initialize in the background

### Previous Releases

> 📜 The full history — Jun 2026 (weekly digest, BullMQ, role sync, dashboard), Mar 2026 (OAuth, win-back DMs, SQLite fallback, setup wizard), Feb 2026 (Railway, threads, bulk mapping), and the initial core-features release — now lives in **[CHANGELOG.md](CHANGELOG.md)**.

---

## 🖼️ Visual Documentation

<details>
<summary><strong>📐 Architecture & Stack</strong></summary>

<p align="center">
  <img src="screenshots/6.jpg" alt="Built on a Modern Stack — Node.js 20+, RLS, Supabase" width="100%" />
</p>

</details>

<details>
<summary><strong>🎯 Intelligent Tier Detection</strong></summary>

<p align="center">
  <img src="screenshots/7.jpg" alt="3-Step Tier Detection Funnel — ID Match → Pledge Amount → Title Match" width="100%" />
</p>

</details>

<details>
<summary><strong>🔒 Zero-Trust Security Model</strong></summary>

<p align="center">
  <img src="screenshots/8.jpg" alt="HMAC Verification, Data Sovereignty, Row-Level Security" width="100%" />
</p>

</details>

<details>
<summary><strong>🖥️ In-Chat Administration</strong></summary>

<p align="center">
  <img src="screenshots/12.jpg" alt="Admin commands in Discord — set-channel, set-message, status" width="100%" />
</p>

</details>

<details>
<summary><strong>⚙️ Automated Configuration</strong></summary>

<p align="center">
  <img src="screenshots/10.jpg" alt="npm run setup:patreon — auto-generates TIER_CONFIG and writes to Supabase" width="100%" />
</p>

</details>

<details>
<summary><strong>🏠 Hosting Strategy</strong></summary>

<p align="center">
  <img src="screenshots/9.jpg" alt="Railway (Recommended) vs Render Free Tier (Avoid)" width="100%" />
</p>



</details>

<details>
<summary><strong>🚀 Deployment Roadmap</strong></summary>

<p align="center">
  <img src="screenshots/11.jpg" alt="4-Step Roadmap — Clone, Fetch Config, Deploy, Connect" width="100%" />
</p>

</details>

<details>
<summary><strong>💡 Pro Tip: The Invisible Space Trick</strong></summary>

<p align="center">
  <img src="screenshots/13.jpg" alt="Add a space to trick Patreon into sending a webhook for tier-only changes" width="100%" />
</p>

</details>



## 📝 License

MIT

## 🤝 Support

For issues or questions, please open an issue on GitHub.

## 🙏 Acknowledgments

Built with ❤️ for Patreon creators who want to automate their content distribution workflow.

## 👨‍💻 Made By

**Iqbal Khan**  
[![GitHub](https://img.shields.io/badge/GitHub-Profile-black?style=flat&logo=github)](https://github.com/IqbalZarar-Khan) [![Patreon](https://img.shields.io/badge/Patreon-Support-red?style=flat&logo=patreon)](https://www.patreon.com/Fallen_Archangel_)

> I, being a fanfiction translator, wanted to start a Discord Server but was too lazy to handle new chapter releases and updates on Discord for every new chapter and updated chapter. I created this bot to not only do my job but also that of many Patreon Creators.
