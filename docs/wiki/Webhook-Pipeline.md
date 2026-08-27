# Webhook Pipeline

The full lifecycle of a Patreon webhook, from HTTP ingress to Discord announcement — and back
again via replay.

## Ingestion (`POST /webhooks/patreon`)

```
1. Raw body capture     Fastify content-type parser stores rawBody (for HMAC) + parsed JSON
2. Signature verify     HMAC-MD5, timing-safe compare (src/webhooks/verify.ts)
                        → 401 on failure; nothing else runs
3. Webhook cache        logWebhookReceived() inserts a webhook_log row:
                        event_type, member_id, member_name, discord_user_id, dedup_hash, PII-redacted payload, processed=false
4. Dedup guard          isDuplicateAsync() checks:
                        1. Redis SETNX (60s TTL) for cross-instance coordination
                        2. Database webhook_log dedup_hash check (60s TTL, migration 015) when Redis is down
                        3. Local in-memory map (60s TTL) fallback
5. Ghost filter         update-events only: state fingerprint, 5min TTL — drops no-op updates
6. Dispatch             Redis up   → BullMQ enqueue (3 attempts, exp. backoff,
                                     concurrency 3, 10 jobs / 10s rate limit)
                        Redis down → direct routeWebhookEvent() in-process with 3x retry backoff
7. Acknowledge          200 { received: true } (or duplicate/ghost flags)
```

Steps 4–5 live in `src/webhooks/webhookFilters.ts` (extracted from `server.ts` so they can be
unit-tested; see `src/webhooks/__tests__/webhookFilters.test.ts`). The cleanup interval that
evicts expired entries is started by `startWebhookServer()`.

**Ghost filter state fields** — an update event is discarded only if *all* of these are
unchanged within 5 minutes:

- Posts: `title`, `min_cents_pledged_to_view`, sorted `access_rules` ids, `current_user_can_view`
- Members: `patron_status`, `currently_entitled_amount_cents`, first entitled tier id

## Routing (`src/webhooks/router.ts`)

A switch over the nine supported Patreon v2 event types. `SUPPORTED_WEBHOOK_EVENTS` is the
exported set — tooling (like replay) uses it to skip event types with no handler. Unknown
event types are logged and their `webhook_log` row gets marked with `processed=true, announced=false`
and the note `[UNSUPPORTED] No handler registered for event type: X` (filtered out by `getMissedAnnouncements`
so unsupported events do not pollute missed-announcement lists).

| Event | Handler | Returns |
|---|---|---|
| `members:create` | `members-create.ts` | `boolean` — welcome/welcome-back sent (any tier) |
| `members:update` | `members-update.ts` | `void` |
| `members:delete` | `members-delete.ts` | `void` |
| `members:pledge:create` | `members-pledge-create.ts` | `boolean` — welcome/upgrade sent |
| `members:pledge:update` | `members-pledge-update.ts` | `void` |
| `members:pledge:delete` | `members-pledge-delete.ts` | `void` |
| `posts:publish` | `posts-publish.ts` | `boolean` — ≥1 channel notified |
| `posts:update` | `posts-update.ts` | `void` |
| `posts:delete` | `posts-delete.ts` | `void` |

After the handler, the router calls `markWebhookProcessed(logId, announced, notes)` and
`recordWebhook(true)`; on a throw it marks `announced=false` with `Handler threw: <msg>` notes
and re-raises (the queue or direct-processing retry will retry).

## Member Event Semantics

Patreon v2 fires multiple events for one action — dedup between handlers is by design:

| Scenario | Events fired | Handling handler | Message |
|---|---|---|---|
| Free member joins | `members:create` | `members-create.ts` | 1× Welcome (Free) |
| Paid member joins directly | `members:create` + `members:pledge:create` | `members-create.ts` | 1× Welcome (paid tier) |
| Free → paid upgrade | `members:pledge:create` (+ `members:update`, `members:pledge:update`) | `members-pledge-create.ts` | 1× Upgrade |
| Paid → paid change | `members:update` + `members:pledge:update` | `members-pledge-update.ts` | 1× Upgrade/Downgrade |
| Departed member rejoins | any of `members:create` / `members:pledge:*` / `members:update` | first handler to see them (`welcomeGuard` dedupes) | 1× Welcome Back |
| Member leaves | `members:delete` | `members-delete.ts` | 1× Leave notice, row flagged `is_active=false` |

⚠️ **Invariants:**
- `members-create.ts` *preserves the old tier on upsert* for existing members.
  Overwriting it would break upgrade detection in `members-pledge-create.ts`, which compares
  `getTrackedMember().current_tier_id` against the webhook tier.
- Departed members stay in `tracked_members` (history for win-back/anniversary) with
  `is_active=false`; **every** member handler (create, pledge create/update, members:update)
  announces a **Welcome Back** when it sees them active again — no single webhook is trusted
  to carry the announcement. An in-memory welcome guard (`welcomeGuard.ts`) dedupes the
  near-simultaneous webhooks while batched writes flush.
- `getEventChannel` falls back: event-specific channel → `LOG_CHANNEL_ID` → the
  `member_join` channel, so an unconfigured upgrade channel can't silently drop an announcement.

## PII Redaction (`src/database/webhookCache.ts`)

Stored payloads are scrubbed before insert:

- **Identity keys** — `email`, `full_name`, `first_name`, `last_name`, `vanity`,
  `social_connections`, `discord_id`, `address`, `phone_number` → `[REDACTED]` on **every**
  record type.
- **User-only keys** — `url`, `image_url`, `thumb_url`, `image_small_url` → `[REDACTED]` only
  on `type === 'user'` records. Post/campaign URLs are public and are kept so payloads can be
  faithfully replayed.
- `member_name` is captured from the *raw* payload at log time (pre-redaction) into its own
  column.
- `discord_user_id` is extracted from raw `social_connections.discord.user_id` into its own
  column (migration 014), preserving Discord ID for replay win-back DMs without exposing it in the JSONB payload.

## Replay (`/admin replay-webhook`)

Any logged webhook can be re-dispatched through the normal router:

1. Fetch the row (`getWebhookLogById`, or `getMissedAnnouncements(hours)` for the
   `replay-missed` batch action — supports configurable `limit` up to 50 rows with 300ms inter-message
   rate-limit pacing). `getMissedAnnouncements` automatically skips rows tagged `[UNSUPPORTED]`.
2. `hydrateRedactedPayload()`:
   - Patches `full_name` back from `member_name` and restores `discord_user_id` into social connections.
   - Restores missing/redacted post URLs and titles from `tracked_posts` for legacy post events.
   - Emails stay redacted (not recoverable — by design).
3. `routeWebhookEvent(eventType, payload, row.id)` runs the live pipeline; the same row is
   updated (`processed`/`announced`) as if the webhook had just arrived.

Replays intentionally **bypass** the dedup/ghost filters (those guard HTTP ingress only) and
explicitly display `(⚠️ dedup/ghost filters bypassed)` in response embeds.

## Testing Webhooks Locally

```bash
# Requires WEBHOOK_SECRET in local .env to sign the payload
npm run test:webhook -- --event members:pledge:create --url https://<your-host>/webhooks/patreon
```

See also: [Tiers & Waterfall](Tiers-and-Waterfall.md) for what the post handlers do,
[Monitoring](Monitoring.md) for the audit/replay UI.
