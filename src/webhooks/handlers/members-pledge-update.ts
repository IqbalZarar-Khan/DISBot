import { WebhookPayload } from '../../database/schema';
import { getTrackedMember } from '../../database/db';
import { queueMemberUpsert } from '../../database/batchWriter';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { getTierRank } from '../../utils/tierRanking';
import { getEventChannel } from '../../commands/admin/set-event-channel';
import { markMemberWelcomed, wasRecentlyWelcomed } from '../welcomeGuard';

/**
 * Handle members:pledge:update webhook event
 * Triggered when a pledge is updated (tier change, payment status change, etc.)
 */
export async function handleMembersPledgeUpdate(payload: WebhookPayload): Promise<void> {
    try {
        const pledge = payload.data;
        const included = payload.included || [];

        // Extract pledge data & relationships
        const relationships = pledge.relationships || {};

        // Get member information with multi-layer fallback
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
            logger.warn('No patron or member data in pledge:update webhook');
            return;
        }

        // Get current tier from database & recover name if needed
        const existingMember = await getTrackedMember(memberId);
        if ((!fullName || fullName === 'Unknown Member') && existingMember?.full_name) {
            fullName = existingMember.full_name;
        }
        if (!fullName) {
            fullName = 'Unknown Member';
        }
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

        // A departed member with a paid pledge in this update is re-pledging —
        // that's a return, not an upgrade. Flip the row back to active so
        // later events don't re-announce the return.
        const isReturningMember = !!existingMember && existingMember.is_active === false && tierId !== 'free';

        // Update member in database
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            current_tier_id: tierId,
            email: email,
            joined_at: existingMember?.joined_at || Date.now(),
            updated_at: Date.now(),
            ...(isReturningMember ? { is_active: true } : {})
        };

        queueMemberUpsert(trackedMember);

        // Sync Discord role if enabled
        if (tierChanged) {
            try {
                const { isRoleSyncEnabled, syncMemberRole } = await import('../../utils/roleSync');
                if (await isRoleSyncEnabled()) {
                    const { config: appConfig } = await import('../../config');
                    await syncMemberRole(appConfig.guildId, memberId, tierId, oldTierId);
                }
            } catch (syncErr) {
                logger.warn(`🔄 [ROLE SYNC] Failed for ${fullName}: ${(syncErr as Error).message}`);
            }
        }

        // Announce tier changes. A departed member re-pledging is announced as
        // a return (the create handlers may not have fired); the welcome guard
        // prevents double announcements across handlers.
        if (isReturningMember && !wasRecentlyWelcomed(memberId)) {
            const eventChannelId = await getEventChannel('member_join');
            if (eventChannelId) {
                try {
                    const channel = await client.channels.fetch(eventChannelId) as TextChannel;
                    if (channel) {
                        const embed = createMemberEmbed({
                            fullName,
                            tierName,
                            isUpgrade: false,
                            isReturning: true
                        });
                        await channel.send({ embeds: [embed] });
                        markMemberWelcomed(memberId);
                    }
                } catch (error) {
                    logger.warn('Failed to send welcome-back alert', error as Error);
                }
            }
            logger.info(`🆕 [PLEDGE:UPDATE] Departed member re-pledging: ${fullName} (${tierName})`);
        } else if (isReturningMember) {
            logger.info(`📋 [PLEDGE:UPDATE] Welcome Back skipped (already announced moments ago): ${fullName}`);
        } else if (tierChanged && !wasRecentlyWelcomed(memberId)) {
            const eventType = isUpgrade ? 'pledge_upgrade' : 'pledge_downgrade';
            const eventChannelId = await getEventChannel(eventType);
            if (eventChannelId) {
                try {
                    const channel = await client.channels.fetch(eventChannelId) as TextChannel;
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
        }

        logger.info(`Pledge updated: ${fullName} (${tierName})${tierChanged ? ` - ${isUpgrade ? 'Upgrade' : 'Downgrade'}` : ''}`);

    } catch (error) {
        logger.error('Error handling members:pledge:update webhook', error as Error);
        throw error;
    }
}
