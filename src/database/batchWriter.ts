import { TrackedMember } from './schema';
import { getSupabase } from './supabase';
import { logger } from '../utils/logger';

/**
 * Batched database writer for member upserts.
 * Queues writes in memory and flushes them in bulk every FLUSH_INTERVAL_MS.
 * Supabase supports batch upsert natively via .upsert([...array...]).
 */

const FLUSH_INTERVAL_MS = 5_000; // Flush every 5 seconds

const writeBuffer = new Map<string, TrackedMember>();
const retryAttempts = new Map<string, number>();
const MAX_RETRIES = 3;
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Queue a member upsert for batched writing.
 * If the same member_id is queued again before flush, the newer data wins.
 */
export function queueMemberUpsert(member: TrackedMember): void {
    const existing = writeBuffer.get(member.member_id);
    // Only overwrite if the new data is more recent (prevents out-of-order flush from rapid events)
    if (existing && existing.updated_at && member.updated_at && existing.updated_at > member.updated_at) {
        return; // Keep the newer buffered entry
    }
    // Guarantee is_active is boolean (never null or undefined)
    const sanitized: TrackedMember = {
        ...member,
        is_active: member.is_active !== undefined && member.is_active !== null ? Boolean(member.is_active) : true,
    };
    writeBuffer.set(member.member_id, sanitized);
}

/**
 * Start the automatic flush timer.
 */
export function startBatchWriter(): void {
    if (flushTimer) return; // Already running

    flushTimer = setInterval(() => {
        flushMemberBatch().catch(err => {
            logger.error('❌ [BATCH] Auto-flush failed', err as Error);
        });
    }, FLUSH_INTERVAL_MS);

    logger.info(`🗄️ [BATCH] Writer started (flush every ${FLUSH_INTERVAL_MS / 1000}s)`);
}

/**
 * Stop the automatic flush timer and do a final flush.
 */
export async function stopBatchWriter(): Promise<void> {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }

    // Final flush on shutdown
    await flushMemberBatch();
    logger.info('👋 [BATCH] Writer stopped');
}

/**
 * Flush all queued member upserts to the database in a single batch.
 */
export async function flushMemberBatch(): Promise<void> {
    if (writeBuffer.size === 0) return;

    const members = Array.from(writeBuffer.values());
    writeBuffer.clear();

    // Sanitize every member record to ensure is_active is explicitly boolean
    const sanitizedMembers: TrackedMember[] = members.map(m => ({
        ...m,
        is_active: m.is_active !== undefined && m.is_active !== null ? Boolean(m.is_active) : true,
    }));

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .from('tracked_members')
            .upsert(sanitizedMembers, { onConflict: 'member_id' });

        if (error) {
            logger.warn(`⚠️ [BATCH] Bulk flush failed (${error.message}) — attempting individual recovery...`);
            let recovered = 0;

            for (const member of sanitizedMembers) {
                const attempts = (retryAttempts.get(member.member_id) || 0) + 1;
                retryAttempts.set(member.member_id, attempts);

                if (attempts > MAX_RETRIES) {
                    logger.error(`❌ [BATCH] Dropping member ${member.member_id} (${member.full_name}) after ${MAX_RETRIES} failed flush attempts to prevent error loop: ${error.message}`);
                    retryAttempts.delete(member.member_id);
                    continue;
                }

                try {
                    const { error: singleErr } = await supabase
                        .from('tracked_members')
                        .upsert(member, { onConflict: 'member_id' });

                    if (!singleErr) {
                        recovered++;
                        retryAttempts.delete(member.member_id);
                    } else {
                        writeBuffer.set(member.member_id, member);
                    }
                } catch {
                    writeBuffer.set(member.member_id, member);
                }
            }

            if (recovered > 0) {
                logger.info(`✅ [BATCH] Recovered and flushed ${recovered}/${members.length} member(s) individually`);
            }
        } else {
            // Clean up retry tracker for successful flushes
            for (const member of members) {
                retryAttempts.delete(member.member_id);
            }
            logger.info(`✅ [BATCH] Flushed ${members.length} member upsert(s)`);
        }
    } catch (err) {
        logger.error('❌ [BATCH] Exception during flush', err as Error);
        for (const member of sanitizedMembers) {
            const attempts = (retryAttempts.get(member.member_id) || 0) + 1;
            retryAttempts.set(member.member_id, attempts);
            if (attempts <= MAX_RETRIES) {
                writeBuffer.set(member.member_id, member);
            } else {
                logger.error(`❌ [BATCH] Dropping member ${member.member_id} (${member.full_name}) after ${MAX_RETRIES} exceptions to prevent loop`);
                retryAttempts.delete(member.member_id);
            }
        }
    }
}

/**
 * Get the current buffer size (for monitoring).
 */
export function getBatchBufferSize(): number {
    return writeBuffer.size;
}

/**
 * Get a member from the buffer by ID (for inspection/testing).
 */
export function getBufferedMember(memberId: string): TrackedMember | undefined {
    return writeBuffer.get(memberId);
}

/**
 * Clear the batch buffer (for testing/cleanup).
 */
export function clearBatchBuffer(): void {
    writeBuffer.clear();
    retryAttempts.clear();
}
