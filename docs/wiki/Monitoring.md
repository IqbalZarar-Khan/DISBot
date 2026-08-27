# Monitoring & Operations

Everything an operator needs to keep an eye on a running DISBot.

## HTTP Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Liveness probe `{ status: 'ok' }` — used by the Docker healthcheck |
| `GET /metrics` | optional `METRICS_TOKEN` | Prometheus text format |
| `GET /dashboard` | JWT (generated via `/admin dashboard`) | Chart.js analytics SPA |
| `GET /setup` | `SETUP_TOKEN` / `DISCORD_TOKEN` | Cloud setup wizard (locked once completed) |
| `GET /oauth/start` → `/oauth/redirect` | none | Patreon OAuth flow; saves tokens to DB |

## `/metrics`

Prometheus exposition format, no extra dependencies. Exposes:

| Metric | Type | Meaning |
|---|---|---|
| `disbot_uptime_seconds` | gauge | Process uptime |
| `disbot_process_resident_memory_bytes` / `disbot_process_heap_used_bytes` | gauge | Memory |
| `disbot_webhooks_success_total` / `disbot_webhooks_failed_total` | counter | Handler outcomes |
| `disbot_tier_detection_success_total` / `disbot_tier_detection_failed_total` | counter | Tier cascade health |
| `disbot_last_webhook_timestamp_seconds` | gauge | 0 = never |
| `disbot_redis_connected` | gauge | Redis status |
| `disbot_queue_jobs{state=…}` | gauge | BullMQ depth (waiting/active/delayed/failed) — present only when Redis is up |

Counters are DB-backed across restarts (see [Database](Database.md#persistence-of-counters)).

**Auth:** open by default for local dev. On public deployments set `METRICS_TOKEN` and scrape
with `Authorization: Bearer <token>` (or `?token=<token>`).

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" https://your-host/metrics
```

## In-Discord Tooling

- **`/admin status`** — Patreon API health (cached 60s), DB health, uptime, webhook + tier
  detection rates, recent errors, tier mappings.
- **`/admin error-log`** — ring buffer of the last 100 errors with severity badges and
  `explainError()` cause/fix explanations (20+ recognized patterns; add new patterns as `if`
  blocks before the fallback in `src/utils/logger.ts`). Persisted to `bot_config` to survive restarts.
- **`/admin replay-webhook`** — audit `webhook_log` and re-dispatch missed announcements;
  see [Webhook Pipeline](Webhook-Pipeline.md#replay-admin-replay-webhook).
- **`/admin debug-logs`** / **`/admin server-stats`** — raw debug trail and host vitals.

## Scheduled Reports

- **Weekly digest** (`src/utils/weeklyDigest.ts`) — hourly check, fires once on Sundays (persisted to DB to catch up if restarted):
  three embeds to the root admin with totals/new/changes from `tracked_members`, plus
  cancellations and tier changes derived from `webhook_log`.
- **Anniversary checker** — daily 1yr/2yr pledge celebrations (persists execution date to DB).
- **Proactive Token Refresh** — runs every 25 days and on boot to keep Patreon OAuth tokens refreshed.
- **Keyword detector** — configurable keyword alerts on post content.
- **Health checks** — periodic self-tests logged to the admin log channel.

## Failure Modes & Recovery

| Symptom | Where to look | Fix |
|---|---|---|
| Post announced to wrong/no tier | `/admin error-log`, tier-detection DMs | Fix `TIER_CONFIG` / mappings; `/admin replay-webhook action:replay log_id:<id>` |
| Webhook verified but no announcement | `webhook_log` row: `processed=true, announced=false` | Replay it; check tier mappings exist |
| Handler threw | notes: `Handler threw: …` | Check `/admin error-log` explanation; replay after fixing |
| Phantom 401s from Patreon API | `/admin status` Patreon field | Proactive refresh runs every 25d; re-run `/oauth/start` if refresh token was revoked |
| Queue backlog | `disbot_queue_jobs{state="waiting"}` | Check Redis health / worker logs |
| Duplicate announcements | dedup guard covers Redis SETNX 60s | Check for multiple distinct deployments without Redis connectivity |

## Logs

Runtime logs go to stdout (`logger.ts`). The error ring buffer (100 entries) powers
`/admin error-log`; `webhook_log` is the persistent audit trail. On hosts like Railway,
`logs.<ts>.json` snapshots can be exported from the platform console — keep them out of the
repo (they're gitignore candidates, not commits).
