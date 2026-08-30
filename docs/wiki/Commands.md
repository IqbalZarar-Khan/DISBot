# Commands

All admin commands are subcommands of `/admin`, gated by `checkAdminPermission`
(`ROOT_ADMIN_ID` only) and default to ephemeral replies. Definitions live in
`src/commands/commandData.ts`; routing in `src/commands/admin/handler.ts`. Commands
auto-deploy on `ClientReady`, so a restart picks up changes.

## `/admin` subcommands

### Setup & mapping

| Command | Purpose |
|---|---|
| `/admin setup` | Interactive tier→channel mapping wizard with dropdowns |
| `/admin set-channel <tier_name> <channel>` | Map one tier to a channel |
| `/admin bulk-map` | Guided wizard to map all unmapped tiers |
| `/admin set-event-channel <event> <channel>` | Route member events: join, leave, upgrade, downgrade, pledge create/delete |
| `/admin set-message <type> <content>` | Edit templates: `post_new`, `post_waterfall`, `welcome`, `win_back`, `anniversary`. Placeholders: `{tier} {title} {url} {user} {pledge_amount} {post_snippet} {patron_count}` |
| `/admin sync-tiers` | Fetch tiers from Patreon into the DB (no restart needed) |
| `/admin set-owner <user>` | Transfer bot control to a new root admin |

### Diagnostics & analytics

| Command | Purpose |
|---|---|
| `/admin status` | Patreon API health, DB health, uptime, webhook + tier-detection stats (DB-backed counters that survive restarts) |
| `/admin stats` | Patron analytics: growth, tier distribution, activity |
| `/admin digest [days] [dm_admin]` | Generate and preview the patron community digest on-demand (custom lookback days & DM forward) |
| `/admin server-stats` | Live server CPU/memory/uptime (+PM2 where applicable) |
| `/admin debug-logs` | Last 50 X-Ray debug log entries |
| `/admin error-log [action] [severity] [count]` | Buffered errors with cause/fix explanations from the `explainError()` engine; `action: clear` resets |
| `/admin dashboard` | Generate a secure JWT link to the web analytics dashboard (`/dashboard`) |
| `/admin export-data` | CSV export of patron data to DMs (root admin) |

### Webhook audit & replay

| Command | Purpose |
|---|---|
| `/admin replay-webhook [action] [log_id] [hours] [limit]` | Audit + replay the `webhook_log` table — see [Webhook Pipeline](Webhook-Pipeline.md#replay-admin-replay-webhook) |

Actions: `view` (last 25 rows), `replay` (one row by `log_id`),
`replay-missed` (all unannounced rows in `hours`, configurable `limit` 1–50 with 300ms rate-limit pacing, hydrating post URLs from `tracked_posts`).

### Operations

| Command | Purpose |
|---|---|
| `/admin test-alert <tier_name> [template_type]` | Send a test announcement to a tier channel |
| `/admin poller <start|stop|status>` | Control the optional Patreon post poller (catches silent tier changes) |
| `/admin role-map <action> [tier_name] [role]` | Manage role sync: enable/disable, status, map tier→role |

## `/link`

Self-service command for patrons: link a Discord account to a Patreon membership using an
email, display name, or member id. Used by role sync to reconcile roles.

## Adding a New Command

1. Add the subcommand chain in `src/commands/commandData.ts`.
2. Create `src/commands/admin/<name>.ts` exporting
   `handle<Name>(interaction: ChatInputCommandInterface)` — start with
   `checkAdminPermission(interaction)` and `deferReply({ ephemeral: true })`.
3. Add the `case` in `src/commands/admin/handler.ts`.

Purely additive — see [Development](Development.md#extension-points).
