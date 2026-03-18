import axios from 'axios';
import { config } from '../config';
import { loadSnapshot, saveSnapshot } from '../database/db';
import { logger } from './logger';
import { handlePostsUpdate } from '../webhooks/handlers/posts-update';
import { WebhookPayload } from '../database/schema';

const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';

// ── Memory Lock ────────────────────────────────────────────────────
// Prevents duplicate concurrent runs when multiple webhooks fire at once.
let isDiffRunning = false;

/**
 * Find the Bronze tier (the lowest paid tier, directly above Free)
 * from the bot's TIER_CONFIG. Returns { name, id } or null.
 */
function getBronzeTier(): { name: string; id: string } | null {
    // Find the tier with the lowest rank that is > 0 (i.e., just above Free)
    const paidTiers = config.tierConfig.filter(t => t.rank > 0);
    if (paidTiers.length === 0) return null;

    const lowestPaid = paidTiers.reduce((min, t) => t.rank < min.rank ? t : min);
    return { name: lowestPaid.name, id: lowestPaid.id };
}

/**
 * Piggyback Diff Engine
 * 
 * Called after a posts:update webhook fires. Checks whether any posts
 * that were previously in the Bronze tier have silently dropped to Free
 * (Patreon strips tier data for these, so no webhook is sent).
 * 
 * Flow:
 * 1. Load the Bronze snapshot from Supabase (post IDs from last check)
 * 2. Fetch live posts from the Patreon API
 * 3. Diff: find posts that were in Bronze but are now Free (is_public + empty tiers)
 * 4. Push synthetic payloads into handlePostsUpdate() for each dropped post
 * 5. Save the new Bronze snapshot back to Supabase
 */
export async function executeDiffEngine(campaignId: string): Promise<void> {
    // Lock: prevent duplicate runs from simultaneous webhooks
    if (isDiffRunning) {
        logger.info('[Diff Engine] Already running. Skipping duplicate trigger.');
        return;
    }

    isDiffRunning = true;

    try {
        const bronze = getBronzeTier();
        if (!bronze) {
            logger.warn('[Diff Engine] No paid tier above Free found in TIER_CONFIG — aborting.');
            return;
        }

        logger.info(`[Diff Engine] Waking up — checking "${bronze.name}" (ID: ${bronze.id}) for silent Free drops...`);

        // 1. Load previous snapshot
        const previousBronzePostIds = await loadSnapshot(bronze.name);
        logger.info(`[Diff Engine] Loaded snapshot: ${previousBronzePostIds.length} post(s) in "${bronze.name}"`);

        // 2. Fetch live posts from Patreon
        const livePosts = await fetchLivePatreonPosts(campaignId);
        if (!livePosts || livePosts.length === 0) {
            logger.warn('[Diff Engine] No live posts fetched — skipping diff.');
            return;
        }

        logger.info(`[Diff Engine] Fetched ${livePosts.length} live post(s) from Patreon API`);

        // 3. Categorize live posts
        const currentBronzePostIds: string[] = [];
        const droppedToFree: any[] = [];

        for (const post of livePosts) {
            const attributes = post.attributes || {};
            const isPublic = attributes.is_public === true;

            // With include=tiers, Patreon returns tier IDs as a flat array
            // inside attributes.tiers (e.g., [25508381]), NOT relationships.tiers.data
            const apiTiers: any[] = attributes.tiers || [];

            // Check if this post is currently in the Bronze tier
            // apiTiers is a flat array of IDs — compare as strings to avoid type mismatch
            const isBronze = apiTiers.some((tierId: any) => String(tierId) === String(bronze.id));

            if (isBronze) {
                currentBronzePostIds.push(post.id);
            }

            // Detect the silent drop: was in Bronze snapshot, now Free (empty tiers + public)
            const isFree = apiTiers.length === 0 && isPublic;
            if (isFree && previousBronzePostIds.includes(post.id)) {
                droppedToFree.push(post);
            }
        }

        // 4. Fire synthetic webhooks for dropped posts
        if (droppedToFree.length > 0) {
            logger.info(`[Diff Engine] 🎯 Detected ${droppedToFree.length} post(s) silently dropped from "${bronze.name}" to Free`);

            for (const droppedPost of droppedToFree) {
                const title = droppedPost.attributes?.title || droppedPost.id;
                logger.info(`[Diff Engine] Triggering synthetic Free release for: "${title}" (${droppedPost.id})`);

                const syntheticPayload = buildSyntheticPayload(droppedPost);
                try {
                    await handlePostsUpdate(syntheticPayload);
                    logger.info(`[Diff Engine] ✅ Synthetic waterfall processed for: "${title}"`);
                } catch (error) {
                    logger.error(`[Diff Engine] Failed to process synthetic payload for ${droppedPost.id}`, error as Error);
                }
            }
        } else {
            logger.info('[Diff Engine] No silent Free drops detected.');
        }

        // 5. Save new snapshot
        await saveSnapshot(bronze.name, currentBronzePostIds);
        logger.info(`[Diff Engine] Snapshot saved: ${currentBronzePostIds.length} post(s) in "${bronze.name}"`);

    } catch (error) {
        logger.error('[Diff Engine] Failed during diff execution', error as Error);
    } finally {
        isDiffRunning = false;
    }
}

/**
 * Fetch recent posts from the Patreon API for diffing.
 * Reuses the same API pattern as patreonPoller.ts.
 */
async function fetchLivePatreonPosts(campaignId: string): Promise<any[]> {
    try {
        const url = `${PATREON_API}/campaigns/${campaignId}/posts`;
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${config.patreonAccessToken}` },
            params: {
                'fields[post]': 'title,url,published_at,is_paid,is_public,tiers',
                'page[count]': 50,
                'sort': '-published_at',
            },
        });

        return res.data.data || [];
    } catch (error: any) {
        if (error.response?.status === 401) {
            logger.error('[Diff Engine] Patreon API 401 — access token may be expired');
        } else {
            logger.error('[Diff Engine] Failed to fetch live posts from Patreon', error as Error);
        }
        return [];
    }
}

/**
 * Build a synthetic WebhookPayload that mimics a posts:update event
 * with empty tier data + is_public=true. This feeds into the existing
 * handlePostsUpdate pipeline where resolveFreeTier() intercepts it.
 */
function buildSyntheticPayload(post: any): WebhookPayload {
    return {
        data: {
            id: post.id,
            type: 'post',
            attributes: {
                ...post.attributes,
                is_public: true, // Ensure the Zero State intercept triggers
            },
            relationships: {
                ...post.relationships,
                // Strip tier data to simulate the "All Members" null state
                tiers: { data: [] },
                access_rules: { data: [] },
            },
        },
        included: [],
    };
}
