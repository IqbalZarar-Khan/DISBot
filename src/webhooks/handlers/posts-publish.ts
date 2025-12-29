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

        // 1. Try relationships.tiers (Standard V2)
        let rawTierData = relationships.tiers?.data;

        // 2. If empty, try relationships.access_rules (Alternative V2)
        if (!rawTierData || rawTierData.length === 0) {
            rawTierData = relationships.access_rules?.data;
        }

        // 3. If still empty, try attributes.tiers (Mobile/Legacy)
        if (!rawTierData || rawTierData.length === 0) {
            if (attributes.tiers) {
                rawTierData = attributes.tiers;
            }
        }

        // 4. Normalize to array
        const tierData = Array.isArray(rawTierData) ? rawTierData : [];

        // === DEBUG LOGGING START ===
        logger.info('--- POST PUBLISH DEBUG START ---');
        logger.info(`Post Title: ${title}`);
        logger.info(`Post ID: ${postId}`);
        logger.info(`Is Public Flag: ${attributes.is_public}`);
        logger.info(`Raw Tier Data: ${JSON.stringify(tierData)}`);
        logger.info(`Included Items Count: ${included.length}`);
        logger.info(`Min Cents Pledged: ${attributes.min_cents_pledged_to_view}`);

        // === DEEP DEBUG START ===
        logger.info('--- DEEP DEBUG START ---');
        logger.info(`Attributes Tiers: ${JSON.stringify(attributes.tiers)}`);
        const tierIds = tierData.map((item: any) => String(item.id || item));
        logger.info(`✅ Extracted Tier IDs: ${JSON.stringify(tierIds)}`);
        logger.info('--- DEEP DEBUG END ---');
        // === DEBUG LOGGING END ===

        // Determine the highest tier (most restrictive)
        let highestTierName = 'Free';
        let highestTierRank = 0;

        for (const tierRef of tierData) {
            let tierKey: string | undefined; // Can be either title or ID
            let tierId: string | undefined;

            // Extract tier ID (convert to string if it's a number)
            if (typeof tierRef === 'string' || typeof tierRef === 'number') {
                // attributes.tiers might be an array of IDs directly
                tierId = String(tierRef);
            } else if (tierRef.id) {
                tierId = String(tierRef.id);
            }

            // Method 1: Check if tier object has title directly (attributes.tiers case)
            if (tierRef.title) {
                tierKey = tierRef.title;
                logger.info(`✅ Found tier title directly in tier object: "${tierKey}"`);
            }
            // Method 2: Check if tier object has attributes.title
            else if (tierRef.attributes?.title) {
                tierKey = tierRef.attributes.title;
                logger.info(`✅ Found tier title in tier.attributes: "${tierKey}"`);
            }
            // Method 3: Look up by ID in included data (standard method)
            else if (tierId) {
                const tierInfo = included.find((item: any) => item.type === 'tier' && String(item.id) === tierId);
                if (tierInfo && tierInfo.attributes?.title) {
                    tierKey = tierInfo.attributes.title;
                    logger.info(`Found tier title in included data: "${tierKey}" (ID: ${tierId})`);
                } else {
                    // Check translation map first (THE FIX!)
                    if (tierIdMap[tierId]) {
                        tierKey = tierIdMap[tierId];
                        logger.info(`✅ ID Match Found in Translation Map: ${tierId} = ${tierKey}`);
                    } else {
                        // Final fallback: Use the ID itself
                        tierKey = tierId;
                        logger.info(`⚠️ Tier title not found, using ID as key: "${tierKey}"`);
                        logger.info(`   Add to tierIdMap in src/utils/tierRanking.ts: '${tierId}': 'YourTierName'`);
                    }
                }
            }

            // If we found a tier key (title or ID), try to map it
            if (tierKey) {
                // Remove trailing dots (e.g., "Diamond." -> "Diamond")
                tierKey = tierKey.trim().replace(/\.+$/, '');

                logger.info(`Attempting to map tier key: "${tierKey}"`);
                const tierMapping = await getTierMappingByName(tierKey);

                if (tierMapping && tierMapping.tier_rank > highestTierRank) {
                    highestTierRank = tierMapping.tier_rank;
                    highestTierName = tierMapping.tier_name;
                    logger.info(`✅ Updated highest tier: ${highestTierName} (Rank: ${highestTierRank})`);
                } else if (!tierMapping) {
                    logger.warn(`❌ No tier mapping found for: "${tierKey}"`);
                    logger.warn(`   Run this command in Discord: /admin set-channel tier_name:${tierKey} channel:#your-channel`);
                }
            }
        }

        // Fallback: If no tiers found, check minimum pledge amount
        if (highestTierRank === 0 && attributes.min_cents_pledged_to_view) {
            const minCents = parseInt(attributes.min_cents_pledged_to_view);
            logger.info(`No tier data found, using min_cents_pledged_to_view: ${minCents}`);

            // Map pledge amounts to tiers (based on your Patreon tier prices)
            if (minCents >= 2500) { // $25+ = Diamond
                highestTierName = 'Diamond';
                highestTierRank = 100;
            } else if (minCents >= 1500) { // $15+ = Gold
                highestTierName = 'Gold';
                highestTierRank = 75;
            } else if (minCents >= 1000) { // $10+ = Silver
                highestTierName = 'Silver';
                highestTierRank = 50;
            } else if (minCents >= 300) { // $3+ = Bronze
                highestTierName = 'Bronze';
                highestTierRank = 25;
            }
            logger.info(`Mapped pledge amount to tier: ${highestTierName} (Rank: ${highestTierRank})`);
        }

        logger.info(`✅ Final determined tier: ${highestTierName} (Rank: ${highestTierRank})`);
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
