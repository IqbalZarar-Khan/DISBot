# Tiers & Waterfall

The tier system is the heart of DISBot: every post and member is resolved to a tier, tiers map
to Discord channels, and the waterfall schedules when each audience gets access.

## Tier Model

Defined in `TIER_CONFIG` (see [Configuration](Configuration.md)). Three lookup maps are built
at boot in `src/utils/tierRanking.ts`:

- `tierIdMap` — Patreon tier id → tier name
- `tierRankings` — tier name → rank (higher = more exclusive)
- `centsMap` — pledge amount (cents) → tier name

Fallbacks for unresolved names: `Diamond 100 · Gold 75 · Silver 50 · Bronze 25 · Free 0`.
Name lookups are case-insensitive and tolerate trailing dots (Patreon title artifacts).

## Tier Detection Cascade (posts)

`posts-publish.ts` resolves a post's tier through increasingly desperate layers; each fallback
DMs the admin a warning so silent misrouting is visible:

1. `data.attributes.tiers` — direct tier references
2. `data.relationships.access_rules` — access rule ids → `tierIdMap`
3. `data.relationships.tiers` — relationship tier ids → `tierIdMap`
4. `attributes.min_cents_pledged_to_view` — normalized by `currencyHelper` against `centsMap`
5. Title match against tier names found in `included[]`

Member events (`members-pledge-create.ts` etc.) use a similar three-layer resolution:
`included[]` → `tierIdMap` → `centsMap`.

## Hybrid Broadcast

- **Single tier** → STANDARD announcement to that tier's mapped channel.
- **Multiple tiers** → BROADCAST: announce to *all* mapped channels at once.

Messages are formatted from DB templates (`custom_messages`, edited via `/admin set-message`)
with placeholders `{tier} {title} {url} {user} {pledge_amount} {post_snippet} {patron_count}`.
Embeds get chapter-aware formatting from `chapterFormatter.ts` (spoiler-tagged synopses,
chapter badges — covered by unit tests).

## Waterfall Release

The strategy: a chapter goes live for the **top tier first**, then progressively unlocks for
cheaper tiers over the following days. Mechanically:

1. On `posts:publish`, the post is saved in `tracked_posts` against its **lowest** accessible
   tier (widest eventual audience).
2. When the creator later lowers the post's tier requirement, `posts:update` computes the newly
   accessible lowest tier (`isWaterfall(oldRank, newRank)` — true when rank *decreases*).
3. Only tiers that were **added** get a waterfall announcement (`post_waterfall` template) —
   tiers that already had access are not re-notified.
4. If a `posts:publish` arrives for an already-tracked post, it's treated as
   "Edit and Republish" and redirected through the update (waterfall) path.

Rank sanity is strictly enforced: `src/config.ts` **aborts at boot (`process.exit(1)`)** when a cheaper tier outranks a more
expensive one (bypassable via `ALLOW_RANK_INVERSION=true`). Furthermore, `posts:update` resolves the target tier via `getWidestAudienceTier()` using both rank and cents cost to mathematically prevent premium content leaks.

## Role Sync

With `DISCORD_ROLE_SYNC_ENABLED=true`, `src/utils/roleSync.ts` maps tiers to Discord roles
(`role_mappings`, managed via `/admin role-map`) and reconciles on every member event plus a
full reconciliation at boot. Members self-link via `/link <patreon email | display name | member id>`.

## Where to Look

| Concern | File |
|---|---|
| Ranks, maps, comparisons | `src/utils/tierRanking.ts` |
| Post tier cascade | `src/webhooks/handlers/posts-publish.ts` |
| Waterfall updates | `src/webhooks/handlers/posts-update.ts` |
| Member tier resolution | `src/webhooks/handlers/members-pledge-create.ts` |
| Currency normalization | `src/utils/currencyHelper.ts` |
| Embed building | `src/utils/embedBuilder.ts` |
