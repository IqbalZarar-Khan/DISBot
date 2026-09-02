# Changelog

All notable changes to DISBot, newest first. For setup, features, and deployment docs see the
[README](README.md) — the most recent release is also summarized there under
[Recent Updates](README.md#-recent-updates).

## Aug 2026 (Part 2 — Architectural Hardening & Reliability Pass)

- 🗄️ **Batch Writer `is_active` Constraint & Retry Loop Fix** (`batchWriter.ts`, `members-pledge-delete.ts`, `members-pledge-update.ts`, `members-update.ts`, `db.ts`): Sanitized all queued member records so `is_active` is guaranteed to be a boolean, preventing PostgREST null padding that violated PostgreSQL's `NOT NULL` constraint; bounded flush attempts (`MAX_RETRIES = 3`) with individual member recovery fallbacks to permanently eliminate 5-second infinite error alert loops
- ⚡ **Instant Zero-Delay Healthcheck Readiness** (`src/index.ts`): Moved `startWebhookServer()` to start first before database connections, auto-migrations, Redis, and Discord gateway logins, ensuring Fastify binds immediately (<50ms) to pass Railway/Render/Docker `/health` health checks on Attempt #1 without timeouts
- 📊 **On-Demand Community Digest Command** (`src/commands/admin/digest.ts`, `commandData.ts`): Added `/admin digest [days] [dm_admin]` to generate and view community summaries (with Paid Joined, Cancellations, and Tier Changes) at any time before Sunday, with optional custom lookback windows (1–30 days) and direct DM forwarding
- 📊 **Paid Joined Section in Weekly Digest** (`weeklyDigest.ts`, `webhookCache.ts`): Weekly Sunday community digest now includes a dedicated `✨ Paid Joined (N)` embed and metric field detailing paying member names and tier titles (correlating `tracked_members` and `members:pledge:create` webhook logs) alongside cancellations and tier changes
- 🛡️ **Multi-Layer Patron Extraction in Pledge Webhooks** (`members-pledge-delete.ts`, `members-pledge-update.ts`, `webhookCache.ts`): Resolved `No patron data in pledge:delete webhook` warning by inspecting `relationships.user`, `relationships.patron`, `payload.data`, and `included[]` with database fallbacks
- 🔒 **Setup Mode Hijacking Prevention** (`wizard.ts`): Setup wizard generates a secure, one-time `SETUP_TOKEN` printed to the server console when `DISCORD_TOKEN` is unset, preventing unauthorized credential injection or deployment hijacking on public domains; rejects setup requests once completed unless `ALLOW_WIZARD_RECONFIG=true`
- 🛡️ **Fatal Tier Rank-Inversion & Safe Waterfall Audience Selection** (`config.ts`, `tierRanking.ts`, `posts-update.ts`): Config validator fails fast with `process.exit(1)` on rank inversions; added `getWidestAudienceTier()` to guarantee lowest access cost selection without leaking premium content
- 🗄️ **Multi-Tier Deduplication (Redis + DB + Memory)** (`webhookFilters.ts`, `webhookCache.ts`, migration `015`): Added `dedup_hash` column and cross-instance database-level deduplication query fallback in `isDuplicateAsync()` for multi-node deployments without Redis
- 🚨 **Proactive Patreon Token Revocation Alerting** (`patreonClient.ts`): Automatically catches `invalid_grant` / revoked OAuth token errors and sends an urgent Discord alert embed to `LOG_CHANNEL_ID` and Root Admin DM with 1-click `/oauth/start` authorization link
- 🔁 **Configurable Replay Batches & Legacy Post Hydration** (`replay-webhook.ts`, `commandData.ts`): Added configurable `limit` parameter (1–50) with 300ms inter-message API pacing; `hydrateRedactedPayload()` looks up `tracked_posts` to restore URLs and titles on legacy redacted post events
- ⚠️ **Stale Build Warning & Auto-Build Prestart** (`package.json`, `index.ts`): Added `"prestart": "npm run build"` to ensure production `dist/` is always up to date; startup sequence checks `src/index.ts` mtime vs `dist/index.js` and warns if stale
- 🔍 **Pre-commit Secrets Scanner** (`scripts/check-secrets.ts`, `package.json`): Added `npm run check:secrets` scanner to detect and prevent accidental token/secret commits in Git history
- 🌐 **Comprehensive Localization Expansion** (`src/locales/`, `i18n.ts`): Added full locale dictionaries for Spanish (`es`), German (`de`), French (`fr`), Japanese (`ja`), Simplified Chinese (`zh-CN`), and Russian (`ru`), with automatic key-level fallback to English
- 💾 **DB-Persisted Diagnostics & Error Buffers** (`logger.ts`, `status.ts`, `index.ts`): Error ring buffer (`error_log_<id>`) and debounced diagnostic counters (`diag_tier_detect_*`, `diag_last_webhook_at`) now persist to `bot_config` and flush synchronously during `SIGINT`/`SIGTERM` process terminations
- 🔑 **32-Bit Overflow Proof Token Polling** (`patreonClient.ts`): Hourly polling timer checks database `patreon_token_refreshed_at` to avoid 32-bit `setInterval` integer clamping, providing reliable 25-day token refreshes
- ⚡ **Rate-Limit Safe Slash Command Deployment** (`index.ts`): Auto-deploy calculates an MD5 fingerprint of command schemas and skips deployment if `command_definition_hash` in `bot_config` matches, eliminating Discord API 429 rate limits on container recycles
- 🔄 **Dual-Channel Multi-Node Cache Invalidation** (`dbCache.ts`, `sync-tiers.ts`): Added Redis pub/sub (`disbot:cache:invalidate`) and native Supabase Realtime WebSocket listeners (`postgres_changes` on `tier_mappings`/`bot_config`); `/admin sync-tiers` synchronizes in-memory tier maps and rankings across all cluster nodes instantly, with or without Redis
- 🎯 **Targeted Replay with Discord ID** (`webhookCache.ts`, `replay-webhook.ts`, migration `014`): Captured `discord_user_id` pre-redaction into `webhook_log.discord_user_id`; `hydrateRedactedPayload()` re-injects Discord IDs on replay to restore win-back DM capabilities
- 🗃️ **SQLite Schema Auto-Upgrades** (`sqliteAdapter.ts`): Embedded SQLite adapter auto-applies missing columns (`member_name`, `discord_user_id`, `dedup_hash`, `is_active`) on initialization via `ALTER TABLE` checks
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
