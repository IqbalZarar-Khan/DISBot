import { WebhookPayload } from '../../database/schema';
import { getTrackedMember, upsertTrackedMember, getTierMapping } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { getTierRank, isUpgrade } from '../../utils/tierRanking';
import { logger } from '../../utils/logger';
import { config } from '../../config';

/**
 * Handle members:update webhook event
 */
export async function handleMembersUpdate(payload: WebhookPayload): Promise<void> {
    try {
        const member = payload.data;
        const included = payload.included || [];

        // Extract member data
        const memberId = member.id;
        const attributes = member.attributes || {};
        const fullName = attributes.full_name || 'Unknown Member';
        const email = attributes.email || null;

        // Get entitled tiers from relationships
        const relationships = member.relationships || {};
        const tierData = relationships.currently_entitled_tiers?.data || [];

        // Find tier info from included data
        let newTierName = 'Free';
        let newTierId = 'free';

        if (tierData.length > 0) {
            const firstTierId = tierData[0].id;
            const tierInfo = included.find((item: any) => item.type === 'tier' && item.id === firstTierId);

            if (tierInfo) {
                newTierName = tierInfo.attributes?.title || 'Unknown Tier';
                newTierId = firstTierId;
            }
        }

        // Get old member data from database
        const oldMember = await getTrackedMember(memberId);

        if (oldMember) {
            // Get tier mappings to find tier names
            const oldTierMapping = await getTierMapping(oldMember.current_tier_id);
            const oldTierName = oldTierMapping?.tier_name || 'Free';

            // Compare tier ranks
            const oldRank = getTierRank(oldTierName);
            const newRank = getTierRank(newTierName);

            // Check if this is an upgrade
            if (isUpgrade(oldRank, newRank)) {
                logger.info(`Member upgrade: ${fullName} (${oldTierName} → ${newTierName})`);

                // Send upgrade alert to log channel
                if (config.logChannelId) {
                    try {
                        const channel = await client.channels.fetch(config.logChannelId) as TextChannel;
                        if (channel) {
                            const embed = createMemberEmbed({
                                fullName,
                                tierName: newTierName,
                                isUpgrade: true
                            });

                            await channel.send({ embeds: [embed] });
                        }
                    } catch (error) {
                        logger.warn('Failed to send upgrade alert', error as Error);
                    }
                }
            }
        }

        // Update member in database
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            current_tier_id: newTierId,
            email: email,
            joined_at: oldMember?.joined_at || Date.now(),
            updated_at: Date.now()
        };

        await upsertTrackedMember(trackedMember);

    } catch (error) {
        logger.error('Error handling members:update webhook', error as Error);
        throw error;
    }
}
