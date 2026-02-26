import { WebhookPayload } from '../../database/schema';
import { getTrackedMember } from '../../database/db';
import { logger } from '../../utils/logger';
import { client } from '../../index';
import { TextChannel, EmbedBuilder } from 'discord.js';
import { getEventChannel } from '../../commands/admin/set-event-channel';

/**
 * Handle members:delete webhook event
 */
export async function handleMembersDelete(payload: WebhookPayload): Promise<void> {
    try {
        const member = payload.data;
        const memberId = member.id;

        // Get member info from database
        const trackedMember = await getTrackedMember(memberId);

        if (trackedMember) {
            logger.info(`Member departed: ${trackedMember.full_name}`);

            // Send departure log to event-routed channel
            const eventChannelId = await getEventChannel('member_leave');
            if (eventChannelId) {
                try {
                    const channel = await client.channels.fetch(eventChannelId) as TextChannel;
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setTitle('👋 Member Departed')
                            .setDescription(`**${trackedMember.full_name}** has ended their pledge.`)
                            .setColor(0x808080)
                            .setTimestamp();

                        await channel.send({ embeds: [embed] });
                    }
                } catch (error) {
                    logger.warn('Failed to send departure log', error as Error);
                }
            }

            // Note: We keep the member in the database for historical purposes
            // You could add a 'is_active' flag if you want to mark them as inactive
        }

    } catch (error) {
        logger.error('Error handling members:delete webhook', error as Error);
        throw error;
    }
}
