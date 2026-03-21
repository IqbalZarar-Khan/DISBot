import { WebhookPayload } from '../../database/schema';
import { upsertTrackedMember, getTrackedMember } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { getEventChannel } from '../../commands/admin/set-event-channel';

/**
 * Handle members:create webhook event
 * 
 * For FREE members: sends a welcome notification (they never trigger
 * members:pledge:create because there is no pledge).
 * 
 * For PAID members: data-only tracking — the members:pledge:create handler
 * sends the welcome/upgrade notification to avoid duplicates.
 * 
 * Important: if the member already exists we preserve their current tier
 * so the pledge handler can still detect upgrades.
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

        // Check if member already exists — preserve old tier for upgrade detection
        const existingMember = await getTrackedMember(memberId);

        // Store member in database
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            // Keep the old tier if member already exists so pledge:create can
            // compare old vs new and detect upgrades correctly
            current_tier_id: existingMember ? existingMember.current_tier_id : tierId,
            email: email,
            joined_at: existingMember?.joined_at || Date.now(),
            updated_at: Date.now()
        };

        await upsertTrackedMember(trackedMember);

        // Send welcome notification ONLY for free-tier members.
        // Free members never trigger members:pledge:create (no pledge),
        // so this is their only chance for a welcome message.
        // Paid members are handled by the pledge handler.
        const isFreeOnly = tierId === 'free';

        if (isFreeOnly && !existingMember) {
            const eventChannelId = await getEventChannel('member_join');
            if (eventChannelId) {
                try {
                    const channel = await client.channels.fetch(eventChannelId) as TextChannel;
                    if (channel) {
                        const embed = createMemberEmbed({
                            fullName,
                            tierName,
                            isUpgrade: false
                        });
                        await channel.send({ embeds: [embed] });
                    }
                } catch (error) {
                    logger.warn('Failed to send free member welcome alert', error as Error);
                }
            }
            logger.info(`🆓 [MEMBERS:CREATE] Free member welcome sent: ${fullName}`);
        } else {
            logger.info(`📋 [MEMBERS:CREATE] Tracked member: ${fullName} (${tierName}) — notifications deferred to pledge handler`);
        }

    } catch (error) {
        logger.error('Error handling members:create webhook', error as Error);
        throw error;
    }
}

