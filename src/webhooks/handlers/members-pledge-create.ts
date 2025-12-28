import { WebhookPayload } from '../../database/schema';
import { upsertTrackedMember } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { config } from '../../config';

/**
 * Handle members:pledge:create webhook event
 * Triggered when a patron creates a new pledge (starts a subscription)
 */
export async function handleMembersPledgeCreate(payload: WebhookPayload): Promise<void> {
    try {
        const pledge = payload.data;
        const included = payload.included || [];

        // Extract pledge data
        const relationships = pledge.relationships || {};

        // Get member information from relationships
        const memberData = relationships.patron?.data;
        if (!memberData) {
            logger.warn('No patron data in pledge:create webhook');
            return;
        }

        // Find member details from included data
        const memberInfo = included.find((item: any) =>
            item.type === 'user' && item.id === memberData.id
        );

        const memberId = memberData.id;
        const fullName = memberInfo?.attributes?.full_name || 'Unknown Member';
        const email = memberInfo?.attributes?.email || null;

        // Get tier information
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

        // Store member in database
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            current_tier_id: tierId,
            email: email,
            joined_at: Date.now(),
            updated_at: Date.now()
        };

        await upsertTrackedMember(trackedMember);

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
                logger.warn('Failed to send pledge creation alert', error as Error);
            }
        }

        logger.info(`New pledge created: ${fullName} (${tierName})`);

    } catch (error) {
        logger.error('Error handling members:pledge:create webhook', error as Error);
        throw error;
    }
}
