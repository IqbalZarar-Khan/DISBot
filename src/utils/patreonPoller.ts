import axios from 'axios';
import { config } from '../config';
import { getTrackedPost, upsertTrackedPost, getTierMappingByName, getMessageTemplate } from '../database/db';
import { tierIdMap, centsMap, getTierRank, isWaterfall, resolveFreeTier } from '../utils/tierRanking';
import { client } from '../index';
import { TextChannel } from 'discord.js';
import { createPostEmbed } from '../utils/embedBuilder';
import { formatMessage } from '../utils/formatter';
import { logger } from '../utils/logger';

const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';

// Default: poll every 10 minutes
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MINUTES || '10', 10) * 60_000;

let pollTimer: NodeJS.Timeout | null = null;

/**
 * Start the periodic Patreon post poller.
 * Checks recent posts for silent tier-access changes that Patreon
 * doesn't send webhooks for (e.g., changing "Who can see this post?"
 * without editing the content).
 */
export function startPolling(): void {
    if (!config.patreonAccessToken || !config.patreonCampaignId) {
        logger.warn('⚠️ [POLLER] Patreon credentials missing — polling disabled');
        return;
    }

    logger.info(`🔄 [POLLER] Starting — checking every ${POLL_INTERVAL_MS / 60_000} minutes`);

    // Run immediately on startup, then on interval
    setTimeout(() => pollPatreonPosts(), 30_000); // 30s delay to let Discord connect first
    pollTimer = setInterval(() => pollPatreonPosts(), POLL_INTERVAL_MS);
}

/**
 * Stop the poller (for graceful shutdown).
 */
export function stopPolling(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
        logger.info('🔄 [POLLER] Stopped');
    }
}

/**
 * Check if the poller is currently active.
 */
export function isPollingActive(): boolean {
    return pollTimer !== null;
}

/**
 * Fetch recent posts from Patreon API and compare tier access with database.
 */
async function pollPatreonPosts(): Promise<void> {
    try {
        logger.info('🔄 [POLLER] Checking Patreon for silent tier changes...');

        const url = `${PATREON_API}/campaigns/${config.patreonCampaignId}/posts`;
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${config.patreonAccessToken}` },
            params: {
                'fields[post]': 'title,url,published_at,is_paid,is_public',
                'page[count]': 20,
                'sort': '-published_at',
            },
        });

        const posts = res.data.data || [];
        const included = res.data.included || [];

        let changesDetected = 0;

        for (const post of posts) {
            const postId = post.id;
            const attributes = post.attributes || {};
            const title = attributes.title || 'Untitled Post';
            const url = attributes.url || `https://www.patreon.com/posts/${postId}`;

            // Detect the current tier for this post
            const currentTier = await detectPostTier(post, included, attributes);
            if (!currentTier) continue;

            // Compare with what we have in the database
            const trackedPost = await getTrackedPost(postId);

            if (trackedPost) {
                const oldTierName = trackedPost.last_tier_access;
                const oldRank = getTierRank(oldTierName);
                const newRank = getTierRank(currentTier);

                if (oldTierName !== currentTier && isWaterfall(oldRank, newRank)) {
                    // Silent tier change detected! Send waterfall alert
                    logger.info(`🔄 [POLLER] Silent tier change: "${title}" (${oldTierName} → ${currentTier})`);
                    changesDetected++;

                    await sendWaterfallAlert(title, url, currentTier);

                    // Update database
                    await upsertTrackedPost({
                        post_id: postId,
                        last_tier_access: currentTier,
                        title: title,
                        updated_at: Date.now(),
                    });
                } else if (oldTierName !== currentTier) {
                    // Tier changed but not a waterfall (e.g., made MORE restrictive)
                    // Just update the database silently
                    await upsertTrackedPost({
                        post_id: postId,
                        last_tier_access: currentTier,
                        title: title,
                        updated_at: Date.now(),
                    });
                }
            }
            // If post isn't tracked, we don't alert — it was never published via webhook.
            // The webhook handler will pick it up if the creator publishes/updates it.
        }

        if (changesDetected > 0) {
            logger.info(`🔄 [POLLER] Detected ${changesDetected} silent tier change(s)`);
        } else {
            logger.info('🔄 [POLLER] No silent tier changes detected');
        }

    } catch (error: any) {
        if (error.response?.status === 401) {
            logger.error('🔄 [POLLER] Patreon API 401 — access token may be expired');
        } else if (error.response?.status === 400) {
            logger.error(`🔄 [POLLER] Patreon API 400 — bad request: ${JSON.stringify(error.response?.data)}`);
        } else {
            logger.error('🔄 [POLLER] Failed to poll Patreon API', error as Error);
        }
    }
}

