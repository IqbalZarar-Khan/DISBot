import { WebhookPayload } from '../../database/schema';
import { getTrackedMember, setMemberActive } from '../../database/db';
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

            // Mark the row inactive so a later rejoin (members:create /
            // members:pledge:create) is recognized as a returning member and
            // gets a welcome-back instead of being silenced as "already known"
            try {
                await setMemberActive(memberId, false);
            } catch (markErr) {
                logger.warn(`Failed to mark member inactive: ${(markErr as Error).message}`);
            }

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

            // ── Win-Back DM: politely reach out to departing patrons ──
            try {
                const { getCustomMessage } = await import('../../database/db');
                const guild = await client.guilds.fetch(
                    (await import('../../config')).config.guildId
                );
                // Try to find the member in the guild by searching
                const members = await guild.members.fetch({ query: trackedMember.full_name, limit: 5 });
                const discordMember = members.find(m =>
                    m.displayName.toLowerCase() === trackedMember.full_name.toLowerCase() ||
                    m.user.username.toLowerCase() === trackedMember.full_name.toLowerCase()
                );

                if (discordMember) {
                    const template = await getCustomMessage('win_back');
                    const defaultMsg = `Hey ${discordMember.displayName} 👋\n\nThank you so much for your past support — it truly meant a lot! If you ever want to come back, we'd love to have you. 💙\n\nFeel free to reach out if there's anything we can do better!`;
                    const message = template
                        ? template.replace('{user}', discordMember.displayName).replace('{name}', trackedMember.full_name)
                        : defaultMsg;

                    await discordMember.send(message);
                    logger.info(`💌 [WIN-BACK] DM sent to ${discordMember.displayName}`);
                }
            } catch (dmErr) {
                logger.warn(`💌 [WIN-BACK] Could not DM departing patron: ${(dmErr as Error).message}`);
            }
        }

    } catch (error) {
        logger.error('Error handling members:delete webhook', error as Error);
        throw error;
    }
}
