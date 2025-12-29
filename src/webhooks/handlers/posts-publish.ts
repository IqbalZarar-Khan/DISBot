import { WebhookPayload } from '../../database/schema';
import { getTierMappingByName, db } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createPostEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { tierIdMap, centsMap } from '../../utils/tierRanking';
import { handlePostsUpdate } from './posts-update';

/**
 * Handle posts:publish webhook event
 * CRITICAL: This also handles "Edit and Republish" workflow by redirecting to update handler
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

        logger.info('\n📝 ========================================');
        logger.info('📝 [POST PUBLISH HANDLER]');
        logger.info('📝 ========================================');
        logger.info(`📝 Post Title: "${title}"`);
        logger.info(`📝 Post ID: ${postId}`);

        // --- CRITICAL FIX: Check if post already exists ---
        // If it exists, this "Publish" is actually an "Update" (Edit and Republish workflow)
        logger.info(`⏳ [DB CHECK] Connecting to Supabase...`);
        const existingPost = await db.getPost(postId);

        // 🕵️ X-RAY DEBUG: See exactly what Supabase returns
        console.log('🕵️ DEBUG X-RAY:', JSON.stringify(existingPost, null, 2));
        logger.info(`🕵️ [X-RAY] Raw result: ${JSON.stringify(existingPost)}`);

        if (existingPost) {
            logger.info(`✅ [DB CHECK] Result: FOUND`);
            logger.info(`✅ [DB CHECK] Found: ${existingPost.last_tier_access}`);
            logger.info(`🔄 [REDIRECT] Post ${postId} already exists in database`);
            logger.info(`🔄 [REDIRECT] Previous tier: ${existingPost.last_tier_access}`);
            logger.info(`🔄 [REDIRECT] This is an "Edit and Republish" - switching to UPDATE handler...`);
            logger.info('📝 ========================================\n');

            // Redirect to update handler to trigger waterfall logic
            return await handlePostsUpdate(payload);
        }

        logger.info(`✨ [NEW POST] Post ${postId} not found in database - treating as genuinely new post`);

        // Get tier access from multiple possible locations
        const relationships = post.relationships || {};

        // === DEBUG LOGGING ===
        logger.info(`📝 Attributes Tiers: ${JSON.stringify(attributes.tiers)}`);
        logger.info(`📝 Relationships Access Rules: ${JSON.stringify(relationships.access_rules?.data)}`);
        logger.info(`📝 Min Cents Pledged: ${attributes.min_cents_pledged_to_view}`);

        // --- TIER DETECTION LOGIC ---

        let tierName: string | null = null;
        let detectionStrategy = 'None';

        // 1. Try ID Translation (Primary Method)
        let tierIds: string[] = [];

        // Check attributes.tiers (where your data appears)
        if (attributes.tiers && Array.isArray(attributes.tiers) && attributes.tiers.length > 0) {
            tierIds = attributes.tiers.map((id: any) => String(id));
        }
        // Check relationships.access_rules (standard method)
        else if (relationships.access_rules?.data && Array.isArray(relationships.access_rules.data)) {
            tierIds = relationships.access_rules.data.map((item: any) => String(item.id));
        }
        // Check relationships.tiers (backup)
        else if (relationships.tiers?.data && Array.isArray(relationships.tiers.data)) {
            tierIds = relationships.tiers.data.map((item: any) => String(item.id));
        }

        logger.info(`📝 Extracted Tier IDs: ${JSON.stringify(tierIds)}`);

        // Translate IDs to tier names
        for (const id of tierIds) {
            if (tierIdMap[id]) {
                tierName = tierIdMap[id];
                detectionStrategy = 'ID Match';
                logger.info(`✅ [ID MATCH] ${id} -> ${tierName}`);
                break;
            }
        }

        // 2. Fallback: Check Cents
        if (!tierName && attributes.min_cents_pledged_to_view) {
            const cents = parseInt(attributes.min_cents_pledged_to_view);
            logger.info(`📝 Trying cents fallback: ${cents}`);

            if (centsMap[cents]) {
                tierName = centsMap[cents];
                detectionStrategy = 'Cents Match';
                logger.info(`✅ [CENTS MATCH] ${cents} cents -> ${tierName}`);
            }
        }

        // 3. Fallback: Check included data
        if (!tierName && tierIds.length > 0) {
            for (const id of tierIds) {
                const includedTier = included.find((item: any) => item.type === 'tier' && String(item.id) === id);
                if (includedTier && includedTier.attributes && includedTier.attributes.title) {
                    tierName = includedTier.attributes.title;
                    detectionStrategy = 'Title Match';
                    logger.info(`✅ [TITLE MATCH] Found in included data: ${tierName}`);
                    break;
                }
            }
        }

        if (!tierName) {
            logger.error(`❌ Could not detect tier for post ${postId}`);
            logger.error(`❌ Tier IDs: ${JSON.stringify(tierIds)}`);
            logger.error(`❌ Available ID Map Keys: ${JSON.stringify(Object.keys(tierIdMap))}`);
            logger.error(`❌ Available Cents Map Keys: ${JSON.stringify(Object.keys(centsMap).map(Number))}`);
            logger.info('📝 ========================================\n');
            return;
        }

        logger.info(`📝 Detection Strategy: ${detectionStrategy}`);
        logger.info(`📝 Final Tier: ${tierName}`);

        // Get tier mapping for Discord channel
        const tierMapping = await getTierMappingByName(tierName);

        if (!tierMapping) {
            logger.warn(`No channel mapping found for tier: ${tierName}`);
            logger.warn(`Use /admin set-channel tier_name:${tierName} channel:#your-channel`);
            logger.info('📝 ========================================\n');
            return;
        }

        // Send notification to Discord
        try {
            const channel = await client.channels.fetch(tierMapping.channel_id) as TextChannel;

            if (channel && channel.isTextBased()) {
                const embed = createPostEmbed({
                    title,
                    url,
                    tierName,
                    tags: attributes.tags,
                    collections: undefined,
                    isUpdate: false
                });

                await channel.send({ embeds: [embed] });
                logger.info(`✅ New post alert sent to ${tierName} channel: ${title}`);
            }
        } catch (error) {
            logger.error(`Failed to send post alert to ${tierName} channel`, error as Error);
        }

        // Save to database using db.addPost (ensures correct schema mapping)
        await db.addPost(postId, tierName, title);
        logger.info('📝 ========================================\n');

    } catch (error) {
        logger.error('Error handling posts:publish webhook', error as Error);
        throw error;
    }
}
