import { WebhookPayload } from '../../database/schema';
import { getTrackedMember } from '../../database/db';
import { queueMemberUpsert } from '../../database/batchWriter';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { getEventChannel } from '../../commands/admin/set-event-channel';
import { tierIdMap } from '../../utils/tierRanking';
import { markMemberWelcomed, wasRecentlyWelcomed } from '../welcomeGuard';

/**
 * Handle members:create webhook event
 *
 * Sends a welcome notification for ALL new members (free or paid), including
 * returning members who previously departed (their row is kept in the DB for
 * history, so "already in DB" alone must not silence the welcome — check
 * is_active). The members:pledge:create handler will only send upgrade/
 * downgrade notifications for existing active members, avoiding duplicate
 * welcomes; the in-memory welcome guard covers the batch-write window.
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
            } else if (tierIdMap[firstTierId]) {
                // Tier object missing from included[] — resolve via config
                tierName = tierIdMap[firstTierId];
                tierId = firstTierId;
                logger.info(`📥 [MEMBERS:CREATE] Tier resolved via tierIdMap: ${firstTierId} → ${tierName}`);
            } else {
                // Entitled to a tier we can't name — still record the id so
                // it isn't misreported as Free
                tierId = firstTierId;
                tierName = 'Unknown Tier';
                logger.warn(`📥 [MEMBERS:CREATE] Tier ID ${firstTierId} not found in included[] or tierIdMap`);
            }
        }

        // Check if member already exists — preserve old tier for upgrade detection
        const existingMember = await getTrackedMember(memberId);
        // A departed member whose row we keep for history counts as returning,
        // not as "already known" — they get a welcome-back announcement.
        const isReturningMember = !!existingMember && existingMember.is_active === false;

        // Store member in database
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            // Keep the old tier if member already exists so pledge:create can
            // compare old vs new and detect upgrades correctly
            current_tier_id: existingMember ? existingMember.current_tier_id : tierId,
            email: email,
            joined_at: existingMember?.joined_at || Date.now(),
            updated_at: Date.now(),
            is_active: true
        };

        queueMemberUpsert(trackedMember);

        // Send welcome notification for ALL new members (free or paid).
        // Previously only free members were welcomed here, with paid members
        // deferred to members:pledge:create — but that handler isn't guaranteed
        // to fire (test payloads, Patreon delivery quirks, race conditions).
        if ((!existingMember || isReturningMember) && !wasRecentlyWelcomed(memberId)) {
            const eventChannelId = await getEventChannel('member_join');
            if (eventChannelId) {
                try {
                    const channel = await client.channels.fetch(eventChannelId) as TextChannel;
                    if (channel) {
                        const embed = createMemberEmbed({
                            fullName,
                            tierName,
                            isUpgrade: false,
                            isReturning: isReturningMember
                        });
                        await channel.send({ embeds: [embed] });
                        markMemberWelcomed(memberId);
                        logger.info(`🎉 [MEMBERS:CREATE] Welcome sent: ${fullName} (${tierName})${isReturningMember ? ' — returning member' : ''}`);
                        return true; // ✅ Discord announcement was sent
                    }
                } catch (error) {
                    logger.warn('Failed to send member welcome alert', error as Error);
                }
            }
            logger.info(`⚠️ [MEMBERS:CREATE] Welcome NOT sent (no channel configured): ${fullName}`);
        } else if (wasRecentlyWelcomed(memberId)) {
            logger.info(`📋 [MEMBERS:CREATE] Welcome skipped (already announced moments ago): ${fullName} (${tierName})`);
        } else {
            logger.info(`📋 [MEMBERS:CREATE] Active member re-seen: ${fullName} (${tierName}) — no welcome`);
        }

        return false; // No Discord announcement from this handler

    } catch (error) {
        logger.error('Error handling members:create webhook', error as Error);
        throw error;
    }
}

