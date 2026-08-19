# Deployment

DISBot ships as one Node process (Discord gateway + webhook server + schedulers) with optional
Redis for queueing. Node **≥ 20** is required (`engines` field in package.json).

The step-by-step platform guides live in the user docs — this page is the runtime model plus
gotchas. See:

- [DEPLOYMENT.md](../../DEPLOYMENT.md) — Railway, Render, VPS, PM2 walkthroughs
- [DEPLOY_CONFIG_GUIDE.md](../../DEPLOY_CONFIG_GUIDE.md) / [DEPLOY_FILES_README.md](../../DEPLOY_FILES_README.md)
- [docker-compose.yml](../../docker-compose.yml) — self-hosted stack

## Targets

| Target | Config | Notes |
|---|---|---|
| **Railway** (recommended) | `railway.json` | Add the Redis plugin; use its internal URL for `REDIS_URL`; set `PUBLIC_URL` to the app domain |
| **Docker Compose** | `docker-compose.yml` | Full stack: Postgres 16 + PostgREST + Redis + bot. Requires `DB_PASSWORD` and `POSTGREST_JWT_SECRET` (compose fails fast without them — no insecure defaults) |
| **Docker (BYO database)** | `Dockerfile` | Multi-stage `node:20-alpine`; bring your own Supabase/Postgres; healthcheck hits `/health` |
| **Render** | `render.yaml` | — |
| **VPS / PM2** | `ecosystem.config.js`, `setup-vps.sh`, `nginx.conf` | nginx terminates TLS in front of the webhook port |

## Runtime Model & Gotchas

- **Early port binding.** The Fastify server binds before Discord login so platform health
  checks pass during the gateway handshake. Don't reorder the boot sequence.
- **`PORT` vs `WEBHOOK_PORT`.** Platforms inject `PORT`; `WEBHOOK_PORT` is the local-dev
  override. `config.ts` prefers `PORT`.
- **Public URL.** `PUBLIC_URL` must be set for OAuth redirects (`/oauth/redirect`) and
  dashboard links; the setup wizard can auto-detect Railway domains.
- **Patreon webhook URL.** Point the Patreon campaign's webhook at
  `https://<host>/webhooks/patreon` with the same `WEBHOOK_SECRET`, subscribing to the
  `members:*`, `members:pledge:*`, and `posts:*` triggers.
- **Horizontal scaling.** Safe with `REDIS_URL` set (BullMQ workers, Redis-backed cache).
  Without Redis, run a single instance only — direct processing has no cross-instance dedup
  beyond the per-process 60s guard.
- **Migrations** apply automatically at boot. If the Supabase `exec_sql` RPC isn't
  bootstrapped, apply pending SQL via the SQL Editor once.
- **Slash commands** deploy on `ClientReady` — new commands appear after restart
  (or run `npm run deploy-commands` manually).
- **Secrets hygiene.** If secrets were ever committed, rotate them (see the Git History
  Warning in the README). Compose deliberately refuses to start with missing secrets.

## Verification After Deploy

```bash
curl https://<host>/health                     # {"status":"ok"}
curl -H "Authorization: Bearer $METRICS_TOKEN" https://<host>/metrics
npm run verify                                 # deployment verification script
npm run test:webhook -- --event posts:publish --url https://<host>/webhooks/patreon
```

Then in Discord: `/admin status` (all-green check), `/admin replay-webhook` (empty audit view
is fine — it means everything announced).
