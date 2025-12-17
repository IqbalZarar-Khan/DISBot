import { WebhookPayload } from '../../database/schema';
import { upsertTrackedMember } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { config } from '../../config';

/**
 * Handle members:create webhook event
 */
export async function handleMembersCreate(payload: WebhookPayload): Promise<void> {
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
        let tierName = 'Free';
        let tierId = 'free';

        if (tierData.length > 0) {
            const firstTierId = tierData[0].id;
            const tierInfo = included.find((item: any) => item.type === 'tier' && item.id === firstTierId);

            if (tierInfo) {
                tierName = tierInfo.attributes?.title || 'Unknown Tier';
                tierId = firstTierId;
            }
        }

        // Store member in database
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            current_tier_id: tierId,
            email: email,
            joined_at: Date.now(),
            updated_at: Date.now()
        };

        upsertTrackedMember(trackedMember, config.databasePath);

        // Send welcome alert to log channel (if configured)
        if (config.logChannelId) {
            try {
                const channel = await client.channels.fetch(config.logChannelId) as TextChannel;
                if (channel) {
                    const embed = createMemberEmbed({
                        fullName,
                        tierName,
                        isUpgrade: false
                    });

                    await channel.send({ embeds: [embed] });
                }
            } catch (error) {
                logger.warn('Failed to send welcome alert', error as Error);
            }
        }

        logger.info(`New member: ${fullName} (${tierName})`);

    } catch (error) {
        logger.error('Error handling members:create webhook', error as Error);
        throw error;
    }
}
