import { WebhookPayload } from '../../database/schema';
import { upsertTrackedPost, getTierMappingByName } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createPostEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';

/**
 * Handle posts:publish webhook event
 */
export async function handlePostsPublish(payload: WebhookPayload): Promise<void> {
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

        // Determine the highest tier (most restrictive)
        let highestTierName = 'Free';
        let highestTierRank = 0;

        for (const tierRef of tierData) {
            const tierInfo = included.find((item: any) => item.type === 'tier' && item.id === tierRef.id);

            if (tierInfo) {
                const tierTitle = tierInfo.attributes?.title || 'Unknown';
                const tierMapping = await getTierMappingByName(tierTitle);

                if (tierMapping && tierMapping.tier_rank > highestTierRank) {
                    highestTierRank = tierMapping.tier_rank;
                    highestTierName = tierMapping.tier_name;
                }
            }
        }

        // Extract tags and collections (if available)
        const tags: string[] = [];
        const collections: string[] = [];

        // Tags might be in attributes.tags
        if (attributes.tags && Array.isArray(attributes.tags)) {
            tags.push(...attributes.tags);
        }

        // Store post in database
        const trackedPost = {
            post_id: postId,
            last_tier_access: highestTierName,
            title: title,
            updated_at: Date.now()
        };

        await upsertTrackedPost(trackedPost);

        // Get tier mapping for channel
        const tierMapping = await getTierMappingByName(highestTierName);

        if (tierMapping) {
            try {
                const channel = await client.channels.fetch(tierMapping.channel_id) as TextChannel;

                if (channel) {
                    const embed = createPostEmbed({
                        title,
                        url,
                        tierName: highestTierName,
                        tags: tags.length > 0 ? tags : undefined,
                        collections: collections.length > 0 ? collections : undefined,
                        isUpdate: false
                    });

                    await channel.send({ embeds: [embed] });
                    logger.info(`New post alert sent to ${highestTierName} channel: ${title}`);
                }
            } catch (error) {
                logger.error(`Failed to send post alert to ${highestTierName} channel`, error as Error);
            }
        } else {
            logger.warn(`No channel mapping found for tier: ${highestTierName}`);
        }

    } catch (error) {
        logger.error('Error handling posts:publish webhook', error as Error);
        throw error;
    }
}
