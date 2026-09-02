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
        const pledge = payload.data || {};
        const included = payload.included || [];

        // Extract pledge data & relationships
        const relationships = pledge.relationships || {};

        // Extract member/patron reference using multi-layer resolution:
        // 1. relationships.patron?.data (pledge schema)
        // 2. relationships.user?.data (member schema)
        // 3. payload.data if it's a member record
        // 4. included[] user record
        const patronRef = relationships.patron?.data || relationships.user?.data;
        let memberId = patronRef?.id || (pledge.type === 'member' ? pledge.id : null) || pledge.id;
        let fullName = pledge.attributes?.full_name || '';
        let email = pledge.attributes?.email || null;

        if (patronRef) {
            const userInfo = included.find((item: any) =>
                item.type === 'user' && item.id === patronRef.id
            );
            if (userInfo?.attributes?.full_name) {
                fullName = userInfo.attributes.full_name;
            }
            if (userInfo?.attributes?.email) {
                email = email || userInfo.attributes.email;
            }
        }

        if (!fullName) {
            const userInIncluded = included.find((item: any) => item.type === 'user' && item.attributes?.full_name);
            if (userInIncluded?.attributes?.full_name) {
                fullName = userInIncluded.attributes.full_name;
                if (!memberId) memberId = userInIncluded.id;
                email = email || userInIncluded.attributes?.email;
            }
        }

        if (!memberId) {
            logger.warn('No patron or member data in pledge:delete webhook');
            return;
        }

        // Get existing member data to recover previous name if missing from payload
        const existingMember = await getTrackedMember(memberId);
        if ((!fullName || fullName === 'Unknown Member') && existingMember?.full_name) {
            fullName = existingMember.full_name;
        }
        if (!fullName) {
            fullName = 'Unknown Member';
        }

        // Update member to free tier (pledge deleted)
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            current_tier_id: 'free',
            email: email,
            joined_at: existingMember?.joined_at || Date.now(),
            updated_at: Date.now(),
            is_active: existingMember?.is_active ?? true
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
