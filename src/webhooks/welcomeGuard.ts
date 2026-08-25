/**
 * Cross-handler welcome dedup guard.
 *
 * For one action Patreon fires several webhooks seconds apart
 * (members:create + members:pledge:create + members:update). Member upserts
 * are batched and only flush to the DB every few seconds, so a second
 * handler reading getTrackedMember() can still see stale "not existing" /
 * "is_active=false" state and send a duplicate welcome. This in-memory
 * marker closes that window for the single-process bot.
 */

const WELCOME_GUARD_TTL_MS = 10 * 60_000; // 10 minutes

const recentlyWelcomed = new Map<string, number>(); // memberId → timestamp

/** Record that a welcome (or welcome-back) was just announced for a member. */
export function markMemberWelcomed(memberId: string): void {
    // Lazy prune so the map never grows unbounded
    const now = Date.now();
    for (const [id, ts] of recentlyWelcomed) {
        if (now - ts > WELCOME_GUARD_TTL_MS) recentlyWelcomed.delete(id);
    }
    recentlyWelcomed.set(memberId, now);
}

/** True if this member received a welcome announcement within the TTL. */
export function wasRecentlyWelcomed(memberId: string): boolean {
    const ts = recentlyWelcomed.get(memberId);
    if (!ts) return false;
    if (Date.now() - ts > WELCOME_GUARD_TTL_MS) {
        recentlyWelcomed.delete(memberId);
        return false;
    }
    return true;
}
