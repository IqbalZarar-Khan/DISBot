# Database

Primary storage is **Supabase (Postgres)** accessed via supabase-js (REST). A **SQLite adapter**
mirrors the core tables for local/offline runs, and an in-memory **DB cache** fronts hot reads.

## Tables

| Table | Purpose | Key columns |
|---|---|---|
| `tracked_posts` | Every announced post; anchors waterfall state | post id, lowest tier, timestamps |
| `tracked_members` | Patron roster; `is_active` drives rejoins vs departures | member id, tier, patron status, `is_active` |
| `tier_mappings` | Tier name → Discord channel | `tier_name`, `tier_rank`, `channel_id` |
| `role_mappings` | Tier name → Discord role (role sync) | `tier_name`, `role_id` |
| `custom_messages` | Message templates (`post_new`, `post_waterfall`, `welcome`, `win_back`, `anniversary`) | type, content |
| `bot_config` | Key/value store: OAuth tokens, errors (`error_log_*`), diagnostics (`diag_*`), command hash, last run dates | key, value |
| `webhook_log` | Audit trail of every verified webhook | see below |

### `webhook_log` (migrations 011, 012, 014, 015)

The ground truth for "did the bot actually announce X":

| Column | Meaning |
|---|---|
| `event_type` | Patreon event (`members:pledge:create`, …) |
| `member_id` / `member_name` | Member reference (name captured pre-redaction) |
| `discord_user_id` | Discord user ID (captured pre-redaction for replay DMs) |
| `dedup_hash` | MD5 idempotency hash for database-backed deduplication when Redis is absent |
| `payload` | JSONB, PII-redacted (see [Webhook Pipeline](Webhook-Pipeline.md#pii-redaction)) |
| `processed` | Handler ran without throwing |
| `announced` | A Discord message was actually sent |
| `notes` | e.g. `Handler threw: …` or `[UNSUPPORTED] No handler registered for event type: …` |
| `received_at` | Ingestion timestamp |

Derived stats: rows with notes starting `Handler threw:` count as failures; other notes count
as informational successes. This is also where weekly-digest tier changes are read from
(notes shaped `oldTier → newTier`).

## Migrations

- SQL files in `supabase/migrations/` (`000`–`015`), applied **automatically at boot** by
  `src/database/autoMigrate.ts`. Post-migration checks verify critical columns (`member_name`, `discord_user_id`, `dedup_hash`, `is_active`).
- If the `exec_sql` RPC isn't bootstrapped in production Supabase, paste the migration into
  the Supabase SQL Editor manually — the bot degrades gracefully until then.
- Self-hosted docker-compose path uses `docker/init.sql`.

New tables are additive: add a migration file and the boot sequence picks it up.

## Access Layers

```
handlers ──▶ db.ts (facade + CRUD helpers)
                ├─▶ supabase.ts  (client singleton)
                ├─▶ dbCache.ts   (in-memory, warm reads + Redis pub/sub invalidation)
                ├─▶ batchWriter.ts (5s-buffered member upserts with timestamp guards)
                └─▶ sqliteAdapter.ts (fallback with auto ALTER TABLE column upgrades)
```

- **Batch writer** — bursts of member events coalesce into single upserts; protected by timestamp guards against out-of-order writes.
- **DB cache** — tier mappings, config, and templates are cached at `ClientReady`; invalidation broadcasts across instances via both Redis pub/sub (`disbot:cache:invalidate`) and Supabase Realtime WebSocket (`postgres_changes` on `tier_mappings`/`bot_config`) for instant sync without Redis.
- **SQLite fallback** — implements the same helper surface for local dev, auto-adding missing schema columns on initialization.

## Persistence of Diagnostics, Errors & Schedulers

- **Diagnostic Counters** — `src/commands/admin/status.ts` keeps counters in memory and flushes them to
  `bot_config` on a 5s debounce (`diag_tier_detect_success`, `diag_tier_detect_fail`, `diag_last_webhook_at`),
  and flushes synchronously during `SIGINT`/`SIGTERM` shutdowns.
- **Error Ring Buffer** — Critical errors are persisted immediately to `bot_config` as `error_log_<id>` and re-loaded into memory on startup so error diagnostic logs survive container restarts.
- **Schedulers** — `last_digest_week` and `last_anniversary_check_date` persist to `bot_config`, avoiding missed or duplicate runs across container deployments.
- **Slash Commands** — `command_definition_hash` in `bot_config` prevents repeated deployment calls to the Discord REST API when command structures are unchanged.
