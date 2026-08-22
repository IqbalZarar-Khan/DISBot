# DISBot — Session Leftoff (2026-08-16 23:33 +0530)

## What Was Done This Session

Additive-features pass: replay tooling, Prometheus metrics, test suite, i18n locale, a maintainer wiki, and small hardening. Everything verified with `npx tsc --noEmit` (zero errors) and `npx jest` (46/46 passing). No commits made yet — all work is uncommitted alongside the earlier security-hygiene WIP.

### Feature 1: `/admin replay-webhook` command
- **New:** `src/commands/admin/replay-webhook.ts` — audit + replay tool for the `webhook_log` table
- **Updated:** `src/commands/commandData.ts` — registered the `replay-webhook` subcommand
- **Updated:** `src/commands/admin/handler.ts` — routed the new case
- Actions: `view` (last 25 rows with status), `replay` (one row via `log_id`), `replay-missed` (all unannounced in a lookback window, batch cap 10 — replays send real Discord messages)
- Replays re-dispatch through the normal router (`routeWebhookEvent`), so the same `webhook_log` row is updated as if the webhook arrived live
- **New helper:** `getWebhookLogById()` in `src/database/webhookCache.ts` (full row incl. payload)
- **Redaction scoping change** in `webhookCache.ts`: identity keys (email, full_name, discord_id, address…) are scrubbed everywhere as before, but `url`/`image_url`/`thumb_url`/`image_small_url` are now only scrubbed on `type === 'user'` records. Post/campaign URLs are public and were previously destroyed, which would have made replayed post announcements link to `[REDACTED]`
- Replay rehydrates the patron display name from the `member_name` column (stored pre-redaction). Emails/Discord IDs are unrecoverable by design — a replayed `pledge:delete` falls back to the channel notice instead of the win-back DM
- Legacy rows logged before the redaction change still carry `[REDACTED]'` URLs — the command detects and warns about them

### Feature 2: Prometheus `/metrics` endpoint
- **Updated:** `src/webhooks/server.ts` — new `GET /metrics` route, hand-rolled text exposition format (no new dependency)
- Exposes: uptime, RSS/heap memory, webhook success/fail counters, tier-detection counters, last-webhook timestamp, Redis status, and BullMQ queue depth (waiting/active/delayed/failed) when Redis is up
- Optional auth: set `METRICS_TOKEN` to require `Authorization: Bearer <token>` (or `?token=`); open when unset (local dev default). Documented in `.env.example`

### Feature 3: Testable webhook filters (refactor)
- **New:** `src/webhooks/webhookFilters.ts` — dedup guard + ghost filter extracted from `server.ts` verbatim
- The 5-min cleanup `setInterval` no longer starts at import time; `startWebhookServer()` calls `startFilterCleanupInterval()` explicitly (same runtime behavior, no orphan interval)
- Exports `clearFilterState()` as a test hook

### Feature 4: Router hardening
- **Updated:** `src/webhooks/router.ts`
- Exports `SUPPORTED_WEBHOOK_EVENTS` (the 9 handled v2 event types) — used by replay to skip event types with no handler
- Unknown event types now get `No handler registered for event type: X` stored in the row's `notes`, distinguishing them from genuine failures in the audit view

### Feature 5: i18n locale
- **New:** `src/locales/id.json` — complete Indonesian translation of `en.json`; use via `BOT_LOCALE=id`
- Picked as a starter template — swap for any language by adding a matching JSON file (loader is `initI18n()` in `src/utils/i18n.ts`)

### Feature 6: Tests
- **New:** `jest.config.js` (ts-jest preset, `src/**/*.test.ts`; tsconfig already excludes `*.test.ts` from the build)
- **New:** `src/utils/__tests__/tierRanking.test.ts` — dynamic map lookups, case-insensitivity, trailing-dot artifacts, hardcoded fallbacks, upgrade/waterfall logic, color/emoji helpers
- **New:** `src/utils/__tests__/chapterFormatter.test.ts` — all 7 chapter patterns, spoiler wrapping, 200-char synopsis truncation, series-start copy
- **New:** `src/webhooks/__tests__/webhookFilters.test.ts` — dedup TTL, ghost detection for member/post state changes, order-insensitive access-rule sets, TTL expiry via fake timers
- 46 tests total, all passing

