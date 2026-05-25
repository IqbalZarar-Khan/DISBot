/**
 * Webhook Cache
 *
 * Persists every inbound Patreon webhook to the `webhook_log` table
 * (Supabase) or a local SQLite table (fallback mode).
 *
 * This lets you audit *exactly* which webhooks arrived and whether they
 * triggered a Discord announcement — so "member joined but got no welcome"
 * situations can be investigated and replayed.
 *
 * Usage
 * -----
 *   // Log the webhook as soon as it passes signature verification
 *   const logId = await logWebhookReceived(eventType, payload);
 *
 *   // After the handler runs successfully, mark it processed
 *   await markWebhookProcessed(logId, announced);
 *
 *   // If the handler threw, the row stays processed=false for review
 */

import { getSupabase } from './supabase';
import { logger } from '../utils/logger';

// ── Supabase helpers ──────────────────────────────────────────────────────────

/**
 * Insert a new row into webhook_log and return its generated id.
 * Returns null if Supabase is unavailable (graceful degradation).
 */
export async function logWebhookReceived(
    eventType: string,
    payload: any
): Promise<number | null> {
    try {
        const supabase = getSupabase();

        const memberId: string | null = payload?.data?.id ?? null;

        const { data, error } = await supabase
            .from('webhook_log')
            .insert({
                event_type: eventType,
                member_id: memberId,
                payload,          // stored as JSONB
                processed: false,
                announced: false,
            })
            .select('id')
            .single();

        if (error) {
            // Table might not exist yet (pre-migration) — log but don't crash
            logger.warn(`📋 [WEBHOOK CACHE] Could not log webhook: ${error.message}`);
            return null;
        }

        logger.info(`📋 [WEBHOOK CACHE] Logged ${eventType} → row #${data.id} (member: ${memberId ?? 'n/a'})`);
        return data.id as number;
    } catch (err) {
        logger.warn(`📋 [WEBHOOK CACHE] Exception logging webhook`, err as Error);
        return null;
    }
}

/**
 * Mark a previously logged webhook row as fully processed.
 *
 * @param logId    - The id returned by logWebhookReceived
 * @param announced - true if a Discord message was sent, false otherwise
 * @param notes    - Optional debug notes to store alongside the row
 */
export async function markWebhookProcessed(
    logId: number | null,
    announced: boolean,
    notes?: string
): Promise<void> {
    if (logId === null) return; // Nothing to update (DB was unavailable)

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .from('webhook_log')
            .update({
                processed: true,
                announced,
                notes: notes ?? null,
            })
            .eq('id', logId);

        if (error) {
            logger.warn(`📋 [WEBHOOK CACHE] Could not mark #${logId} processed: ${error.message}`);
        } else {
            logger.info(`📋 [WEBHOOK CACHE] Row #${logId} marked processed (announced=${announced})`);
        }
    } catch (err) {
        logger.warn(`📋 [WEBHOOK CACHE] Exception marking #${logId} processed`, err as Error);
    }
}

/**
 * Fetch recent webhook_log rows that were NOT announced.
 * Useful for an admin audit command or startup recovery.
 *
 * @param limitHours - How many hours back to look (default 24)
 */
export async function getMissedAnnouncements(
    limitHours = 24
): Promise<WebhookLogRow[]> {
    try {
        const supabase = getSupabase();
        const since = new Date(Date.now() - limitHours * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('webhook_log')
            .select('*')
            .eq('processed', true)
            .eq('announced', false)
            .gte('received_at', since)
            .order('received_at', { ascending: false });

        if (error) {
            logger.warn(`📋 [WEBHOOK CACHE] Could not fetch missed announcements: ${error.message}`);
            return [];
        }

        return (data as WebhookLogRow[]) ?? [];
    } catch (err) {
        logger.warn(`📋 [WEBHOOK CACHE] Exception fetching missed announcements`, err as Error);
        return [];
    }
}

/**
 * Fetch recent webhook_log rows (all, for general audit).
 *
 * @param limit - Number of rows to return (default 50)
 */
export async function getRecentWebhookLogs(
    limit = 50
): Promise<WebhookLogRow[]> {
    try {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .from('webhook_log')
            .select('id, event_type, member_id, received_at, processed, announced, notes')
            .order('received_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.warn(`📋 [WEBHOOK CACHE] Could not fetch recent logs: ${error.message}`);
            return [];
        }

        return (data as WebhookLogRow[]) ?? [];
    } catch (err) {
        logger.warn(`📋 [WEBHOOK CACHE] Exception fetching recent logs`, err as Error);
        return [];
    }
}

// ── Type definition ───────────────────────────────────────────────────────────

export interface WebhookLogRow {
    id: number;
    event_type: string;
    member_id: string | null;
    payload?: any;
    received_at: string;
    processed: boolean;
    announced: boolean;
    notes: string | null;
}
