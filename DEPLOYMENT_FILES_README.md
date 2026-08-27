# Deployment Configuration Files Reference

This document summarizes the deployment infrastructure, configuration files, and containerization assets included with DISBot.

---

## 📁 Infrastructure Manifest

### 1. `railway.json` — Railway.app Blueprint (Recommended)
- Configured for Nixpacks with Node.js 20+ runtime.
- Health check path set to `/health` with automatic container restart policy.
- Dynamic `PORT` environment binding supported natively by Fastify.

### 2. `render.yaml` — Render.com Blueprint
- Infrastructure-as-code declaration for paid Web Service instances (`$7/mo`+ Starter).
- Automatic health check at `/health` with pre-configured environment schema.

### 3. `Procfile` — Heroku / Cloud Native
- Standard Node.js process entrypoint: `web: npm start`.
- Runs prestart auto-compilation (`tsc`) and launches `dist/index.js`.

### 4. `Dockerfile` — Production Container Image
- Multi-stage build based on `node:20-alpine`.
- Non-root user execution with embedded `/health` curl check.
- Optimized bundle size excluding dev dependencies and test suites.

### 5. `docker-compose.yml` — Full Multi-Container Orchestration
- Declares `disbot` application service + Redis cache/queue + PostgREST / PostgreSQL fallback.
- Persistent volume mounting for local SQLite / database logs.

### 6. `nginx.conf` — Reverse Proxy Configuration
- Optimized proxy headers (`X-Forwarded-Proto`, `X-Real-IP`, `Upgrade` for WebSockets).
- Configured for TLS termination via Let's Encrypt / Certbot.

### 7. `ecosystem.config.js` — PM2 Process Manager
- Production cluster/fork mode with memory ceilings and auto-restart rules.
- Pre-configured stdout/stderr log paths in `./logs`.

---

## 🛠️ Build & Security Scripts

| Script | Command | Purpose |
|---|---|---|
| `build` | `npm run build` | Compiles TypeScript (`src/`) to JavaScript (`dist/`) |
| `prestart` | *(Auto-runs on `npm start`)* | Ensures `npm run build` always runs before starting in production |
| `check:secrets` | `npm run check:secrets` | Scans repository for committed Discord bot tokens, Patreon secrets, and Supabase JWTs |
| `test` | `npm test` | Executes Jest test suites (53 tests covering filters, waterfall ranking, chapter formatting, welcome guards) |
| `setup:patreon` | `npm run setup:patreon` | Auto-discovers Patreon tiers, campaign IDs, and creates `TIER_CONFIG` |
| `setup:wizard` | `npm run setup:wizard` | Launches local HTML GUI wizard on port 3456 |
| `verify` | `npm run verify` | Verifies environment variables, ports, and API connections |

---

## 📚 Related Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** — In-depth guide for Railway, Render, VPS, Docker, Heroku, and local tunnels
- **[DEPLOY_CONFIG_GUIDE.md](DEPLOY_CONFIG_GUIDE.md)** — Quick platform setup steps and environment variable reference
- **[DEPLOY_QUICK.md](DEPLOY_QUICK.md)** — 3-step rapid deployment summary
- **[SETUP.md](SETUP.md)** — Initial Discord, Patreon, and Supabase credential setup
- **[Wiki](docs/wiki/Home.md)** — Architectural internals, database migrations, and webhook pipeline
