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

// ── Weekly digest helpers ─────────────────────────────────────────────────────

export interface CancellationRecord {
    memberName: string;
    memberId: string | null;
    cancelledAt: string;
}

export interface TierChangeRecord {
    memberName: string;
    memberId: string | null;
    oldTier: string;
    newTier: string;
    changedAt: string;
}

/**
 * Fetch all cancellation events from the past N days.
 * Covers both members:delete and members:pledge:delete.
 */
export async function getWeeklyCancellations(
    days = 7
): Promise<CancellationRecord[]> {
    try {
        const supabase = getSupabase();
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('webhook_log')
            .select('event_type, member_id, payload, received_at')
            .in('event_type', ['members:delete', 'members:pledge:delete'])
            .gte('received_at', since)
            .order('received_at', { ascending: false });

        if (error) {
            logger.warn(`📋 [WEBHOOK CACHE] Could not fetch cancellations: ${error.message}`);
            return [];
        }

        const records: CancellationRecord[] = [];
        const seenMembers = new Set<string>();

        for (const row of data || []) {
            const name = extractMemberName(row.payload, row.event_type);
            const memberId = row.member_id;
            // Deduplicate by member_id (a cancel can fire both events)
            const key = memberId || name;
            if (seenMembers.has(key)) continue;
            seenMembers.add(key);

            records.push({
                memberName: name,
                memberId: memberId,
                cancelledAt: row.received_at,
            });
        }

        return records;
    } catch (err) {
        logger.warn(`📋 [WEBHOOK CACHE] Exception fetching cancellations`, err as Error);
        return [];
    }
}

/**
 * Fetch all tier-change events from the past N days.
 * Covers both members:update and members:pledge:update where the tier actually changed.
 */
export async function getWeeklyTierChanges(
    days = 7
): Promise<TierChangeRecord[]> {
    try {
        const supabase = getSupabase();
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('webhook_log')
            .select('event_type, member_id, payload, received_at')
            .in('event_type', ['members:update', 'members:pledge:update'])
            .gte('received_at', since)
            .order('received_at', { ascending: false });

        if (error) {
            logger.warn(`📋 [WEBHOOK CACHE] Could not fetch tier changes: ${error.message}`);
            return [];
        }

        const records: TierChangeRecord[] = [];

        for (const row of data || []) {
            const name = extractMemberName(row.payload, row.event_type);
            const { oldTier, newTier } = extractTierChange(row.payload, row.event_type);

            // Only include if there was an actual tier change
            if (oldTier && newTier && oldTier !== newTier) {
                records.push({
                    memberName: name,
                    memberId: row.member_id,
                    oldTier,
                    newTier,
                    changedAt: row.received_at,
                });
            }
        }

        return records;
    } catch (err) {
        logger.warn(`📋 [WEBHOOK CACHE] Exception fetching tier changes`, err as Error);
        return [];
    }
}

/**
 * Extract the member name from a webhook payload.
 * Handles both members:* (name in data.attributes) and members:pledge:* (name in included[]).
 */
function extractMemberName(payload: any, eventType: string): string {
    if (!payload) return 'Unknown';

    // members:delete / members:update → data.attributes.full_name
    if (eventType.startsWith('members:') && !eventType.includes('pledge')) {
        return payload.data?.attributes?.full_name || 'Unknown';
    }

    // members:pledge:* → look in included[] for the user/patron
    const included = payload.included || [];
    const patronRef = payload.data?.relationships?.patron?.data;
    if (patronRef) {
        const userRecord = included.find(
            (item: any) => item.type === 'user' && item.id === patronRef.id
        );
        if (userRecord?.attributes?.full_name) {
            return userRecord.attributes.full_name;
        }
    }

    // Fallback: search any user type in included
    const anyUser = included.find((item: any) => item.type === 'user');
    return anyUser?.attributes?.full_name || 'Unknown';
}

/**
 * Extract old/new tier names from a webhook payload.
 * For pledge:update, the new tier is in relationships.tier; the old tier isn't
 * directly in the payload, so we store what we can.  The notes field or the
 * tracked_members table can supplement this later.
 */
function extractTierChange(payload: any, eventType: string): { oldTier: string; newTier: string } {
    if (!payload) return { oldTier: '', newTier: '' };

    const included = payload.included || [];

    if (eventType === 'members:pledge:update') {
        const tierRef = payload.data?.relationships?.tier?.data;
        let newTier = 'Free';
        if (tierRef) {
            const tierInfo = included.find(
                (item: any) => item.type === 'tier' && item.id === tierRef.id
            );
            newTier = tierInfo?.attributes?.title || 'Unknown Tier';
        }
        // The old tier isn't in the webhook payload — use notes field if available
        const notes: string = payload._digest_old_tier || '';
        return { oldTier: notes || 'Previous Tier', newTier };
    }

    if (eventType === 'members:update') {
        const tierData = payload.data?.relationships?.currently_entitled_tiers?.data || [];
        let newTier = 'Free';
        if (tierData.length > 0) {
            const tierInfo = included.find(
                (item: any) => item.type === 'tier' && item.id === tierData[0].id
            );
            newTier = tierInfo?.attributes?.title || 'Unknown Tier';
        }
        return { oldTier: 'Previous Tier', newTier };
    }

    return { oldTier: '', newTier: '' };
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
