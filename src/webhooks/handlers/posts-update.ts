import { WebhookPayload } from '../../database/schema';
import { upsertTrackedPost, getTrackedPost, getTierMappingByName } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createPostEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { centsMap, tierRankings, tierIdMap, getTierRank, isWaterfall } from '../../utils/tierRanking';

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

        // === ENHANCED DEBUG LOGGING START ===
        logger.info('\n🐛 ========================================');
        logger.info('🐛 [POST UPDATE DEBUG START]');
        logger.info('🐛 ========================================');
        logger.info(`🐛 Post Title: "${title}"`);
        logger.info(`🐛 Post ID: ${postId}`);
        logger.info(`🐛 Published At: ${attributes.published_at}`);
        logger.info(`🐛 Is Public Flag: ${attributes.is_public}`);
        logger.info(`🐛 Min Cents Pledged: ${attributes.min_cents_pledged_to_view}`);
        logger.info(`🐛 Raw Tier Data: ${JSON.stringify(tierData)}`);
        logger.info(`🐛 Raw Access Rules: ${JSON.stringify(relationships.access_rules?.data)}`);
        logger.info(`🐛 Attributes Tiers: ${JSON.stringify(attributes.tiers)}`);
        logger.info(`🐛 Included Items Count: ${included.length}`);
        // === ENHANCED DEBUG LOGGING END ===

        // --- START OF UPDATE FIX ---

        // 1. Extract ALL Tier IDs (The "Side Door")
        // When you update a post to include Gold, Patreon sends [DiamondID, GoldID]
        let tierIds: string[] = [];

        tierData.forEach((tierRef: any) => {
            if (typeof tierRef === 'string' || typeof tierRef === 'number') {
                tierIds.push(String(tierRef));
            } else if (tierRef.id) {
                tierIds.push(String(tierRef.id));
            }
        });

        logger.info(`\n🐛 [STRATEGY 1: ID MATCH]`);
        logger.info(`🐛 Extracted Tier IDs: ${JSON.stringify(tierIds)}`);
        logger.info(`🐛 Available Tier ID Map Keys: ${JSON.stringify(Object.keys(tierIdMap))}`);

        // 2. Translate IDs to Names
        const availableTiers: string[] = [];
        let detectionStrategy = 'None';

        tierIds.forEach(id => {
            logger.info(`🐛 Checking Tier ID: ${id} against tierIdMap...`);
            if (tierIdMap[id]) {
                availableTiers.push(tierIdMap[id]); // Converts "25588630" to "Gold"
                detectionStrategy = 'ID Match';
                logger.info(`✅ [ID MATCH FOUND] ${id} -> ${tierIdMap[id]}`);
            } else {
                logger.warn(`❌ [ID NOT FOUND] Tier ID ${id} not found in TIER_CONFIG`);
                // Optional: Try standard lookup if ID is missing from map
                const includedTier = included.find((item: any) => item.type === 'tier' && String(item.id) === id);
                if (includedTier && includedTier.attributes && includedTier.attributes.title) {
                    availableTiers.push(includedTier.attributes.title);
                    detectionStrategy = 'Title Match (Included Data)';
                    logger.info(`Found tier in included data: "${includedTier.attributes.title}" (ID: ${id})`);
                } else {
                    logger.warn(`⚠️ Tier ID ${id} not found in tierIdMap or included data`);
                }
            }
        });

        logger.info(`🐛 Translated Tier Names: ${JSON.stringify(availableTiers)}`);

        // 3. WATERFALL LOGIC: Find the "Lowest" Tier (Widest Audience)
        // If a post is available to Diamond AND Gold, we want to alert Gold 
        // (because Gold is the "new" audience that needs to know)
        let newTierName = 'Free';
        let newTierRank = 999; // Start high to find the lowest

        logger.info(`\n🐛 [WATERFALL LOGIC]`);
        logger.info(`🐛 Finding lowest tier (widest audience)...`);

        availableTiers.forEach(tierName => {
            // Sanitize dot if present
            const cleanName = tierName.trim().replace(/\.+$/, '');

            // Get the rank value from tierRankings (Diamond=100, Gold=75)
            const rank = tierRankings[cleanName];
            logger.info(`🐛 Checking tier: ${cleanName} (Rank: ${rank})`);

            // We want the tier with the LOWEST rank number that is > 0
            // (This ensures we alert the widest audience, e.g., Gold instead of Diamond)
            if (rank !== undefined && rank > 0 && rank < newTierRank) {
                newTierRank = rank;
                newTierName = cleanName;
                logger.info(`Updated target tier: ${cleanName} (Rank: ${rank})`);
            }
        });

        // If no valid tier found, reset to 0
        if (newTierRank === 999) {
            newTierRank = 0;
            logger.warn(`⚠️ No valid tier found in waterfall logic`);
        }

        // Fallback: If no tiers found, check minimum pledge amount using centsMap
        if (newTierRank === 0 && attributes.min_cents_pledged_to_view) {
            const minCents = parseInt(attributes.min_cents_pledged_to_view);

            logger.info(`\n🐛 [STRATEGY 2: CENTS FALLBACK]`);
            logger.info(`🐛 No tier data found, trying min_cents_pledged_to_view: ${minCents}`);
            logger.info(`🐛 Available Cents Map Keys: ${JSON.stringify(Object.keys(centsMap).map(Number))}`);

            // Check centsMap for exact match
            if (centsMap[minCents]) {
                newTierName = centsMap[minCents];
                newTierRank = tierRankings[newTierName] || 0;
                detectionStrategy = 'Cents Match';
                logger.info(`✅ [CENTS MATCH FOUND] ${minCents} cents -> ${newTierName} (Rank: ${newTierRank})`);
            } else {
                logger.warn(`❌ [CENTS NOT FOUND] No tier configured for ${minCents} cents in TIER_CONFIG`);
                logger.warn(`💡 Add "cents":${minCents} to the appropriate tier in your TIER_CONFIG`);
            }
        }

        logger.info(`\n🐛 [FINAL DECISION]`);
        logger.info(`🐛 Detection Strategy: ${detectionStrategy}`);
        logger.info(`🐛 Final Tier: "${newTierName}" (Rank: ${newTierRank})`);
        logger.info('🐛 ========================================\n');

        // --- END OF UPDATE FIX ---

        // Get old post data from database
        const oldPost = await getTrackedPost(postId);

        if (oldPost) {
            const oldTierName = oldPost.last_tier_access;
            const oldTierRank = getTierRank(oldTierName);

            // Check if this is a waterfall event (tier requirement decreased)
            if (isWaterfall(oldTierRank, newTierRank)) {
                logger.info(`🌊 Waterfall event: ${title} (${oldTierName} → ${newTierName})`);

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
                            logger.info(`✅ Waterfall alert sent to ${newTierName} channel: ${title}`);
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
