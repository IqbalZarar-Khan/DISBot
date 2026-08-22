# Architecture

DISBot is a single Node process that runs three things at once: a Discord gateway client
(discord.js), an HTTP webhook server (Fastify), and background schedulers. Optional Redis/BullMQ
moves webhook processing into a worker for horizontal scaling.

## Boot Sequence (`src/index.ts`)

Order matters — the HTTP port binds **before** the Discord gateway connects so cloud platforms
(Railway/Render) detect a healthy port during Discord's slow login:

1. **Config** — `src/config.ts` loads env via dotenv, parses/validates `TIER_CONFIG`.
   If core config is missing, `_isSetupMode` is set and only the web server + cloud Setup
   Wizard (`/setup`) start.
2. **Database** — `initSupabase()` → `autoMigrate()` runs any unapplied SQL from
   `supabase/migrations/` → connection test.
3. **Redis (optional)** — `initRedis()`; if it connects, `initWebhookQueue()` creates the
   BullMQ queue. Failure is non-fatal: the bot falls back to direct processing.
4. **Batch writer** — `startBatchWriter()` buffers member upserts into 5s-flushed writes.
5. **Fastify server** — `startWebhookServer()` binds the port, mounts `/setup` wizard and
   `/dashboard`, starts the webhook-filter cleanup interval.
6. **Discord login** — `loginWithRetry()` with exponential backoff (handles Cloudflare-blocked IPs).
7. **On `ClientReady`** — starts the BullMQ worker, auto-deploys slash commands, initializes the
   DB cache, loads persisted diagnostic counters, validates Patreon OAuth scopes, and starts
   schedulers: anniversary checker, weekly digest, keyword detector, health checks, setup-mode
   `!claim`, first-deploy DM. If `DISCORD_ROLE_SYNC_ENABLED`, runs initial role reconciliation.

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
                 │ (src/queue/)  │          │ (same thread)   │
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
| `src/webhooks/webhookFilters.ts` | Dedup guard (60s) + ghost-event filter (5min) — extracted for testability |
| `src/webhooks/router.ts` | Event dispatch; exports `SUPPORTED_WEBHOOK_EVENTS`; marks `webhook_log` rows |
| `src/webhooks/handlers/` | One file per Patreon event (`members-*`, `posts-*`) |
| `src/commands/` | `commandData.ts` definitions + `admin/handler.ts` subcommand switch |
| `src/database/` | `supabase.ts` client, `db.ts` facade, `dbCache.ts`, `batchWriter.ts`, `webhookCache.ts`, `sqliteAdapter.ts` fallback |
| `src/utils/tierRanking.ts` | Tier maps (`tierIdMap`, `centsMap`, `tierRankings`) built from `TIER_CONFIG` |
| `src/utils/logger.ts` | Logger + error ring buffer (100 entries) + `explainError()` engine |
| `src/utils/roleSync.ts` | Discord role reconciliation against pledge tiers |
| `src/utils/weeklyDigest.ts`, `anniversaryChecker.ts`, `keywordDetector.ts` | Schedulers |
| `src/utils/patreonClient.ts` / `patreonPoller.ts` | Patreon API client with token refresh; optional background poller (off by default) |

## Graceful Degradation

The bot is deliberately resilient to partial infrastructure:

- **No Redis** → direct webhook processing, no queue.
- **No `webhook_log` table** → `webhookCache` helpers log warnings and return nulls; audit/replay
  features report empty rather than crashing.
- **No core env config** → setup mode; only the web server + wizard run.
- **SQLite fallback** (`sqliteAdapter.ts`) mirrors key tables for local/offline runs.

See [Webhook Pipeline](Webhook-Pipeline.md) for the request lifecycle,
[Database](Database.md) for storage details, and [Diagrams](Diagrams.md) for rendered
Mermaid graphs of all of the above.
