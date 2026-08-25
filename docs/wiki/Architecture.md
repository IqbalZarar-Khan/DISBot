# Architecture

DISBot is a single Node process that runs three things at once: a Discord gateway client
(discord.js), an HTTP webhook server (Fastify), and background schedulers. Optional Redis/BullMQ
moves webhook processing into a worker for horizontal scaling.

## Boot Sequence (`src/index.ts`)

Order matters — the HTTP port binds **before** the Discord gateway connects so cloud platforms
(Railway/Render) detect a healthy port during Discord's slow login:

1. **Config** — `src/config.ts` loads env via dotenv, parses/validates `TIER_CONFIG`.
   Validates rank order (fatal error on rank inversion unless `ALLOW_RANK_INVERSION=true`).
   If core config is missing, `_isSetupMode` is set and only the web server + cloud Setup
   Wizard (`/setup`, protected by a one-time console token) start.
2. **Database** — `initSupabase()` → `autoMigrate()` runs any unapplied SQL from
   `supabase/migrations/` (migrations 000–014) and verifies post-migration schema integrity → connection test.
3. **Redis (optional)** — `initRedis()`; if it connects, `initWebhookQueue()` creates the
   BullMQ queue. Failure is non-fatal: the bot falls back to direct processing with 3x retry.
4. **Batch writer** — `startBatchWriter()` buffers member upserts with timestamp guards into 5s-flushed writes.
5. **Fastify server** — `startWebhookServer()` binds the port, mounts `/setup` wizard (token-gated) and
   `/dashboard`, starts the webhook-filter cleanup interval.
6. **Discord login** — `loginWithRetry()` with exponential backoff (handles Cloudflare-blocked IPs).
7. **On `ClientReady`** — starts the BullMQ worker, auto-deploys slash commands (fingerprinted via MD5 hash to prevent Discord API rate-limiting on restarts), initializes the DB cache (with Redis pub/sub invalidation), loads persisted diagnostic counters & error logs, validates Patreon OAuth scopes, starts the 25-day proactive token refresh scheduler, and starts schedulers: anniversary checker (persisted check dates), weekly digest (persisted week tracking), keyword detector, health checks, setup-mode `!claim`, first-deploy DM. If `DISCORD_ROLE_SYNC_ENABLED`, runs initial role reconciliation.
8. **Shutdown Lifecycle** — `SIGINT` and `SIGTERM` handlers flush diagnostic counters, flush member batch writers, stop proactive refresh, close queues, and disconnect Redis cleanly.

## Components

```
                 ┌────────────────────────────────────────────────┐
 Patreon ───────▶│ Fastify (src/webhooks/server.ts)               │
 webhooks        │  verify → logWebhookReceived → dedup/ghost     │
                 └───────┬───────────────────────────┬────────────┘
                         │ Redis up                  │ Redis down
                         ▼                           ▼
                 ┌───────────────┐          ┌────────────────┐
                 │ BullMQ queue  │          │ direct process  │
                 │ (src/queue/)  │          │ (3x retries)   │
                 └───────┬───────┘          └────────┬───────┘
                         ▼                           ▼
                 ┌────────────────────────────────────────────┐
                 │ Router (src/webhooks/router.ts)            │
                 │  switch(eventType) → 9 handlers            │
                 │  → markWebhookProcessed(logId, announced)  │
                 └───────┬────────────────────────────────────┘
                         ▼
                 ┌────────────────────────────────────────────┐
                 │ discord.js client (announces, DMs, roles)  │
                 └────────────────────────────────────────────┘
```

### Module responsibilities

| Module | Responsibility |
|---|---|
| `src/webhooks/server.ts` | HTTP endpoints: `/webhooks/patreon`, `/health`, `/metrics`, `/oauth/*`, wizard, dashboard |
| `src/webhooks/webhookFilters.ts` | Async Redis `SETNX` dedup (60s) + local memory fallback + ghost-event filter (5min) |
| `src/webhooks/router.ts` | Event dispatch; exports `SUPPORTED_WEBHOOK_EVENTS`; tags `[UNSUPPORTED]` events; marks `webhook_log` rows |
| `src/webhooks/handlers/` | One file per Patreon event (`members-*`, `posts-*`) |
| `src/commands/` | `commandData.ts` definitions + `admin/handler.ts` subcommand switch |
| `src/database/` | `supabase.ts` client, `db.ts` facade, `dbCache.ts` (Redis pub/sub invalidation), `batchWriter.ts` (timestamp-guarded), `webhookCache.ts` (`discord_user_id` pre-scrub storage), `sqliteAdapter.ts` auto-migrated fallback |
| `src/utils/tierRanking.ts` | Tier maps (`tierIdMap`, `centsMap`, `tierRankings`) built from `TIER_CONFIG` |
| `src/utils/logger.ts` | Logger + DB-persisted error buffer (100 entries) + `explainError()` engine |
| `src/utils/roleSync.ts` | Discord role reconciliation against pledge tiers |
| `src/utils/weeklyDigest.ts`, `anniversaryChecker.ts` | Schedulers with DB persistence to survive restarts on ephemeral containers |
| `src/utils/patreonClient.ts` / `patreonPoller.ts` | Patreon API client with 25-day proactive refresh scheduler + auto 401 refresh; background poller |

## Graceful Degradation

The bot is deliberately resilient to partial infrastructure:

- **No Redis** → direct webhook processing with retry backoff; in-memory dedup fallback.
- **No `webhook_log` table** → `webhookCache` helpers log warnings and return nulls; audit/replay
  features report empty rather than crashing.
- **No core env config** → setup mode; only the web server + token-gated wizard run.
- **SQLite fallback** (`sqliteAdapter.ts`) mirrors all tables and auto-applies missing columns for local/offline runs.
- **Ephemeral restarts** → diagnostic counters, errors, and scheduler states persist to DB, recovering instantly on boot.

See [Webhook Pipeline](Webhook-Pipeline.md) for the request lifecycle,
[Database](Database.md) for storage details, and [Diagrams](Diagrams.md) for rendered
Mermaid graphs of all of the above.
