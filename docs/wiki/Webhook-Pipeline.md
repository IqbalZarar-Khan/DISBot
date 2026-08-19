# Webhook Pipeline

The full lifecycle of a Patreon webhook, from HTTP ingress to Discord announcement — and back
again via replay.

## Ingestion (`POST /webhooks/patreon`)

```
1. Raw body capture     Fastify content-type parser stores rawBody (for HMAC) + parsed JSON
2. Signature verify     HMAC-MD5, timing-safe compare (src/webhooks/verify.ts)
                        → 401 on failure; nothing else runs
3. Webhook cache        logWebhookReceived() inserts a webhook_log row:
                        event_type, member_id, PII-redacted payload, processed=false
4. Dedup guard          md5(event + body), 60s TTL — drops Patreon retries
5. Ghost filter         update-events only: state fingerprint, 5min TTL — drops no-op updates
6. Dispatch             Redis up   → BullMQ enqueue (3 attempts, exp. backoff,
                                     concurrency 3, 10 jobs / 10s rate limit)
                        Redis down → direct routeWebhookEvent() in-process
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
event types are logged and their `webhook_log` row gets the note
`No handler registered for event type: X` (distinct from a handler failure).

| Event | Handler | Returns |
|---|---|---|
| `members:create` | `members-create.ts` | `boolean` — welcome sent (free tier only) |
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
and re-raises (the queue will retry).

> Known gap (see HANDOFF notes): handlers returning `void` are recorded as `announced=false`.
> The router tolerates this; upgrading those signatures is a safe, incremental improvement.

## Member Event Semantics

Patreon v2 fires multiple events for one action — dedup between handlers is by design:

| Scenario | Events fired | Handling handler | Message |
|---|---|---|---|
| Free member joins | `members:create` | `members-create.ts` | 1× Welcome (Free) |
| Paid member joins | `members:create` + `members:pledge:create` | `members-pledge-create.ts` | 1× Welcome (paid tier) |
| Free → paid upgrade | `members:create` + `members:pledge:create` | `members-pledge-create.ts` | 1× Upgrade |
| Paid → paid change | `members:update` + `members:pledge:update` | `members-pledge-update.ts` | 1× Upgrade/Downgrade |
| Member leaves | `members:delete` | `members-delete.ts` | 1× Leave notice |

⚠️ **Invariant:** `members-create.ts` *preserves the old tier on upsert* for existing members.
Overwriting it would break upgrade detection in `members-pledge-create.ts`, which compares
`getTrackedMember().current_tier_id` against the webhook tier.

## PII Redaction (`src/database/webhookCache.ts`)

Stored payloads are scrubbed before insert:

- **Identity keys** — `email`, `full_name`, `first_name`, `last_name`, `vanity`,
  `social_connections`, `discord_id`, `address`, `phone_number` → `[REDACTED]` on **every**
  record type.
- **User-only keys** — `url`, `image_url`, `thumb_url`, `image_small_url` → `[REDACTED]` only
  on `type === 'user'` records. Post/campaign URLs are public and are kept so payloads can be
  faithfully replayed.
- `member_name` is captured from the *raw* payload at log time (pre-redaction) into its own
  column — this is what replay uses to restore display names.

## Replay (`/admin replay-webhook`)

Any logged webhook can be re-dispatched through the normal router:

1. Fetch the row (`getWebhookLogById`, or `getMissedAnnouncements(hours)` for the
   `replay-missed` batch action — capped at 10 per invocation since replays send real
   Discord messages).
2. `hydrateRedactedNames()` patches `full_name` back from the `member_name` column.
   Emails/Discord ids are unrecoverable by design — e.g. a replayed `pledge:delete` produces
   the channel notice, not the win-back DM.
3. `routeWebhookEvent(eventType, payload, row.id)` runs the live pipeline; the same row is
   updated (`processed`/`announced`) as if the webhook had just arrived.

Replays intentionally **bypass** the dedup/ghost filters (those guard HTTP ingress only).
Rows logged before redaction was scoped still carry `[REDACTED]` post URLs — the command
detects and warns about such legacy rows.

## Testing Webhooks Locally

```bash
# Requires WEBHOOK_SECRET in local .env to sign the payload
npm run test:webhook -- --event members:pledge:create --url https://<your-host>/webhooks/patreon
```

See also: [Tiers & Waterfall](Tiers-and-Waterfall.md) for what the post handlers do,
[Monitoring](Monitoring.md) for the audit/replay UI.
