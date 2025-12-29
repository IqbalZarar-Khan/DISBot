import { WebhookPayload } from '../../database/schema';
import { upsertTrackedPost, getTierMappingByName } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createPostEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { tierIdMap } from '../../utils/tierRanking';

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

        // Get tier access from multiple possible locations
        const relationships = post.relationships || {};

        // === DEBUG LOGGING START ===
        logger.info('--- POST PUBLISH DEBUG START ---');
        logger.info(`Post Title: ${title}`);
        logger.info(`Post ID: ${postId}`);
        logger.info(`Attributes Tiers: ${JSON.stringify(attributes.tiers)}`);
        logger.info(`Relationships Tiers: ${JSON.stringify(relationships.tiers)}`);
        logger.info(`Relationships Access Rules: ${JSON.stringify(relationships.access_rules)}`);
        // === DEBUG LOGGING END ===

        // --- START OF TRANSLATION LOGIC ---

        // 1. Extract the Tier ID (The "Barcode")
        let tierId: string | null = null;

        // Check "Side Door" (Attributes - where your data is appearing)
        if (attributes.tiers && Array.isArray(attributes.tiers) && attributes.tiers.length > 0) {
            // Patreon sends this as an array of numbers
            // We take the first one and turn it into a string
            tierId = String(attributes.tiers[0]);
        }
        // Check "Front Door" (Relationships - Backup standard method)
        else if (relationships.access_rules?.data && Array.isArray(relationships.access_rules.data) && relationships.access_rules.data.length > 0) {
            tierId = String(relationships.access_rules.data[0].id);
        }
        // Another backup: relationships.tiers
        else if (relationships.tiers?.data && Array.isArray(relationships.tiers.data) && relationships.tiers.data.length > 0) {
            tierId = String(relationships.tiers.data[0].id);
        }

        logger.info(`✅ Extracted Tier ID: ${tierId}`);

        // 2. Determine the Name using your ID Map
        let tierName = 'Free'; // Default

        if (tierId) {
            // CHECK 1: Look at your hardcoded ID Map (Priority Fix)
            if (tierIdMap[tierId]) {
                tierName = tierIdMap[tierId];
                logger.info(`✅ ID Translation Successful: ${tierId} -> ${tierName}`);
            }
            // CHECK 2: Try standard name lookup (Backup)
            else {
                logger.info(`⚠️ ID ${tierId} not found in map. Trying standard lookup.`);

                const includedTier = included.find((item: any) => item.type === 'tier' && String(item.id) === tierId);
                if (includedTier && includedTier.attributes && includedTier.attributes.title) {
                    tierName = includedTier.attributes.title;
                    logger.info(`Found tier name in included data: ${tierName}`);
                } else {
                    logger.warn(`⚠️ Tier ID ${tierId} not found in map or included data. Defaulting to Free.`);
                    logger.warn(`   Add to tierIdMap in src/utils/tierRanking.ts: '${tierId}': 'YourTierName'`);
                }
            }
        } else {
            logger.warn('⚠️ No tier ID found. Defaulting to Free.');
        }

        // 3. Sanitize (Just in case)
        if (tierName.endsWith('.')) {
            tierName = tierName.slice(0, -1);
        }

        logger.info(`✅ Final Determined Tier Name: ${tierName}`);

        // --- END OF TRANSLATION LOGIC ---

        // Fallback: If still Free, check minimum pledge amount
        if (tierName === 'Free' && attributes.min_cents_pledged_to_view) {
            const minCents = parseInt(attributes.min_cents_pledged_to_view);
            logger.info(`Checking min_cents_pledged_to_view fallback: ${minCents}`);

            // Map pledge amounts to tiers (based on your Patreon tier prices)
            if (minCents >= 2500) { // $25+ = Diamond
                tierName = 'Diamond';
            } else if (minCents >= 1500) { // $15+ = Gold
                tierName = 'Gold';
            } else if (minCents >= 1000) { // $10+ = Silver
                tierName = 'Silver';
            } else if (minCents >= 300) { // $3+ = Bronze
                tierName = 'Bronze';
            }
            logger.info(`Mapped pledge amount to tier: ${tierName}`);
        }

        logger.info('--- POST PUBLISH DEBUG END ---');

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
            last_tier_access: tierName,
            title: title,
            updated_at: Date.now()
        };

        await upsertTrackedPost(trackedPost);

        // Get tier mapping for channel
        const tierMapping = await getTierMappingByName(tierName);

        if (tierMapping) {
            try {
                const channel = await client.channels.fetch(tierMapping.channel_id) as TextChannel;

                if (channel) {
                    const embed = createPostEmbed({
                        title,
                        url,
                        tierName: tierName,
                        tags: tags.length > 0 ? tags : undefined,
                        collections: collections.length > 0 ? collections : undefined,
                        isUpdate: false
                    });

                    await channel.send({ embeds: [embed] });
                    logger.info(`✅ New post alert sent to ${tierName} channel: ${title}`);
                }
            } catch (error) {
                logger.error(`Failed to send post alert to ${tierName} channel`, error as Error);
            }
        } else {
            logger.warn(`No channel mapping found for tier: ${tierName}`);
            logger.warn(`Run this command in Discord: /admin set-channel tier_name:${tierName} channel:#your-channel`);
        }

    } catch (error) {
        logger.error('Error handling posts:publish webhook', error as Error);
        throw error;
    }
}
