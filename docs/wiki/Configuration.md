# Configuration

All configuration is environment-based (`.env` locally; platform env vars in the cloud).
`src/config.ts` loads and validates everything at boot. Template: [`.env.example`](../../.env.example).

## Environment Variables

### Discord

| Variable | Required | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Bot token from the Discord Developer Portal |
| `GUILD_ID` | ✅ | Server the bot operates in |
| `ROOT_ADMIN_ID` | ✅ | Discord user id that passes `checkAdminPermission` for `/admin *` |
| `LOG_CHANNEL_ID` | — | Admin log channel for warnings (e.g., tier-detection fallbacks) |

### Patreon

| Variable | Required | Purpose |
|---|---|---|
| `PATREON_CLIENT_ID` / `PATREON_CLIENT_SECRET` | ✅ | OAuth app credentials |
| `PATREON_ACCESS_TOKEN` | ✅ | Creator API token (can be obtained via `/oauth/start` instead of Postman) |
| `PATREON_REFRESH_TOKEN` | — | Enables automatic token refresh (`src/utils/patreonClient.ts`) |
| `PATREON_CAMPAIGN_ID` | ✅ | Campaign to operate on |

### Webhooks & Web

| Variable | Required | Purpose |
|---|---|---|
| `WEBHOOK_SECRET` | ✅ | Patreon webhook signing secret (HMAC-MD5 verification) |
| `WEBHOOK_PORT` | — | HTTP port; overridden by platform `PORT`. Default 3000 |
| `PUBLIC_URL` | — | Public base URL for OAuth redirects and dashboard links |
| `METRICS_TOKEN` | — | When set, `/metrics` requires `Authorization: Bearer <token>` (or `?token=`). Unset = open |

### Storage

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_KEY` | ✅ | Supabase project (Postgres via REST). For docker-compose self-hosting use the PostgREST URL/JWT |
| `REDIS_URL` | — | Enables BullMQ queue + distributed cache. Default `redis://localhost:6379` |
| `DB_PASSWORD` | — | docker-compose Postgres password (compose fails fast if unset — no insecure default) |
| `POSTGREST_JWT_SECRET` | — | docker-compose PostgREST JWT signing secret |

### Behavior

| Variable | Required | Purpose |
|---|---|---|
| `TIER_CONFIG` | ✅ | JSON tier definitions — see below |
| `DISCORD_ROLE_SYNC_ENABLED` | — | `true` enables automatic role management + boot reconciliation |
| `BOT_LOCALE` | — | i18n locale. Shipped: `en`, `id`. Missing locale falls back to English |

Runtime-only: `RAILWAY_PUBLIC_DOMAIN` / `RAILWAY_STATIC_URL` are read by the setup wizard for
URL detection on Railway.

## `TIER_CONFIG`

A JSON array describing your Patreon tiers. **`rank` drives everything** — higher number =
higher priority = narrower audience:

```json
[
  {"name": "Diamond", "id": "123456", "rank": 100, "cents": 1000},
  {"name": "Gold",    "id": "234567", "rank": 75,  "cents": 500},
  {"name": "Free",    "id": "345678", "rank": 0,   "cents": 0}
]
```

- `name` — display name; must match tier names used in `/admin set-channel` mappings.
- `id` — Patreon tier id (watch bot logs when creating posts, or use `/admin sync-tiers`).
- `rank` — priority. Waterfall unlocks go **from high rank to low rank** over time.
- `cents` — optional pledge amount in cents; powers the cents-based tier-detection fallback.

At boot, `src/utils/tierRanking.ts` builds three lookup maps from this: `tierIdMap`
(id → name), `tierRankings` (name → rank), and `centsMap` (cents → name).

Boot validation **aborts with a fatal error (`process.exit(1)`)** if a **cheaper tier outranks a more expensive one** — that inversion would break waterfall distribution and risk leaking premium content. Set `ALLOW_RANK_INVERSION=true` in environment variables if non-standard inverted tier rankings are intentionally required.

## Setup Mode

If any of `DISCORD_TOKEN`, `GUILD_ID`, `ROOT_ADMIN_ID`, Patreon credentials, or `WEBHOOK_SECRET`
are missing, `config._isSetupMode` is set: the bot starts **only** the web server and the
cloud Setup Wizard at `/setup`.

**Authentication in Setup Mode:**
- When `DISCORD_TOKEN` is configured, it acts as the unlock password.
- When `DISCORD_TOKEN` is missing (fresh cloud deployment), the bot generates a secure, one-time random `SETUP_TOKEN` printed to the server console upon boot. This token must be entered into `/setup` to unlock the wizard, preventing unauthorized hijacking of fresh deployments on public URLs.
- After configuring credentials in the wizard, the owner runs `!claim` in Discord to bind `ROOT_ADMIN_ID`.
