# Diagrams

Visual graphs of how DISBot fits together, distilled from the other wiki pages. All diagrams
are [Mermaid](https://mermaid.js.org) and render natively on GitHub.

- [System overview](#system-overview) — one Node process, three jobs
- [Boot sequence](#boot-sequence) — why the port binds before Discord login
- [Webhook lifecycle](#webhook-lifecycle) — ingress to announcement
- [Event routing](#event-routing) — the nine Patreon events and their handlers
- [Tier detection cascade](#tier-detection-cascade) — five fallback layers
- [Waterfall release](#waterfall-release) — progressive unlock mechanics
- [Data access layers](#data-access-layers) — facade → Supabase / cache / SQLite
- [Module map](#module-map) — who lives where in `src/`

## System overview

One process runs a Discord gateway client, a Fastify webhook server, and background
schedulers. Redis/BullMQ is optional — without it, webhooks are processed in-process
(see [Architecture](Architecture.md)).

```mermaid
flowchart TB
    PAT["Patreon<br/>signed webhooks + OAuth API"]
    DISC["Discord<br/>channels · DMs · roles"]
    ROOT["Root admin<br/>/admin commands · /dashboard"]

    subgraph BOT["DISBot — single Node process (src/index.ts)"]
        direction TB

        subgraph WEB["Fastify server — src/webhooks/"]
            WH["POST /webhooks/patreon"]
            EP["/health · /metrics · /dashboard · /setup · /oauth/*"]
        end

        VER["verify.ts<br/>HMAC-MD5 timing-safe"]
        WLOG["webhookCache.logWebhookReceived<br/>PII-redacted row in webhook_log"]
        FILT["webhookFilters.ts<br/>dedup 60s + ghost 5min"]

        REDISQ{{"Redis up?"}}
        BULL["BullMQ queue + worker<br/>3 attempts · concurrency 3 · 10 jobs/10s"]
        DIRECT["Direct in-process processing"]

        ROUTE["router.ts<br/>switch over 9 event types"]
        HAND["handlers/<br/>members-* · posts-*"]

        subgraph UTILS["src/utils/"]
            TIER["tierRanking.ts<br/>tierIdMap · centsMap · tierRankings"]
            RSYNC["roleSync.ts"]
            SCHED["Schedulers<br/>weeklyDigest · anniversary · keyword · health"]
        end

        DJS["discord.js v14 client<br/>announcements · DMs · role reconciliation"]

        subgraph DBL["src/database/"]
            FACADE["db.ts facade"]
            SUPA[("Supabase Postgres<br/>via supabase-js")]
            SQL[("sqliteAdapter fallback")]
        end
    end

    PAT -- "signed webhook" --> WH
    WH --> VER
    VER -- "401 on bad signature" --> PAT
    VER --> WLOG --> FILT --> REDISQ
    REDISQ -- yes --> BULL --> ROUTE
    REDISQ -- no --> DIRECT --> ROUTE
    ROUTE --> HAND --> DJS --> DISC
    ROUTE -- "markWebhookProcessed" --> FACADE
    HAND --> FACADE
    FACADE --> SUPA
    FACADE --> SQL
    TIER -.-> HAND
    DJS --> RSYNC
    RSYNC --> DISC
    SCHED --> DJS
    SCHED --> FACADE
    ROOT --> DISC
```

## Boot sequence

Order matters: the HTTP port binds **before** the Discord gateway connects so cloud platforms
detect a healthy port during Discord's slow login (see [Architecture](Architecture.md#boot-sequence-srcindexts)).

```mermaid
flowchart TD
    B1["1 · config.ts — load env, parse/validate TIER_CONFIG<br/>missing core config → setup mode (web server + /setup wizard only)"]
    B1 --> B2["2 · initSupabase → autoMigrate (supabase/migrations 000–012) → connection test"]
    B2 --> B3["3 · initRedis (optional) → initWebhookQueue<br/>failure is non-fatal → direct processing"]
    B3 --> B4["4 · startBatchWriter — member upserts buffered into 5s flushes"]
    B4 --> B5["5 · startWebhookServer — binds port, mounts /setup + /dashboard,<br/>starts webhook-filter cleanup interval"]
    B5 --> B6["6 · loginWithRetry — exponential backoff (Cloudflare-blocked IPs)"]
    B6 --> B7["7 · ClientReady — BullMQ worker, slash-command deploy, DB cache init,<br/>diagnostic counters, OAuth scope check, schedulers,<br/>role reconciliation if DISCORD_ROLE_SYNC_ENABLED"]
```

## Webhook lifecycle

The full ingestion pipeline (see [Webhook Pipeline](Webhook-Pipeline.md)). Steps 4–5 live in
`webhookFilters.ts`; replays via `/admin replay-webhook` intentionally bypass them.

```mermaid
flowchart TD
    A(["Patreon POST /webhooks/patreon"]) --> B["Raw body capture<br/>rawBody for HMAC + parsed JSON"]
    B --> C{"Signature valid?<br/>HMAC-MD5 timing-safe"}
    C -- no --> C1["401 — nothing else runs"]
    C -- yes --> D["logWebhookReceived<br/>webhook_log row · PII-redacted · processed=false"]
    D --> E{"md5(event + body)<br/>seen in last 60s?"}
    E -- "yes (retry)" --> E1["200 duplicate=true — dropped"]
    E -- no --> F{"Update event with identical<br/>state fingerprint in last 5 min?"}
    F -- "yes (no-op)" --> F1["200 ghost=true — dropped"]
    F -- no --> G{{"Redis up?"}}
    G -- yes --> H["BullMQ enqueue<br/>3 attempts · exponential backoff<br/>concurrency 3 · 10 jobs/10s"]
    G -- no --> I["Direct routeWebhookEvent()"]
    H --> J["router.ts — switch(eventType)"]
    I --> J
    J --> K{"Handler<br/>registered?"}
    K -- no --> K1["Mark processed with note<br/>No handler registered for event type"]
    K -- yes --> L["Handler runs<br/>resolve tier · format DB template · announce"]
    L --> M{"Threw?"}
    M -- yes --> M1["announced=false · note Handler threw: …<br/>re-raise → queue retries"]
    M -- no --> N["markWebhookProcessed(logId, announced)<br/>recordWebhook(true)"]
```

## Event routing

Nine supported Patreon v2 events, one handler each (see
[Webhook Pipeline](Webhook-Pipeline.md#routing-src-webhooksrouterts)). Patreon fires multiple
events per action — handlers dedupe by design:

```mermaid
flowchart LR
    subgraph EVENTS["Patreon v2 events"]
        direction TB
        E1["members:create"]
        E2["members:update"]
        E3["members:delete"]
        E4["members:pledge:create"]
        E5["members:pledge:update"]
        E6["members:pledge:delete"]
        E7["posts:publish"]
        E8["posts:update"]
        E9["posts:delete"]
    end

    subgraph HANDLERS["src/webhooks/handlers/"]
        direction TB
        H1["members-create.ts<br/>welcome (free tier)"]
        H2["members-update.ts"]
        H3["members-delete.ts<br/>leave notice"]
        H4["members-pledge-create.ts<br/>welcome / upgrade"]
        H5["members-pledge-update.ts<br/>upgrade / downgrade"]
        H6["members-pledge-delete.ts<br/>win-back DM"]
        H7["posts-publish.ts<br/>tier cascade → announce"]
        H8["posts-update.ts<br/>waterfall check"]
        H9["posts-delete.ts"]
    end

    E1 --> H1
    E2 --> H2
    E3 --> H3
    E4 --> H4
    E5 --> H5
    E6 --> H6
    E7 --> H7
    E8 --> H8
    E9 --> H9
```

## Tier detection cascade

`posts-publish.ts` resolves a post's tier through five increasingly desperate layers; every
fallback DMs the admin a warning so silent misrouting stays visible (see
[Tiers & Waterfall](Tiers-and-Waterfall.md#tier-detection-cascade-posts)). Member events use
a similar three-layer resolution: `included[]` → `tierIdMap` → `centsMap`.

```mermaid
flowchart TD
    START(["posts:publish needs a tier"])

    subgraph CASCADE["Tier detection cascade"]
        direction TB
        L1["1 · data.attributes.tiers"]
        L2["2 · access_rules ids → tierIdMap"]
        L3["3 · relationships.tiers → tierIdMap"]
        L4["4 · min_cents_pledged_to_view<br/>currencyHelper → centsMap"]
        L5["5 · title match vs tier names in included[]"]
        L1 -- miss --> L2
        L2 -- miss --> L3
        L3 -- miss --> L4
        L4 -- miss --> L5
    end

    START --> L1
    L1 -- hit --> OK["Tier resolved"]
    L2 -- hit --> OK
    L3 -- hit --> OK
    L4 -- hit --> OK
    L5 -- hit --> OK
    L5 -- miss --> FALL["Fallback ranks<br/>Diamond 100 · Gold 75 · Silver 50 · Bronze 25 · Free 0"]
```

## Waterfall release

A chapter goes live for the top tier first, then progressively unlocks for cheaper tiers as
the creator lowers the requirement. Posts are tracked against their **lowest** accessible tier;
only tiers that were *added* get a waterfall announcement (see
[Tiers & Waterfall](Tiers-and-Waterfall.md#waterfall-release)).

```mermaid
flowchart TD
    PUB["posts:publish"] --> TRACK["Save to tracked_posts against the<br/>LOWEST accessible tier (widest audience)"]
    TRACK --> SINGLE{"Tiers resolved"}
    SINGLE -- "single tier" --> STD["STANDARD announcement (post_new)<br/>to that tier's mapped channel"]
    SINGLE -- "multiple tiers" --> BCAST["BROADCAST (post_new)<br/>to ALL mapped channels at once"]
    UPD["posts:update<br/>creator lowers the tier requirement"] --> WF{"isWaterfall(oldRank, newRank)?<br/>rank decreased"}
    WF -- no --> NOOP["No newly unlocked tiers — silent"]
    WF -- yes --> DIFF["Compute tiers that were ADDED<br/>(already-unlocked tiers not re-notified)"]
    DIFF --> WA["Waterfall announcement (post_waterfall)<br/>for each newly unlocked tier"]
    REPUB["posts:publish for an already-tracked post"] --> REDIR["Treated as Edit-and-Republish<br/>→ routed through the update path"]
    REDIR --> UPD
```

Example unlock schedule for a five-tier `TIER_CONFIG`:

```mermaid
gantt
    title Example waterfall schedule (ranks from TIER_CONFIG)
    dateFormat YYYY-MM-DD
    axisFormat %b %d
    section Audience unlocks
    Diamond rank 100 day 1   :active, t1, 2026-01-01, 3d
    Gold rank 75 day 4       :t2, 2026-01-04, 3d
    Silver rank 50 day 7     :t3, 2026-01-07, 3d
    Bronze rank 25 day 10    :t4, 2026-01-10, 3d
    Free rank 0 day 13       :t5, 2026-01-13, 3d
```

## Data access layers

Everything goes through the `db.ts` facade — handlers never touch a client directly (see
[Database](Database.md#access-layers)).

```mermaid
flowchart TD
    CONSUMERS["Handlers · commands · schedulers"] --> FACADE["db.ts<br/>facade + CRUD helpers"]
    PG[("Supabase Postgres<br/>tracked_posts · tracked_members · tier_mappings ·<br/>role_mappings · custom_messages · bot_config · webhook_log")]
    FACADE --> SUPA["supabase.ts<br/>client singleton (Postgres via REST)"]
    FACADE --> CACHE["dbCache.ts<br/>in-memory warm reads<br/>tier mappings · config · templates"]
    FACADE --> BATCH["batchWriter.ts<br/>5s-buffered member upserts"]
    FACADE --> SQL["sqliteAdapter.ts<br/>local/offline fallback"]
    MIG["autoMigrate.ts<br/>applies supabase/migrations at boot"] --> PG
    SUPA --> PG
    SQL --> PG2[("Local SQLite mirror")]
```

## Module map

Where things live under `src/` (see [Architecture](Architecture.md#module-responsibilities)
for the responsibility table):

```mermaid
flowchart LR
    INDEX["src/index.ts<br/>boot orchestration"]
    CONFIG["src/config.ts<br/>env + TIER_CONFIG validation"]

    subgraph WEBHOOKS["src/webhooks/"]
        SERVER["server.ts — HTTP endpoints"]
        VERIFY["verify.ts"]
        FILTERS["webhookFilters.ts"]
        ROUTER["router.ts"]
        HANDLERS["handlers/ — one file per event"]
        DASH["dashboard + setup wizard"]
    end

    subgraph COMMANDS["src/commands/"]
        CMDDEF["commandData.ts"]
        ADMINH["admin/handler.ts + subcommand files"]
    end

    subgraph DATABASE["src/database/"]
        SUPA["supabase.ts · db.ts"]
        DBCACHE["dbCache · batchWriter · webhookCache"]
        SQLITE["sqliteAdapter.ts"]
        MIGR["autoMigrate.ts"]
    end

    QUEUE["src/queue/<br/>BullMQ queue + worker"]

    subgraph UTILS["src/utils/"]
        TIER["tierRanking"]
        FMT["embedBuilder · chapterFormatter · formatters"]
        LOGG["logger + explainError"]
        SYNC["roleSync"]
        SCHED["weeklyDigest · anniversaryChecker · keywordDetector · poller"]
        PATC["patreonClient · patreonPoller"]
        I18N["i18n · locales"]
    end

    SQLMIG["supabase/migrations/"]

    INDEX --> CONFIG
    INDEX --> SERVER
    INDEX --> SUPA
    INDEX --> QUEUE
    SERVER --> VERIFY
    SERVER --> FILTERS
    SERVER --> ROUTER
    QUEUE --> ROUTER
    ROUTER --> HANDLERS
    HANDLERS --> TIER
    HANDLERS --> FMT
    HANDLERS --> SUPA
    HANDLERS --> DBCACHE
    CMDDEF --> ADMINH
    ADMINH --> SUPA
    SCHED --> SUPA
    SCHED --> LOGG
    SYNC --> SUPA
    PATC --> CONFIG
    SQLMIG --> MIGR
```