/**
 * Detect the lowest tier (widest audience) for a post from API data.
 */
async function detectPostTier(post: any, included: any[], attributes: any): Promise<string | null> {
    // 0. ZERO STATE INTERCEPT — post dropped to "All Members"
    const relationships = post.relationships || {};
    const tierRefs = relationships.access_rules?.data || relationships.tiers?.data || [];
    const isPublic = attributes.is_public === true;

    if (tierRefs.length === 0 && isPublic) {
        const freeTier = resolveFreeTier();
        if (freeTier) {
            logger.info(`🆓 [POLLER ZERO STATE] Post detected as Free (no tiers, is_public=true) → "${freeTier}"`);
            return freeTier;
        }
    }

    // 1. Check relationships → access_rules or tiers

    // Collect tier IDs from relationships
    const tierIds: string[] = tierRefs
        .filter((ref: any) => ref.type === 'tier')
        .map((ref: any) => ref.id);

    // Also check included data for tier info
    for (const item of included) {
        if (item.type === 'tier' && tierIds.includes(item.id)) {
            const name = tierIdMap[item.id];
            if (name) return name;
        }
    }

    // 2. Try tier ID translation
    for (const id of tierIds) {
        if (tierIdMap[id]) return tierIdMap[id];
    }

    // 3. Fallback to min_cents_pledged_to_view (currency-aware)
    const rawMinCents = attributes.min_cents_pledged_to_view;
    if (rawMinCents !== undefined && rawMinCents !== null) {
        const { normalizeCents, extractCurrency } = await import('./currencyHelper');
        const currency = extractCurrency(attributes);
        const minCents = normalizeCents(Number(rawMinCents), currency);

        if (centsMap[minCents]) return centsMap[minCents];

        // Find closest tier by cents
        const centValues = Object.keys(centsMap).map(Number).sort((a, b) => a - b);
        for (const cents of centValues) {
            if (cents >= minCents) return centsMap[cents];
        }
    }

    return null;
}

/**
 * Send a waterfall alert to the appropriate Discord channel.
 */
async function sendWaterfallAlert(title: string, url: string, tierName: string): Promise<void> {
    const tierMapping = await getTierMappingByName(tierName);
    if (!tierMapping) {
        logger.warn(`🔄 [POLLER] No channel mapping for tier: ${tierName}`);
        return;
    }

    try {
        const channel = await client.channels.fetch(tierMapping.channel_id) as TextChannel;
        if (!channel) return;

        const dbTemplate = await getMessageTemplate('post_waterfall');
        const template = dbTemplate || '🌊 This post is now available to {tier}! **{title}**\n{url}';

        const messageText = formatMessage(template, { tier: tierName, title, url });

        const embed = createPostEmbed({
            title,
            url,
            tierName,
            isUpdate: true,
        });
        embed.setDescription(messageText);
        embed.setFooter({ text: '🔄 Detected via automatic polling' });

        await channel.send({ embeds: [embed] });
        logger.info(`✅ [POLLER] Waterfall alert sent to ${tierName} channel: ${title}`);
    } catch (error) {
        logger.error(`🔄 [POLLER] Failed to send alert to ${tierName} channel`, error as Error);
    }
}
