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
import * as crypto from 'crypto';

// ── PII redaction ─────────────────────────────────────────────────────────────

/**
 * Identity fields that are stripped from every record type before persisting.
 */
const IDENTITY_KEYS = new Set([
    'email',
    'full_name',
    'first_name',
    'last_name',
    'vanity',
    'social_connections',
    'discord_id',        // PII — the mapping is stored elsewhere
    'address',           // Sometimes present for physical-reward tiers
    'phone_number',
]);

/**
 * URL/image fields that are only stripped from `user` records (profile
 * links/avatars are personal data). Post and campaign URLs are public and
 * are kept so stored payloads can be faithfully replayed.
 */
const USER_ONLY_KEYS = new Set([
    'url',
    'image_url',
    'thumb_url',
    'image_small_url',
]);

/**
 * Deep-clone a webhook payload and replace sensitive fields with '[REDACTED]'.
 * Identity fields are scrubbed everywhere; URL/image fields only on user records.
 */
function redactPayload(payload: any): any {
    if (!payload) return payload;
    try {
        const clone = JSON.parse(JSON.stringify(payload));

        function scrub(obj: any): void {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) { obj.forEach(scrub); return; }

            // Scrub attributes at the current level
            if (obj.attributes && typeof obj.attributes === 'object') {
                const isUserRecord = obj.type === 'user';
                for (const key of Object.keys(obj.attributes)) {
                    if (IDENTITY_KEYS.has(key) || (isUserRecord && USER_ONLY_KEYS.has(key))) {
                        obj.attributes[key] = '[REDACTED]';
                    }
                }
            }

            // Recurse into nested objects (e.g. `included[]`)
            for (const val of Object.values(obj)) {
                if (val && typeof val === 'object') scrub(val);
            }
        }

        scrub(clone);
        return clone;
    } catch {
        // If cloning fails, return a stub rather than the raw PII payload
        return { _redaction_error: true };
    }
}

/**
 * Extract Discord user ID from raw payload before PII redaction.
 * Looks in included[].attributes.social_connections.discord.user_id
 */
function extractDiscordUserId(payload: any): string | null {
    try {
        const included = payload?.included || [];
        for (const item of included) {
            const discordConn = item?.attributes?.social_connections?.discord;
            if (discordConn?.user_id) {
                return discordConn.user_id;
            }
        }
        // Also check data.attributes.social_connections
        const dataDiscord = payload?.data?.attributes?.social_connections?.discord;
        if (dataDiscord?.user_id) {
            return dataDiscord.user_id;
        }
    } catch {
        // Non-critical extraction
    }
    return null;
}

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

        // Only extract member name for member-related events (tier changes,
        // cancellations, pledge joins). Post events don't carry member data
        // and should not attempt to write the member_name column.
        const isMemberEvent = eventType.startsWith('members:');

        // Redact PII before persisting
        const safePayload = redactPayload(payload);

        // Extract Discord user ID before it gets scrubbed
        const discordUserId = extractDiscordUserId(payload);

        // Compute idempotency dedup hash for cross-instance coordination
        const dedupHash = crypto.createHash('md5').update(eventType + JSON.stringify(payload)).digest('hex');

        // Build the row dynamically — only include member_name for member
        // events so post:update / post:publish don't break if the column
        // hasn't been migrated yet, and don't store meaningless nulls.
        const row: Record<string, any> = {
            event_type: eventType,
            member_id: memberId,
            payload: safePayload,   // stored as JSONB — PII stripped
            processed: false,
            announced: false,
            discord_user_id: discordUserId,
            dedup_hash: dedupHash,
        };

        if (isMemberEvent) {
            row.member_name = extractMemberNameFromPayload(payload, eventType) || null;
        }

        const { data, error } = await supabase
            .from('webhook_log')
            .insert(row)
            .select('id')
            .single();

        if (error) {
            // Table might not exist yet (pre-migration) — log but don't crash
            logger.warn(`📋 [WEBHOOK CACHE] Could not log webhook: ${error.message}`);
            return null;
        }

        logger.info(`📋 [WEBHOOK CACHE] Logged ${eventType} → row #${data.id}${isMemberEvent ? ` (member: ${memberId ?? 'n/a'})` : ''}`);
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
            .not('notes', 'like', '[UNSUPPORTED]%')
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
 * Fetch a single webhook_log row by id (full row, including payload).
 * Used by the replay command to re-dispatch a specific entry.
 */
