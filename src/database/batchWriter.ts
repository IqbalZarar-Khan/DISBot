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
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Queue a member upsert for batched writing.
 * If the same member_id is queued again before flush, the newer data wins.
 */
export function queueMemberUpsert(member: TrackedMember): void {
    writeBuffer.set(member.member_id, member);
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

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .from('tracked_members')
            .upsert(members, { onConflict: 'member_id' });

        if (error) {
            logger.error(`❌ [BATCH] Failed to flush ${members.length} members: ${error.message}`);
            // Put them back in the buffer for retry
            for (const member of members) {
                writeBuffer.set(member.member_id, member);
            }
        } else {
            logger.info(`✅ [BATCH] Flushed ${members.length} member upsert(s)`);
        }
    } catch (err) {
        logger.error('❌ [BATCH] Exception during flush', err as Error);
        // Put them back for retry
        for (const member of members) {
            writeBuffer.set(member.member_id, member);
        }
    }
}

/**
 * Get the current buffer size (for monitoring).
 */
export function getBatchBufferSize(): number {
    return writeBuffer.size;
}
