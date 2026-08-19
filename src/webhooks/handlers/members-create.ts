import { WebhookPayload } from '../../database/schema';
import { getTrackedMember } from '../../database/db';
import { queueMemberUpsert } from '../../database/batchWriter';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { getEventChannel } from '../../commands/admin/set-event-channel';

/**
 * Handle members:create webhook event
 * 
 * Sends a welcome notification for ALL new members (free or paid).
 * The members:pledge:create handler will only send upgrade/downgrade
 * notifications for existing members, avoiding duplicate welcomes.
 * 
 * Important: if the member already exists we preserve their current tier
 * so the pledge handler can still detect upgrades.
 */
export async function handleMembersCreate(payload: WebhookPayload): Promise<boolean> {
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

        queueMemberUpsert(trackedMember);

        // Send welcome notification for ALL new members (free or paid).
        // Previously only free members were welcomed here, with paid members
        // deferred to members:pledge:create — but that handler isn't guaranteed
        // to fire (test payloads, Patreon delivery quirks, race conditions).
        // The pledge handler checks `!isExisting` before sending its own welcome,
        // so it naturally avoids duplicates since this handler upserts first.
        if (!existingMember) {
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
                        logger.info(`🎉 [MEMBERS:CREATE] Welcome sent: ${fullName} (${tierName})`);
                        return true; // ✅ Discord announcement was sent
                    }
                } catch (error) {
                    logger.warn('Failed to send member welcome alert', error as Error);
                }
            }
            logger.info(`⚠️ [MEMBERS:CREATE] Welcome NOT sent (no channel configured): ${fullName}`);
        } else {
            logger.info(`📋 [MEMBERS:CREATE] Returning member tracked: ${fullName} (${tierName}) — no welcome (already known)`);
        }

        return false; // No Discord announcement from this handler

    } catch (error) {
        logger.error('Error handling members:create webhook', error as Error);
        throw error;
    }
}