export async function getWebhookLogById(id: number): Promise<WebhookLogRow | null> {
    try {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .from('webhook_log')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            logger.warn(`📋 [WEBHOOK CACHE] Could not fetch webhook log #${id}: ${error.message}`);
            return null;
        }

        return (data as WebhookLogRow) ?? null;
    } catch (err) {
        logger.warn(`📋 [WEBHOOK CACHE] Exception fetching webhook log #${id}`, err as Error);
        return null;
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

        // Only select lightweight columns — avoid fetching the full JSONB payload
        const { data, error } = await supabase
            .from('webhook_log')
            .select('event_type, member_id, member_name, received_at')
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
            const name = row.member_name || 'Unknown';
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

        // Only select lightweight columns — avoid fetching the full JSONB payload
        const { data, error } = await supabase
            .from('webhook_log')
            .select('event_type, member_id, member_name, notes, received_at')
            .in('event_type', ['members:update', 'members:pledge:update'])
            .gte('received_at', since)
            .order('received_at', { ascending: false });

        if (error) {
            logger.warn(`📋 [WEBHOOK CACHE] Could not fetch tier changes: ${error.message}`);
            return [];
        }

        const records: TierChangeRecord[] = [];

        for (const row of data || []) {
            const name = row.member_name || 'Unknown';

            // Tier change info is stored in notes as "oldTier → newTier" by
            // markWebhookProcessed when available. Fall back gracefully.
            let oldTier = '';
            let newTier = '';
            if (row.notes && row.notes.includes('→')) {
                const parts = row.notes.split('→').map((s: string) => s.trim());
                oldTier = parts[0] || '';
                newTier = parts[1] || '';
            }

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

export interface PaidJoinRecord {
    memberName: string;
    memberId: string | null;
    tierName?: string;
    joinedAt: string;
}

/**
 * Fetch all paid pledge join events (members:pledge:create) from the past N days.
 */
export async function getWeeklyPaidJoined(
    days = 7
): Promise<PaidJoinRecord[]> {
    try {
        const supabase = getSupabase();
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('webhook_log')
            .select('event_type, member_id, member_name, notes, received_at')
            .eq('event_type', 'members:pledge:create')
            .gte('received_at', since)
            .order('received_at', { ascending: false });

        if (error) {
            logger.warn(`📋 [WEBHOOK CACHE] Could not fetch paid joins from webhook_log: ${error.message}`);
            return [];
        }

        const records: PaidJoinRecord[] = [];
        const seenMembers = new Set<string>();

        for (const row of data || []) {
            const name = row.member_name || 'Unknown';
            const memberId = row.member_id;
            const key = memberId || name;
            if (seenMembers.has(key)) continue;
            seenMembers.add(key);

            let tierName = '';
            if (row.notes) {
                // If notes contains "Welcome sent for <Tier>" or similar
                const match = row.notes.match(/for\s+([A-Za-z0-9_\-\s]+)/i);
                if (match && match[1]) {
                    tierName = match[1].trim();
                }
            }

            records.push({
                memberName: name,
                memberId: memberId,
                tierName: tierName || undefined,
                joinedAt: row.received_at,
            });
        }

        return records;
    } catch (err) {
        logger.warn(`📋 [WEBHOOK CACHE] Exception fetching paid joins`, err as Error);
        return [];
    }
}

/**
 * Extract the member name from a raw webhook payload at log-time.
 * This runs on the raw (pre-redaction) payload so full_name is still available.
 */
function extractMemberNameFromPayload(payload: any, _eventType?: string): string {
    if (!payload) return 'Unknown';

    // 1. Direct attribute on data (common in Patreon v2 member and pledge payloads)
    if (payload.data?.attributes?.full_name) {
        return payload.data.attributes.full_name;
    }

    // 2. User or patron reference in relationships
    const included = payload.included || [];
    const userRef = payload.data?.relationships?.user?.data || payload.data?.relationships?.patron?.data;
    if (userRef) {
        const userRecord = included.find(
            (item: any) => item.type === 'user' && item.id === userRef.id
        );
        if (userRecord?.attributes?.full_name) {
            return userRecord.attributes.full_name;
        }
    }

    // 3. Search any user type in included
    const anyUser = included.find((item: any) => item.type === 'user' && item.attributes?.full_name);
    if (anyUser?.attributes?.full_name) {
        return anyUser.attributes.full_name;
    }

    // 4. Search any member type in included
    const anyMember = included.find((item: any) => item.type === 'member' && item.attributes?.full_name);
    if (anyMember?.attributes?.full_name) {
        return anyMember.attributes.full_name;
    }

    return 'Unknown';
}

// ── Type definition ───────────────────────────────────────────────────────────

export interface WebhookLogRow {
    id: number;
    event_type: string;
    member_id: string | null;
    member_name: string | null;
    discord_user_id: string | null;
    payload?: any;
    received_at: string;
    processed: boolean;
    announced: boolean;
    notes: string | null;
}
