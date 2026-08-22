# DISBot Wiki

> **DISBot** is a self-hosted **Patreon-to-Discord automation bot** for content creators.
> It receives Patreon webhooks, announces posts to tier-specific Discord channels, runs a
> **waterfall release** strategy (day 1 for high tiers, progressively unlocking for lower tiers),
> syncs Discord roles to pledge tiers, and gives the admin analytics, digests, and diagnostics.

This wiki is the maintainers' knowledge base. For hands-on setup and deployment, see the
[user-facing docs](../../README.md#-documentation) instead.

## Pages

| Page | What's in it |
|---|---|
| [Architecture](Architecture.md) | Boot sequence, components, and how they fit together |
| [Diagrams](Diagrams.md) | Mermaid graphs: system overview, webhook lifecycle, waterfall, data layers, modules |
| [Configuration](Configuration.md) | Every environment variable, `TIER_CONFIG`, and setup mode |
| [Webhook Pipeline](Webhook-Pipeline.md) | Ingestion lifecycle: verify → log → filter → queue → route → replay |
| [Tiers & Waterfall](Tiers-and-Waterfall.md) | Tier detection cascade, ranks, waterfall logic, hybrid broadcast |
| [Commands](Commands.md) | Slash-command reference (all `/admin` subcommands + `/link`) |
| [Database](Database.md) | Tables, migrations, Supabase/SQLite adapters, batch writer |
| [Monitoring](Monitoring.md) | `/metrics`, analytics dashboard, error log, diagnostics, replay tooling |
| [Deployment](Deployment.md) | Runtime requirements and deployment targets (links out) |
| [Development](Development.md) | Testing, extension points, i18n, conventions |

## The 30-Second Version

1. A creator publishes a post on Patreon → Patreon sends a signed webhook to `POST /webhooks/patreon`.
2. The bot verifies the HMAC-MD5 signature, persists the payload to `webhook_log` (PII-redacted),
   drops duplicates and no-op "ghost" updates, then queues the event (BullMQ if Redis is up).
3. The router dispatches to a handler which resolves the post's tier, formats a message from the
   DB-stored template, and announces it in the mapped Discord channel(s).
4. The post is tracked against its **lowest** accessible tier; when a later `posts:update` lowers
   the requirement, newly-unlocked tiers get their own announcement — that's the waterfall.
5. Member events (`members:*`, `members:pledge:*`) drive welcomes, upgrade/downgrade notices,
   win-back DMs, and Discord role sync.

## Tech Stack

TypeScript 5 / Node ≥ 20 · discord.js v14 · Fastify v5 · Supabase (Postgres) via supabase-js ·
BullMQ + Redis (optional) · Jest + ts-jest · Docker Compose (Postgres + PostgREST + Redis for
fully self-hosted runs) · Railway/Render/PM2 configs included.

## Repo Orientation

- `src/index.ts` — boot sequence orchestration
- `src/config.ts` — env loading/validation, `TIER_CONFIG` parsing
- `src/webhooks/` — Fastify server, signature verification, filters, router, handlers, dashboard, setup wizard
- `src/commands/` — slash command definitions (`commandData.ts`) and admin handlers
- `src/database/` — Supabase client, schema types, migrations plumbing, cache, batch writer, SQLite fallback
- `src/queue/` — BullMQ queue + worker
- `src/utils/` — tier ranking, formatters, logger + error explanation engine, poller, digests, i18n
- `supabase/migrations/` — SQL migrations (applied automatically at boot)
- `leftoff.md` / `HANDOFF.md` — rolling session notes (gitignored)