### Feature 7: Project wiki
- **New:** `docs/wiki/` — 10 pages, 747 lines, cross-linked maintainer knowledge base (written manually after the client's built-in wiki generator failed with an HTTP 400)
- Pages: `Home.md` (index + 30-second overview), `Architecture.md` (boot sequence, component diagram, graceful degradation), `Configuration.md` (all env vars incl. `METRICS_TOKEN`, `TIER_CONFIG`, setup mode), `Webhook-Pipeline.md` (ingestion lifecycle, ghost filter fields, router table, member-event matrix, redaction rules, replay), `Tiers-and-Waterfall.md` (5-layer tier cascade, hybrid broadcast, waterfall mechanics), `Commands.md` (all 18 `/admin` subcommands + `/link`), `Database.md` (7 tables, migrations, adapters, counter persistence), `Monitoring.md` (endpoints, every `/metrics` metric, failure-mode→fix table), `Deployment.md` (runtime model + gotchas), `Development.md` (testing, conventions, extension-point table, known tech debt)
- Consolidates `leftoff.md`/`HANDOFF.md`/README internals into durable pages; links out to `SETUP.md`/`DEPLOYMENT.md` instead of duplicating them; documents this session's additions as first-class features
- **Updated:** `README.md` — added a Wiki line to the 📚 Documentation section (only change to the README; the rest of the user's WIP untouched)

### Housekeeping
- `package.json` — added `"engines": { "node": ">=20" }`
- `.env.example` — added `METRICS_TOKEN=` and updated the `BOT_LOCALE` comment (shipped locales: en, id)

### Environment fix (important)
- `node_modules` was **corrupted** (`@discordjs/util/dist/index.js` missing) → 133 phantom `tsc` errors in untouched files (missing types, not real bugs). Fixed with `npm ci` (exact lockfile restore, no version drift). If phantom type errors appear again, run `npm ci` first.

## What Was NOT Changed (Still Works As Before)
- All 9 webhook handlers — zero logic changes
- Waterfall logic, tier-resolution cascade, role sync, digest schedulers
- The user's uncommitted security-hygiene WIP (raw-log stripping, OAuth page, compose hardening) — preserved and coexists
- Database schema — no new migrations needed; replay only reads the existing `webhook_log` table

## Important Architecture Notes
- **Replay lifecycle:** `webhook_log` row → `hydrateRedactedNames()` → `routeWebhookEvent(eventType, payload, row.id)` → row updated in place (processed/announced). Replays bypass the inbound dedup/ghost filters by design (those guard HTTP ingress only)
- **Redaction split:** `IDENTITY_KEYS` (scrubbed on every record) vs `USER_ONLY_KEYS` (scrubbed only on `user` records). New rows keep post URLs; old rows don't
- **Metrics data flow:** counters come from `getDiagnosticCounters()` (in-memory, DB-backed on restart); queue depth from `getWebhookQueue().getJobCounts()` — best-effort, skipped silently if Redis is down
- **Slash command deployment:** auto-deploys on `ClientReady`, so the new command appears after the next bot restart

## Test Commands
```bash
npx tsc --noEmit   # typecheck — must be silent
npx jest           # 46 unit tests

# After deploy, in Discord:
/admin replay-webhook                    # view recent webhook_log rows
/admin replay-webhook action:replay log_id:123
/admin replay-webhook action:replay-missed hours:24
curl http://localhost:3000/metrics       # Prometheus format
```

## Commits This Session
None yet — everything above is uncommitted in the working tree together with the earlier security-hygiene pass (posts-publish logging cleanup, OAuth page, docker-compose hardening, README git-history warning). Suggested split when committing: (1) the security-hygiene pass as-is, (2) `feat: /admin replay-webhook + webhookCache helpers + scoped redaction`, (3) `feat: /metrics endpoint`, (4) `refactor: extract webhookFilters`, (5) `test: unit suite + jest config`, (6) `chore: engines + id locale + env example`, (7) `docs: maintainer wiki in docs/wiki/ + README link`.

---

# DISBot — Session Leftoff (2026-08-23 04:43 +0530)

> Previous session (2026-08-16) preserved above, untouched.

## What Was Done This Session

Documentation-only pass: built a visual graph page for the project from the existing wiki, then wired it into the README and logged this session. **Zero code changes** — nothing under `src/`, no config, no dependencies, no migrations.

### Task 1: `docs/wiki/Diagrams.md` — new wiki page (321 lines, 9 Mermaid diagrams)

Read all 10 existing wiki pages (`Home`, `Architecture`, `Configuration`, `Webhook-Pipeline`, `Tiers-and-Waterfall`, `Commands`, `Database`, `Monitoring`, `Deployment`, `Development`) and distilled them into a single diagrams page. Wiki now = 11 pages / 1,068 lines total.

Chose **Mermaid** over generated images (like the existing `docs/waterfall-diagram.png`) because GitHub renders it natively in markdown, it stays text-diffable in PRs, and there are no binary assets to regenerate when the architecture changes. Every diagram cross-links back to its source wiki page/anchor, and all content is sourced strictly from the wiki (no new claims invented).

The 8 sections / 9 diagrams:

1. **System overview** (`flowchart TB`) — full stack in one graph: Patreon → Fastify (`verify.ts` → `logWebhookReceived` → `webhookFilters`) → Redis-up/down fork (`BullMQ` vs direct) → `router.ts` → handlers → discord.js → Discord, plus the `db.ts` facade (Supabase + SQLite fallback), `tierRanking`, `roleSync`, and the schedulers. Includes the other Fastify endpoints (`/health` `/metrics` `/dashboard` `/setup` `/oauth/*`) and the 401 rejection path.
2. **Boot sequence** (`flowchart TD`) — the 7 ordered boot steps from `src/index.ts`, including setup-mode branch at step 1, non-fatal Redis at step 3, port-before-Discord-login at step 5, and the full `ClientReady` list at step 7.
3. **Webhook lifecycle** (`flowchart TD`) — decision-by-decision: raw-body capture → HMAC-MD5 timing-safe verify (401 dead-end) → PII-redacted `webhook_log` insert → 60s dedup guard → 5min ghost filter → Redis fork (with BullMQ retry params: 3 attempts, exp backoff, concurrency 3, 10 jobs/10s) → router → known-handler check → handler → threw/no-throw outcomes (`markWebhookProcessed`, `Handler threw:` note, queue retry).
4. **Event routing** (`flowchart LR`, two subgraphs) — all 9 Patreon v2 events mapped 1:1 to their handler files with outcome labels (welcome, upgrade/downgrade, win-back DM, leave notice, tier cascade, waterfall check).
5. **Tier detection cascade** (`flowchart TD` with subgraph) — the 5 fallback layers in `posts-publish.ts` (attributes.tiers → access_rules → relationships.tiers → min_cents via currencyHelper → title match), each with hit→resolved / miss→next edges, ending in the hardcoded fallback ranks (Diamond 100 · Gold 75 · Silver 50 · Bronze 25 · Free 0). Notes the member-event 3-layer variant.
6. **Waterfall release mechanics** (`flowchart TD`) — track-at-lowest-tier, single→STANDARD / multi→BROADCAST split, `isWaterfall(oldRank, newRank)` rank-decrease check, only-newly-added-tiers announcement, and the edit-and-republish redirect into the update path.
7. **Waterfall example schedule** (`gantt`) — illustrative 5-tier unlock timeline (Diamond day 1 → Free day 13) with concrete dates so `axisFormat %b %d` renders correctly.
8. **Data access layers** (`flowchart TD`) — consumers → `db.ts` facade → supabase client / dbCache / batchWriter / sqliteAdapter; `autoMigrate` feeding Postgres; all 7 tables listed in the DB cylinder.
9. **Module map** (`flowchart LR`) — `src/` as a dependency graph: index → config/server/db/queue, server → verify/filters/router, queue → router, router → handlers, handlers → tierRanking/formatters/db, commandData → admin handler → db, schedulers → db/logger, migrations → autoMigrate.

### Task 2: Cross-links (3 files)

- **`docs/wiki/Home.md`** — added a `Diagrams` row to the Pages table, right after `Architecture` (line 15): "Mermaid graphs: system overview, webhook lifecycle, waterfall, data layers, modules".
- **`docs/wiki/Architecture.md`** — extended the closing see-also (Graceful Degradation section) to point at `Diagrams.md` alongside Webhook Pipeline and Database.
- **`README.md`** — added a `Diagrams` row to the 📖 Wiki (Maintainer Knowledge Base) table in the 📚 Documentation section, matching the wiki Home ordering. This is the only README change; the user's WIP content elsewhere in the README is untouched (same policy as last session).

### Rendering-safety fixes applied while writing

- **Data-layers diagram:** the Supabase Postgres cylinder node was first referenced unlabeled (`MIG --> PG`) before its `[(…)]` shape/label definition on a later line. Reordered so `PG` gets its full labeled definition first — avoids renderer-dependent behavior with shape-after-plain-reference.
- **Tier-cascade diagram:** moved the `START --> L1` edge after the `CASCADE` subgraph block so L1 carries its label before any edge touches it (same forward-reference concern).

## Verification

- **No automated Mermaid validation was possible:** `mermaid`/`jsdom` are not in `node_modules`, and `@mermaid-js/mermaid-cli` was rejected as too heavy (downloads a Chromium). A Node structural-lint script (fence balance + unquoted-specials check) was written but the Bash permission was **denied by the user**, so it did not run.
- Fallback: manual inspection — all node labels with specials are quoted, edges use `-- "text" -->` quoted form, subgraph titles quoted, standard `gantt` task syntax (`name :tag, id, start, duration`). These are conservative, well-supported constructs on GitHub's Mermaid version.
- **Not run / not needed:** `tsc --noEmit` and `jest` — no TypeScript was touched.
- ⚠️ Open item: eyeball the page on GitHub once pushed; if any diagram fails to render it will show as a raw code block — the two fixes above were the only risky spots.

## What Was NOT Changed (Still Works As Before)

- All previous session content in this file — preserved verbatim above the `---` separator
- All source code, tests, config, `.env.example`, dependencies — untouched
- The 10 pre-existing wiki pages except the two cross-link lines noted above
- `HANDOFF.md` — not touched (this file is the session log)
- The user's uncommitted WIP in the working tree (including the untracked `Ponytail_Examples.pptx`, `scratch_pptx/`, `extract_pptx.ps1`, `test_ppt.ps1`, `scratch_replace.js`, `logs.1786745341523.json` from earlier work)

## Commits This Session

None yet — docs-only working-tree changes alongside the prior uncommitted sessions. Suggested commit: `docs: add wiki Diagrams page (9 mermaid graphs) + Home/Architecture/README cross-links`.
