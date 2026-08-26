import * as crypto from 'crypto';

/**
 * Inbound webhook filters: idempotency guard + ghost-event detection.
 *
 * Extracted from server.ts so the filter logic can be unit-tested without
 * bootstrapping the Fastify server. The cleanup interval is started
 * explicitly by startWebhookServer() rather than at import time.
 *
 * Dedup hierarchy:
 *   1. Redis SETNX (cross-instance, when Redis is connected)
 *   2. Local in-memory Map (single-instance fallback)
 */

// ── Webhook idempotency guard ──────────────────────────────────────
// Prevents duplicate notifications when Patreon retries the same webhook.
const DEDUP_TTL_MS = 60_000; // 60 seconds
const DEDUP_TTL_SECONDS = 60; // Redis TTL in seconds
const recentWebhooks = new Map<string, number>(); // hash → timestamp

// ── Ghost webhook filter ───────────────────────────────────────────
// Discards webhooks where the meaningful state hasn't changed.
const GHOST_TTL_MS = 5 * 60_000; // 5 minutes
const recentStates = new Map<string, number>(); // stateHash → timestamp

// Clean expired entries every 5 minutes
let cleanupTimer: NodeJS.Timeout | null = null;

export function startFilterCleanupInterval(): void {
    if (cleanupTimer) return; // Already running

    cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [hash, ts] of recentWebhooks) {
            if (now - ts > DEDUP_TTL_MS) recentWebhooks.delete(hash);
        }
        for (const [hash, ts] of recentStates) {
            if (now - ts > GHOST_TTL_MS) recentStates.delete(hash);
        }
    }, 5 * 60_000);
}

export function stopFilterCleanupInterval(): void {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
}

/**
 * Reset all filter state (test helper — also safe to call at runtime).
 */
export function clearFilterState(): void {
    recentWebhooks.clear();
    recentStates.clear();
}

/**
 * Check for duplicate webhooks using Redis SETNX for cross-instance
 * coordination, with local memory as a fallback.
 */
export async function isDuplicateAsync(body: string, eventType: string): Promise<boolean> {
    const hash = crypto.createHash('md5').update(eventType + body).digest('hex');
    const redisKey = `disbot:dedup:${hash}`;

    // Try Redis first for cross-instance dedup
    try {
        const { getRedis, isRedisConnected } = await import('../database/redis');
        if (isRedisConnected()) {
            const redis = getRedis()!;
            // SETNX returns 'OK' if the key was set (first time), null if it already existed
            const result = await redis.set(redisKey, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
            if (result === null) {
                return true; // Key already existed → duplicate
            }
            return false; // Key set successfully → first time
        }
    } catch {
        // Redis unavailable — fall through to database
    }

    // Try Database (PostgreSQL/Supabase) for cross-instance deduplication when Redis is absent
    try {
        const { getSupabase } = await import('../database/supabase');
        const supabase = getSupabase();
        const sixtySecondsAgo = new Date(Date.now() - DEDUP_TTL_MS).toISOString();
        const { data } = await supabase
            .from('webhook_log')
            .select('id')
            .eq('dedup_hash', hash)
            .gte('received_at', sixtySecondsAgo)
            .limit(1);

        if (data && data.length > 0) {
            return true; // Found matching recent event in DB across cluster
        }
    } catch {
        // Database check failed — fall through to local memory
    }

    // Local memory fallback (single-instance only)
    return isDuplicate(body, eventType);
}

export function isDuplicate(body: string, eventType: string): boolean {
    const hash = crypto.createHash('md5').update(eventType + body).digest('hex');
    const now = Date.now();
    const lastSeen = recentWebhooks.get(hash);
    if (lastSeen && now - lastSeen < DEDUP_TTL_MS) return true;
    recentWebhooks.set(hash, now);
    return false;
}

/**
 * Ghost webhook filter: checks if the meaningful state actually changed.
 * Returns true if the webhook should be silently discarded.
 */
export function isGhostWebhook(payload: any, eventType: string): boolean {
    // Only filter update events — creates/deletes always matter
    if (!eventType.includes('update')) return false;

    try {
        const data = payload?.data;
        if (!data) return false;

        // Build a state fingerprint from meaningful fields only
        const attrs = data.attributes || {};
        const rels = data.relationships || {};

        const stateFields: Record<string, any> = {
            id: data.id,
            event: eventType,
        };

        // Post-relevant fields
        if (eventType.includes('post')) {
            stateFields.title = attrs.title;
            stateFields.min_cents = attrs.min_cents_pledged_to_view;
            stateFields.tiers = rels?.access_rules?.data?.map((r: any) => r.id).sort() || [];
            stateFields.status = attrs.current_user_can_view;
        }

        // Member-relevant fields
        if (eventType.includes('member') || eventType.includes('pledge')) {
            stateFields.patron_status = attrs.patron_status;
            stateFields.pledge_amount = attrs.currently_entitled_amount_cents;
            stateFields.tier = rels?.currently_entitled_tiers?.data?.[0]?.id;
        }

        const stateHash = crypto.createHash('md5')
            .update(JSON.stringify(stateFields))
            .digest('hex');

        const now = Date.now();
        const lastSeen = recentStates.get(stateHash);
        if (lastSeen && now - lastSeen < GHOST_TTL_MS) {
            return true; // Same state within window → ghost webhook
        }
        recentStates.set(stateHash, now);
        return false;
    } catch {
        return false; // On any error, let the webhook through
    }
}
