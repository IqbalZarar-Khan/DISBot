# Development

Local workflow, conventions, and the sanctioned extension points.

## Prerequisites

- Node ≥ 20 (`engines` in package.json; local dev on 22 works)
- A Supabase project (or the docker-compose stack) — or run degraded with the SQLite fallback
- Discord bot application + Patreon creator account for full flows

## Common Commands

```bash
npm run dev              # nodemon + ts-node src/index.ts
npm run build            # tsc → dist/
npm start                # node dist/index.js
npx tsc --noEmit         # typecheck gate — must be silent
npx jest                 # unit test suite (51 tests across 4 suites)
npm run test:webhook -- --event <type> --url <host>/webhooks/patreon
npm run setup:patreon    # fetch Patreon config into TIER_CONFIG draft
npm run setup:wizard     # interactive setup wizard (CLI)
npm run verify           # post-deployment verification
```

## Testing

- Jest + ts-jest, config in `jest.config.js`, tests co-located as `src/**/*.test.ts`
  (excluded from the `tsc` build via tsconfig).
- Current suites: `tierRanking` (maps, fallbacks, upgrade/waterfall logic),
  `chapterFormatter` (patterns, spoilers, truncation), `welcomeGuard` (rejoin/new patron dedup),
  `webhookFilters` (dedup TTL, ghost fingerprints, fake-timer expiry).
- Tests that touch module-level maps (`tierRanking`) reset them in `beforeEach` so they stay
  deterministic regardless of local `.env`.
- `npm run test:integration` matches integration-path tests.

## Conventions

- TypeScript strict, plus `noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns` /
  `noFallthroughCasesInSwitch` — keep the `tsc --noEmit` gate silent.
- Handlers are lazy-imported inside the router's switch (keeps boot lean); follow that pattern
  when adding cases.
- Graceful degradation over crashes: missing tables/Redis/config log warnings and continue.
- PII never lands in `webhook_log` unredacted, and logs never echo tokens or raw payloads
  (see the security-hygiene pass — keep it that way).
- i18n: user-facing startup/setup strings go through `t()` from `src/utils/i18n.ts`;
  locales live in `src/locales/*.json` (`en`, `id`). Missing keys fall back to the key itself,
  missing locale files fall back to English.

## Extension Points

All of these are additive by design — no existing behavior needs to change:

| To add… | Do this |
|---|---|
| **Slash command** | Subcommand in `commandData.ts` + handler file + `case` in `admin/handler.ts` |
| **Webhook event handler** | Handler file in `src/webhooks/handlers/` + `case` in `router.ts` + add to `SUPPORTED_WEBHOOK_EVENTS` and the `WebhookEventType` union (`src/database/schema.ts`) |
| **Database table** | SQL migration in `supabase/migrations/` (auto-applied at boot); mirror helpers in `sqliteAdapter.ts` if local dev needs them |
| **Locale** | `src/locales/<code>.json` mirroring `en.json`; select with `BOT_LOCALE` |
| **Metric** | Add lines in the `/metrics` handler (`src/webhooks/server.ts`) — stick to the hand-rolled text format, no new deps |
| **Error explanation** | New `if` pattern before the fallback in `explainError()` (`src/utils/logger.ts`) |
| **Event channel** | New choice in `/admin set-event-channel` + `getEventChannel()` consumer |

## Hardening & Resilience

- **Error Ring Buffer** — persisted to `bot_config` to survive restarts and pre-loaded on boot.
- **Diagnostic Counters** — debounced in memory, flushed synchronously during `SIGINT`/`SIGTERM` process terminations.
- **Slash Commands** — MD5 hash checking against `command_definition_hash` prevents unnecessary Discord API registration on restarts.
- **Dedup** — Redis `SETNX` (60s TTL) coordinates across cluster instances; falls back to in-memory map.
- **OAuth Tokens** — proactive refresh scheduler refreshes tokens every 25 days, preventing idle deployment expiration.

## Dependency Notes

- Safe to `npm update` within ranges; majors worth coordinating: bullmq 6 + ioredis 6 (queue
  code uses no removed APIs), dotenv 17. Defer TypeScript 7 (ts-node/ts-jest toolchain) and
  Jest 30 (coordinate with ts-jest).
- If phantom type errors appear in untouched files, suspect a corrupted `node_modules` —
  run `npm ci` before debugging anything else.
