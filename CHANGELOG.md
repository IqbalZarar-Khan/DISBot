# Changelog

All notable changes to DISBot, newest first. For setup, features, and deployment docs see the
[README](README.md) — the most recent release is also summarized there under
[Recent Updates](README.md#-recent-updates).

## Aug 2026 (Part 2 — Architectural Hardening & Reliability Pass)

- 🔒 **Setup Mode Hijacking Prevention** (`wizard.ts`): Setup wizard generates a secure, one-time `SETUP_TOKEN` printed to the server console when `DISCORD_TOKEN` is unset, preventing unauthorized credential injection or deployment hijacking on public domains
- 🛡️ **Fatal Tier Rank-Inversion Guard** (`config.ts`): Config validator fails fast with `process.exit(1)` when cheaper tiers outrank expensive tiers, preventing accidental premium content distribution (`ALLOW_RANK_INVERSION=true` escape hatch provided)
- 🗄️ **Distributed Deduplication** (`webhookFilters.ts`, `server.ts`): Added `isDuplicateAsync()` using Redis `SETNX` (60s TTL) for cross-instance deduplication coordination, with in-memory map fallback when Redis is offline; direct webhook execution now features 3x exponential retry backoff
- 💾 **DB-Persisted Diagnostics & Error Buffers** (`logger.ts`, `status.ts`, `index.ts`): Error ring buffer (`error_log_<id>`) and debounced diagnostic counters (`diag_tier_detect_*`, `diag_last_webhook_at`) now persist to `bot_config` and flush synchronously during `SIGINT`/`SIGTERM` process terminations
- 🔑 **Proactive Patreon Token Refresh** (`patreonClient.ts`): Background scheduler runs every 25 days and on boot to proactively refresh Patreon OAuth tokens, preventing phantom 401s on idle deployments
- ⚡ **Rate-Limit Safe Slash Command Deployment** (`index.ts`): Auto-deploy calculates an MD5 fingerprint of command schemas and skips deployment if `command_definition_hash` in `bot_config` matches, eliminating Discord API 429 rate limits on container recycles
- 🔄 **Cluster Cache Invalidation** (`dbCache.ts`, `sync-tiers.ts`): Added Redis pub/sub invalidation channel (`disbot:cache:invalidate`); `/admin sync-tiers` broadcasts invalidation signals to instantly refresh in-memory caches across all cluster nodes
- 🎯 **Targeted Replay with Discord ID** (`webhookCache.ts`, `replay-webhook.ts`, migration `014`): Captured `discord_user_id` pre-redaction into `webhook_log.discord_user_id`; `hydrateRedactedNames()` re-injects Discord IDs on replay to restore win-back DM capabilities
- 🗃️ **SQLite Schema Auto-Upgrades** (`sqliteAdapter.ts`): Embedded SQLite adapter auto-applies missing columns (`member_name`, `discord_user_id`, `is_active`) on initialization via `ALTER TABLE` checks
- ⏱️ **Ephemeral Scheduler Persistence** (`weeklyDigest.ts`, `anniversaryChecker.ts`): Weekly digest and anniversary checkers persist run states (`last_digest_week`, `last_anniversary_check_date`) to `bot_config` to eliminate missed/repeated schedules on ephemeral hosting
- 🧹 **Ledger Noise Reduction** (`router.ts`, `webhookCache.ts`): Unhandled events are tagged with `[UNSUPPORTED]` notes and filtered out from `getMissedAnnouncements()`
- 🛡️ **Race Condition Prevention** (`batchWriter.ts`): Added timestamp guards in `queueMemberUpsert()` to ensure only newer data overwrites buffered member records during rapid webhook bursts
- 🔍 **Auto-Migration Verification** (`autoMigrate.ts`): Added post-migration schema integrity checks for `webhook_log` and `tracked_members` tables
- ⚠️ **Unawaited Promise Fixes** (`set-owner.ts`, `anniversaryChecker.ts`, `weeklyDigest.ts`): Added `await` to `setConfig` in `set-owner.ts` and wrapped interval/timeout callbacks in `.catch()` error loggers

## Aug 2026 (Part 1 — Member Lifecycle & Welcome Announcements)

- 🩹 **Fix: paid-member joins & rejoins not announced**: `members:create` now resolves tiers via `tierIdMap` when missing from `included[]` (paid joins were misreported as "Free"), and welcomes members whose row was kept after departure
- 🎉 **Welcome-Back announcements**: departed members are flagged `is_active=false` (new migration `013`); rejoining — even directly as paid or at their old tier — now announces "🎉 Welcome Back!" instead of silence
- 🔁 **Cross-handler welcome guard** (`welcomeGuard.ts`): in-memory dedup so the near-simultaneous `members:create` + `members:pledge:create` webhooks can't double-welcome during the 5s batch-write window
- 📈 **Upgrades never silently dropped**: `getEventChannel` now falls back event channel → `LOG_CHANNEL_ID` → the `member_join` channel, so free→paid upgrades are announced even without a dedicated `pledge_upgrade` channel
- 🛡️ **Rejoin vs upgrade disambiguation**: `members:update` / `members:pledge:update` announce departed members as 🎉 Welcome Back — never as an upgrade notice — deduped by the welcome guard; `members:update` syncs `is_active` from `patron_status`
- 📖 Wiki: `Webhook-Pipeline.md` semantics table updated to match the welcome-all-tiers + returning-member behavior
- ⚠️ **Deploy note**: the bug persisted partly because local `dist/` was six months stale (built Feb 17) — the running bot predated the Aug 20 welcome fix. Migration `013` applies automatically on startup, but deployments **must rebuild** (`npm run build`) before `pm2 restart disbot`; Docker/Railway/Render builds are unaffected

## Jun 2026

- ✅ **📊 Enhanced Weekly Digest**: Sunday report now includes cancellation details (who cancelled + count) and membership changes (who changed + old→new tier)
- ✅ **📋 Webhook Event Cache**: Every verified webhook persisted to `webhook_log` for audit trail, missed-announcement recovery, and weekly digest data
- ✅ **🚨 `/admin error-log`**: In-Discord error viewer with severity classification (low/medium/high/critical), cause/fix explanations, and filter by severity
- ✅ **⚡ Fastify Migration**: Express replaced with Fastify for 2–3× webhook throughput and lower CPU overhead
- ✅ **📬 BullMQ + Redis Queue**: Webhook events enqueued via BullMQ for controlled concurrency with 3 retries + exponential backoff; auto-fallback to direct processing when Redis is unavailable
- ✅ **🗄️ Redis-Backed Caching**: Centralized cache layer supporting horizontal scaling across multiple bot instances
- ✅ **📝 Batched DB Writes**: Member upserts buffered in memory and flushed every 5 seconds to reduce Supabase query volume
- ✅ **🔄 Automated Discord Role Sync**: `/admin role-map` maps Patreon tiers to Discord roles; auto-grants/revokes on pledge create, update, delete, and departure events
- ✅ **🔗 `/link` Command**: Members self-link their Discord account to Patreon via email, name, or member ID — enables role sync
- ✅ **📊 Web Analytics Dashboard**: JWT-gated Chart.js SPA served at `/dashboard` — patron growth (30-day), tier distribution donut chart, recent activity table; link generated via `/admin dashboard` (expires 1hr)
- ✅ **🔀 Centralized Event Router**: Webhook routing extracted into `router.ts` for reuse by both Fastify (direct) and BullMQ worker (queued)
- ✅ **🔁 Startup Role Reconciliation**: On boot, compares all tracked members against actual Discord roles and fixes any drift that occurred while offline
- ✅ **👥 Robust Tier Resolution**: Dashboard and stats now resolve tier names from both `tier_mappings` and `role_mappings` tables
- ✅ **🧹 Legacy Handler Cleanup**: Removed deprecated legacy `pledges:*` handlers — v2 webhook events only
- ✅ **🔍 Diff Engine Free Tier Drops**: Piggyback diff engine detects silent free-tier changes not triggered by webhooks
- ✅ **🩹 Numerous Bug Fixes**: Triple welcome messages, broken upgrade detection, dashboard adblocker interference, PUBLIC_URL trailing slash, Patreon API null state handling

## Mar 2026

- ✅ **🔐 OAuth Token Exchange Route**: Built-in `/oauth/start` + `/oauth/redirect` — no curl/Postman needed
- ✅ **🔄 Auto Token Refresh**: `patreonClient.ts` automatically refreshes expired tokens on 401 errors
- ✅ **🌍 Currency-Aware Pledges**: Normalizes international currencies (EUR, GBP, etc.) to USD cents
- ✅ **🏗️ Auto DB Migrations**: Runs SQL migrations from `supabase/migrations/` automatically on startup
- ✅ **⚠️ Tier Rank Validation**: Warns if cheaper tiers outrank expensive ones in TIER_CONFIG
- ✅ **👻 Ghost Webhook Filter**: Discards duplicate webhooks with no meaningful state change
- ✅ **🔄 Poller Toggle**: `/admin poller start|stop|status` to manage background polling
- ✅ **💌 Win-Back DMs**: Auto-DMs departing patrons with customizable farewell template
- ✅ **🎂 Anniversary Celebrations**: Daily checker for 1yr/2yr pledge milestones
- ✅ **📊 Weekly Digest**: Sunday DM to admin with the week's patron activity summary
- ✅ **🗄️ In-Memory DB Cache**: Graceful degradation if Supabase goes offline
- ✅ **📖 Chapter Formatting**: Auto-detects "Chapter/Part/Episode N" → spoiler-tagged embeds
- ✅ **🖥️ Server Monitoring**: `/admin server-stats` shows CPU, memory, uptime, PM2 info
- ✅ **🧙 Setup Wizard GUI**: `npm run setup:wizard` → local HTML dashboard for first-time setup
- ✅ **🔬 OAuth Scope Validation**: Verifies token scopes on startup, warns if missing
- ✅ **📝 Enhanced setup:patreon**: Auto-writes TIER_CONFIG + WEBHOOK_SECRET to `.env` file
- ✅ **📋 GitHub Templates**: Bug report, feature request, and PR templates in `.github/`
- ✅ **🛡️ Proactive Fallback Warnings**: DMs admin when tier detection uses cents/title fallback
- ✅ **🔑 Keyword Detection**: Auto-replies to FAQ keywords + `!status`/`!help` prefix commands
- ✅ **🧪 HMAC Webhook Tester**: `npm run test:webhook` — mock payloads with valid signatures
- ✅ **🚀 VPS Setup Script**: `setup-vps.sh` — one-command Caddy + PM2 + SSL provisioning
- ✅ **🐳 Self-Contained Docker**: Full stack with PostgreSQL + PostgREST (no Supabase Cloud)
- ✅ **📡 Automated Webhook Creation**: Setup wizard creates Patreon webhooks via API with all 9 triggers
- ✅ **🎩 Discord Setup in Wizard**: Interactive checklist with auto-generated invite URL
- ✅ **💾 SQLite Fallback**: Zero-config embedded database when Supabase isn't configured
- ✅ **🩺 Startup Health Checks**: Verifies Server Members Intent + webhook registration on boot
- ✅ **🚀 1-Click Railway Deploy**: Deploy button auto-provisions the app with env var form
- ✅ **📝 Visual Template Editor**: Drag-and-drop message template builder with live preview
- ✅ **🔨 Auto-Capture Discord IDs**: `!claim` command captures Guild/Admin/Channel IDs (no Developer Mode)
- ✅ **🎯 Drag-and-Drop Tier Ranker**: Visual tier priority editor in wizard
- ✅ **🚇 Zero-Auth Local Tunnels**: `npm run dev:tunnel` replaces ngrok (no sign-up needed)
- ✅ **🎉 First-Deploy Welcome DM**: Interactive onboarding DM on first successful deployment

## Feb 2026

- ✅ Railway Deployment (recommended), Node.js 20, Dockerfile upgrade, Early Port Binding
- ✅ Discord Thread Integration, Strict RLS Policies, Enhanced Status Diagnostics
- ✅ Bulk Channel Mapping, In-Discord Debug Logs, Data Export, Template Preview
- ✅ Granular Event Routing, Legacy Webhook Support, Auto-Ngrok Updater

## Initial Release — Core Features

- ✅ Hybrid Broadcast System, Custom Message Templates, Silent Post Deletion
- ✅ Automated Patreon Setup, X-Ray Debug Logging, Edit and Republish Fix
- ✅ Dynamic Tier Configuration, Tier ID Translation, Supabase Integration, Fallback Mechanisms
