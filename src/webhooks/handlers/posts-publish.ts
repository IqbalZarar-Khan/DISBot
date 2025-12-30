import { WebhookPayload } from '../../database/schema';
import { getTierMappingByName, db, getMessageTemplate } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createPostEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { tierIdMap, centsMap } from '../../utils/tierRanking';
import { handlePostsUpdate } from './posts-update';
import { formatMessage } from '../../utils/formatter';

/**
 * Handle posts:publish webhook event
 * CRITICAL: This also handles "Edit and Republish" workflow by redirecting to update handler
 * HYBRID BROADCAST: Sends to all channels when multiple tiers detected
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

        // --- HYBRID BROADCAST TIER DETECTION LOGIC ---

        // 1. Extract ALL tier IDs (not just first)
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

        // 2. Translate ALL tier IDs to tier names (not just first match)
        const detectedTierNames: string[] = [];

        for (const id of tierIds) {
            if (tierIdMap[id]) {
                detectedTierNames.push(tierIdMap[id]);
                logger.info(`✅ [ID MATCH] ${id} -> ${tierIdMap[id]}`);
            }
        }

        // Remove duplicates
        const uniqueTiers = [...new Set(detectedTierNames)];

        // 3. Fallback: Check Cents if no tiers detected via ID
        if (uniqueTiers.length === 0 && attributes.min_cents_pledged_to_view) {
            const cents = parseInt(attributes.min_cents_pledged_to_view);
            logger.info(`📝 Trying cents fallback: ${cents}`);

            if (centsMap[cents]) {
                uniqueTiers.push(centsMap[cents]);
                logger.info(`✅ [CENTS MATCH] ${cents} cents -> ${centsMap[cents]}`);
            }
        }

        // 4. Fallback: Check included data
        if (uniqueTiers.length === 0 && tierIds.length > 0) {
            for (const id of tierIds) {
                const includedTier = included.find((item: any) => item.type === 'tier' && String(item.id) === id);
                if (includedTier && includedTier.attributes && includedTier.attributes.title) {
                    uniqueTiers.push(includedTier.attributes.title);
                    logger.info(`✅ [TITLE MATCH] Found in included data: ${includedTier.attributes.title}`);
                }
            }
        }

        if (uniqueTiers.length === 0) {
            logger.error(`❌ Could not detect any tiers for post ${postId}`);
            logger.error(`❌ Tier IDs: ${JSON.stringify(tierIds)}`);
            logger.error(`❌ Available ID Map Keys: ${JSON.stringify(Object.keys(tierIdMap))}`);
            logger.error(`❌ Available Cents Map Keys: ${JSON.stringify(Object.keys(centsMap).map(Number))}`);
            logger.info('📝 ========================================\n');
            return;
        }

        logger.info(`📝 Detected ${uniqueTiers.length} tier(s): ${uniqueTiers.join(', ')}`);

        // ============================================================
        // 🔀 HYBRID BROADCAST LOGIC
        // ============================================================
        if (uniqueTiers.length > 1) {
            logger.info(`⚡ [HYBRID] Multiple tiers detected. Engaging BROADCAST mode.`);
        } else {
            logger.info(`💧 [HYBRID] Single tier detected. Engaging STANDARD mode.`);
        }

        // Send alerts to ALL detected tiers
        for (const tierName of uniqueTiers) {
            try {
                const tierMapping = await getTierMappingByName(tierName);

                if (!tierMapping) {
                    logger.warn(`No channel mapping found for tier: ${tierName}`);
                    logger.warn(`Use /admin set-channel tier_name:${tierName} channel:#your-channel`);
                    continue;
                }

                const channel = await client.channels.fetch(tierMapping.channel_id) as TextChannel;

                if (channel && channel.isTextBased()) {
                    // Fetch custom template from database
                    const dbTemplate = await getMessageTemplate('post_new');
                    const template = dbTemplate || "📢 New {tier} post: **{title}**\n{url}";

                    // Format message with actual values
                    const messageText = formatMessage(template, {
                        tier: tierName,
                        title: title,
                        url: url
                    });

                    const embed = createPostEmbed({
                        title,
                        url,
                        tierName,
                        tags: attributes.tags,
                        collections: undefined,
                        isUpdate: false
                    });
                    embed.setDescription(messageText);

                    await channel.send({ embeds: [embed] });
                    logger.info(`✅ Broadcast alert sent to ${tierName} channel: ${title}`);
                }
            } catch (error) {
                logger.error(`Failed to send alert to ${tierName} channel`, error as Error);
            }
        }

        // Save to database with the LOWEST tier (widest audience) for waterfall tracking
        const lowestTier = uniqueTiers[uniqueTiers.length - 1]; // Assuming tiers are ordered by rank
        await db.addPost(postId, lowestTier, title);
        logger.info(`💾 Saved post to database with tier: ${lowestTier}`);
        logger.info('📝 ========================================\n');

    } catch (error) {
        logger.error('Error handling posts:publish webhook', error as Error);
        throw error;
    }
}
