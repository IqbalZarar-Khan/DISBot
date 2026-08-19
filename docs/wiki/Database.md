# Database

Primary storage is **Supabase (Postgres)** accessed via supabase-js (REST). A **SQLite adapter**
mirrors the core tables for local/offline runs, and an in-memory **DB cache** fronts hot reads.

## Tables

| Table | Purpose | Key columns |
|---|---|---|
| `tracked_posts` | Every announced post; anchors waterfall state | post id, lowest tier, timestamps |
| `tracked_members` | Patron roster; `current_tier_id` drives upgrade detection | member id, tier, patron status |
| `tier_mappings` | Tier name → Discord channel | `tier_name`, `tier_rank`, `channel_id` |
| `role_mappings` | Tier name → Discord role (role sync) | `tier_name`, `role_id` |
| `custom_messages` | Message templates (`post_new`, `post_waterfall`, `welcome`, `win_back`, `anniversary`) | type, content |
| `bot_config` | Key/value store: OAuth tokens, diagnostics counters (`diag_*`), misc flags | key, value |
| `webhook_log` | Audit trail of every verified webhook | see below |

### `webhook_log` (migration 011)

The ground truth for "did the bot actually announce X":

| Column | Meaning |
|---|---|
| `event_type` | Patreon event (`members:pledge:create`, …) |
| `member_id` / `member_name` | Member reference (name captured pre-redaction) |
| `payload` | JSONB, PII-redacted (see [Webhook Pipeline](Webhook-Pipeline.md#pii-redaction)) |
| `processed` | Handler ran without throwing |
| `announced` | A Discord message was actually sent |
| `notes` | e.g. `Handler threw: …` or `No handler registered for event type: …` |
| `received_at` | Ingestion timestamp |

Derived stats: rows with notes starting `Handler threw:` count as failures; other notes count
as informational successes. This is also where weekly-digest tier changes are read from
(notes shaped `oldTier → newTier`).

## Migrations

- SQL files in `supabase/migrations/` (`000`–`012`), applied **automatically at boot** by
  `src/database/autoMigrate.ts`.
- If the `exec_sql` RPC isn't bootstrapped in production Supabase, paste the migration into
  the Supabase SQL Editor manually — the bot degrades gracefully until then.
- Self-hosted docker-compose path uses `docker/init.sql`.

New tables are additive: add a migration file and the boot sequence picks it up.

## Access Layers

```
handlers ──▶ db.ts (facade + CRUD helpers)
                ├─▶ supabase.ts  (client singleton)
                ├─▶ dbCache.ts   (in-memory, warm reads)
                ├─▶ batchWriter.ts (5s-buffered member upserts)
                └─▶ sqliteAdapter.ts (fallback when Supabase is unavailable)
```

- **Batch writer** — bursts of member events coalesce into single upserts.
- **DB cache** — tier mappings, config, and templates are cached at `ClientReady`; commands
  like `/admin sync-tiers` refresh it without a restart.
- **SQLite fallback** — implements the same helper surface for local dev; note that
  `loadDiagnosticCounters()` queries Supabase directly and falls back to zeros in pure-SQLite
  mode (acceptable for local dev).

## Persistence of Counters

`src/commands/admin/status.ts` keeps diagnostic counters in memory and flushes them to
`bot_config` on a 5s debounce (`diag_tier_detect_success`, `diag_tier_detect_fail`,
`diag_last_webhook_at`). On restart, webhook counts are re-derived from `webhook_log` (ground
truth) — so a counter lost in a sub-5s shutdown window self-heals. The `/metrics` endpoint
reads the same in-memory counters (see [Monitoring](Monitoring.md)).
