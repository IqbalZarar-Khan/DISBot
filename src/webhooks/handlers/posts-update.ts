import { WebhookPayload } from '../../database/schema';
import { upsertTrackedPost, getTrackedPost, getTierMappingByName } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createPostEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { centsMap, tierRankings, getTierRank, isWaterfall } from '../../utils/tierRanking';

/**
 * Handle posts:update webhook event
 * This implements the core "waterfall" logic
 */
export async function handlePostsUpdate(payload: WebhookPayload): Promise<void> {
    try {
        const post = payload.data;
        const included = payload.included || [];

        // Extract post data
        const postId = post.id;
        const attributes = post.attributes || {};
        const title = attributes.title || 'Untitled Post';
        const url = attributes.url || `https://www.patreon.com/posts/${postId}`;

        // Get tier access from relationships
        const relationships = post.relationships || {};
        const tierData = relationships.tiers?.data || [];

        // === DEBUG LOGGING START ===
        logger.info('--- POST UPDATE DEBUG START ---');
        logger.info(`Post Title: ${title}`);
        logger.info(`Post ID: ${postId}`);
        logger.info(`Is Public Flag: ${attributes.is_public}`);
        logger.info(`Raw Tier Data: ${JSON.stringify(tierData)}`);
        logger.info(`Included Items Count: ${included.length}`);
        logger.info(`Min Cents Pledged: ${attributes.min_cents_pledged_to_view}`);
        // === DEBUG LOGGING END ===

        // Determine the highest tier (most restrictive)
        let newTierName = 'Free';
        let newTierRank = 0;

        for (const tierRef of tierData) {
            const tierInfo = included.find((item: any) => item.type === 'tier' && item.id === tierRef.id);

            if (tierInfo) {
                const tierTitle = tierInfo.attributes?.title || 'Unknown';
                logger.info(`Found tier in included data: "${tierTitle}" (ID: ${tierRef.id})`);

                const tierMapping = await getTierMappingByName(tierTitle);

                if (tierMapping && tierMapping.tier_rank > newTierRank) {
                    newTierRank = tierMapping.tier_rank;
                    newTierName = tierMapping.tier_name;
                    logger.info(`Updated new tier: ${newTierName} (Rank: ${newTierRank})`);
                } else if (!tierMapping) {
                    logger.warn(`No tier mapping found for: "${tierTitle}"`);
                }
            } else {
                logger.warn(`Tier info not found in included data for tier ID: ${tierRef.id}`);
            }
        }

        // Fallback: If no tiers found, check minimum pledge amount using centsMap
        if (newTierRank === 0 && attributes.min_cents_pledged_to_view) {
            const minCents = parseInt(attributes.min_cents_pledged_to_view);
            logger.info(`No tier data found, using min_cents_pledged_to_view: ${minCents}`);

            // Check centsMap for exact match
            if (centsMap[minCents]) {
                newTierName = centsMap[minCents];
                newTierRank = tierRankings[newTierName] || 0;
                logger.info(`✅ Cents Map Match: ${minCents} cents -> ${newTierName} (Rank: ${newTierRank})`);
            } else {
                logger.warn(`⚠️ No tier configured for ${minCents} cents in TIER_CONFIG`);
                logger.warn(`   Add "cents":${minCents} to the appropriate tier in your TIER_CONFIG`);
            }
        }

        logger.info(`Final determined new tier: ${newTierName} (Rank: ${newTierRank})`);

        // Get old post data from database
        const oldPost = await getTrackedPost(postId);

        if (oldPost) {
            const oldTierName = oldPost.last_tier_access;
            const oldTierRank = getTierRank(oldTierName);

            // Check if this is a waterfall event (tier requirement decreased)
            if (isWaterfall(oldTierRank, newTierRank)) {
                logger.info(`Waterfall event: ${title} (${oldTierName} → ${newTierName})`);

                // Extract tags and collections
                const tags: string[] = [];
                const collections: string[] = [];

                if (attributes.tags && Array.isArray(attributes.tags)) {
                    tags.push(...attributes.tags);
                }

                // Send alert to the NEW tier channel (the one that just gained access)
                const tierMapping = await getTierMappingByName(newTierName);

                if (tierMapping) {
                    try {
                        const channel = await client.channels.fetch(tierMapping.channel_id) as TextChannel;

                        if (channel) {
                            const embed = createPostEmbed({
                                title,
                                url,
                                tierName: newTierName,
                                tags: tags.length > 0 ? tags : undefined,
                                collections: collections.length > 0 ? collections : undefined,
                                isUpdate: true
                            });

                            await channel.send({ embeds: [embed] });
                            logger.info(`Waterfall alert sent to ${newTierName} channel: ${title}`);
                        }
                    } catch (error) {
                        logger.error(`Failed to send waterfall alert to ${newTierName} channel`, error as Error);
                    }
                } else {
                    logger.warn(`No channel mapping found for tier: ${newTierName}`);
                }
            } else if (oldTierRank === newTierRank) {
                // Tier didn't change - just a content update, no alert needed
                logger.info(`Post updated (no tier change): ${title}`);
            } else {
                // Tier increased (more restrictive) - no alert needed
                logger.info(`Post tier increased (${oldTierName} → ${newTierName}): ${title}`);
            }
        } else {
            // Post not tracked yet - treat as new post
            logger.warn(`Post update received for untracked post: ${postId}`);
        }

        // Update post in database
        const trackedPost = {
            post_id: postId,
            last_tier_access: newTierName,
            title: title,
            updated_at: Date.now()
        };

        await upsertTrackedPost(trackedPost);

    } catch (error) {
        logger.error('Error handling posts:update webhook', error as Error);
        throw error;
    }
}
