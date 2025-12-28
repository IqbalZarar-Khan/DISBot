import { WebhookPayload } from '../../database/schema';
import { deleteTrackedPost } from '../../database/db';
import { client } from '../../index';
import { TextChannel, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger';
import { config } from '../../config';

/**
 * Handle posts:delete webhook event
 * Triggered when a post is deleted from Patreon
 */
export async function handlePostsDelete(payload: WebhookPayload): Promise<void> {
    try {
        const post = payload.data;
        const postId = post.id;
        const attributes = post.attributes || {};
        const title = attributes.title || 'Untitled Post';

        // Remove post from database
        deleteTrackedPost(postId);

        // Send deletion notification to log channel (if configured)
        if (config.logChannelId) {
            try {
                const channel = await client.channels.fetch(config.logChannelId) as TextChannel;
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Post Deleted')
                        .setDescription(`**${title}** has been deleted from Patreon.`)
                        .setColor(0x808080)
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });
                }
            } catch (error) {
                logger.warn('Failed to send post deletion notification', error as Error);
            }
        }

        logger.info(`Post deleted: ${title} (ID: ${postId})`);

    } catch (error) {
        logger.error('Error handling posts:delete webhook', error as Error);
        throw error;
    }
}
