import { WebhookPayload } from '../../database/schema';
import { upsertTrackedMember, getTrackedMember } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { getTierRank } from '../../utils/tierRanking';

/**
 * Handle members:pledge:update webhook event
 * Triggered when a pledge is updated (tier change, payment status change, etc.)
 */
export async function handleMembersPledgeUpdate(payload: WebhookPayload): Promise<void> {
    try {
        const pledge = payload.data;
        const included = payload.included || [];

        // Extract pledge data
        const relationships = pledge.relationships || {};

        // Get member information
        const memberData = relationships.patron?.data;
        if (!memberData) {
            logger.warn('No patron data in pledge:update webhook');
            return;
        }

        // Find member details from included data
        const memberInfo = included.find((item: any) =>
            item.type === 'user' && item.id === memberData.id
        );

        const memberId = memberData.id;
        const fullName = memberInfo?.attributes?.full_name || 'Unknown Member';
        const email = memberInfo?.attributes?.email || null;

        // Get current tier from database
        const existingMember = await getTrackedMember(memberId);
        const oldTierId = existingMember?.current_tier_id || 'free';

        // Get new tier information
        const tierData = relationships.tier?.data;
        let tierName = 'Free';
        let tierId = 'free';

        if (tierData) {
            const tierInfo = included.find((item: any) =>
                item.type === 'tier' && item.id === tierData.id
            );

            if (tierInfo) {
                tierName = tierInfo.attributes?.title || 'Unknown Tier';
                tierId = tierData.id;
            }
        }

        // Check if tier changed
        const tierChanged = oldTierId !== tierId;
        const isUpgrade = tierChanged && getTierRank(tierId) > getTierRank(oldTierId);

        // Update member in database
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            current_tier_id: tierId,
            email: email,
            joined_at: existingMember?.joined_at || Date.now(),
            updated_at: Date.now()
        };

        await upsertTrackedMember(trackedMember);

        // Send tier change notification if tier changed
        if (tierChanged && config.logChannelId) {
            try {
                const channel = await client.channels.fetch(config.logChannelId) as TextChannel;
                if (channel) {
                    const embed = createMemberEmbed({
                        fullName,
                        tierName,
                        isUpgrade
                    });

                    await channel.send({ embeds: [embed] });
                }
            } catch (error) {
                logger.warn('Failed to send pledge update alert', error as Error);
            }
        }

        logger.info(`Pledge updated: ${fullName} (${tierName})${tierChanged ? ` - ${isUpgrade ? 'Upgrade' : 'Downgrade'}` : ''}`);

    } catch (error) {
        logger.error('Error handling members:pledge:update webhook', error as Error);
        throw error;
    }
}
