import { WebhookPayload } from '../../database/schema';
import { getTrackedMember } from '../../database/db';
import { queueMemberUpsert } from '../../database/batchWriter';
import { client } from '../../index';
import { TextChannel, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger';
import { config } from '../../config';

/**
 * Handle members:pledge:delete webhook event
 * Triggered when a patron cancels their pledge
 */
export async function handleMembersPledgeDelete(payload: WebhookPayload): Promise<void> {
    try {
        const pledge = payload.data;
        const included = payload.included || [];

        // Extract pledge data
        const relationships = pledge.relationships || {};

        // Get member information
        const memberData = relationships.patron?.data;
        if (!memberData) {
            logger.warn('No patron data in pledge:delete webhook');
            return;
        }

        // Find member details from included data
        const memberInfo = included.find((item: any) =>
            item.type === 'user' && item.id === memberData.id
        );

        const memberId = memberData.id;
        const fullName = memberInfo?.attributes?.full_name || 'Unknown Member';
        const email = memberInfo?.attributes?.email || null;

        // Get existing member data
        const existingMember = await getTrackedMember(memberId);

        // Update member to free tier (pledge deleted)
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            current_tier_id: 'free',
            email: email,
            joined_at: existingMember?.joined_at || Date.now(),
            updated_at: Date.now()
        };

        queueMemberUpsert(trackedMember);

        // Sync Discord role: remove old tier role
        if (existingMember && existingMember.current_tier_id !== 'free') {
            try {
                const { isRoleSyncEnabled, syncMemberRole } = await import('../../utils/roleSync');
                if (await isRoleSyncEnabled()) {
                    const { config: appConfig } = await import('../../config');
                    await syncMemberRole(appConfig.guildId, memberId, 'free', existingMember.current_tier_id);
                }
            } catch (syncErr) {
                logger.warn(`🔄 [ROLE SYNC] Failed for ${fullName}: ${(syncErr as Error).message}`);
            }
        }

        // Send cancellation notification to log channel
        if (config.logChannelId) {
            try {
                const channel = await client.channels.fetch(config.logChannelId) as TextChannel;
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Pledge Cancelled')
                        .setDescription(`**${fullName}** has cancelled their pledge.`)
                        .setColor(0xFF0000)
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });
                }
            } catch (error) {
                logger.warn('Failed to send pledge deletion alert', error as Error);
            }
        }

        logger.info(`Pledge deleted: ${fullName}`);

    } catch (error) {
        logger.error('Error handling members:pledge:delete webhook', error as Error);
        throw error;
    }
}
