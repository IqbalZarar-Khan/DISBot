import { WebhookPayload } from '../../database/schema';
import { getTrackedMember } from '../../database/db';
import { queueMemberUpsert } from '../../database/batchWriter';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
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

        // Resolve previous tier before resetting to free in DB
        let previousTierName: string | null = null;
        if (existingMember && existingMember.current_tier_id && existingMember.current_tier_id !== 'free') {
            const { getTierMapping } = await import('../../database/db');
            const { tierIdMap } = await import('../../utils/tierRanking');
            const mapping = await getTierMapping(existingMember.current_tier_id);
            previousTierName = mapping?.tier_name || tierIdMap[existingMember.current_tier_id] || (existingMember.current_tier_id.toLowerCase() !== 'free' ? existingMember.current_tier_id : null);
        }

        if (!previousTierName || previousTierName.toLowerCase() === 'free') {
            const tierRef = relationships.tier?.data;
            if (tierRef) {
                const tierInfo = included.find((item: any) => item.type === 'tier' && item.id === tierRef.id);
                if (tierInfo?.attributes?.title) {
                    previousTierName = tierInfo.attributes.title;
                }
            }
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

        // Send cancellation notification to event-routed channel or log channel
        const { getEventChannel } = await import('../../commands/admin/set-event-channel');
        const eventChannelId = (await getEventChannel('pledge_delete')) || config.logChannelId;
        if (eventChannelId) {
            try {
                const channel = await client.channels.fetch(eventChannelId) as TextChannel;
                if (channel) {
                    const { createDepartureEmbed } = await import('../../utils/embedBuilder');
                    const embed = createDepartureEmbed({
                        fullName,
                        tierName: previousTierName,
                        isCancellation: true,
                    });

                    await channel.send({ embeds: [embed] });
                }
            } catch (error) {
                logger.warn('Failed to send pledge deletion alert', error as Error);
            }
        }

        logger.info(`Pledge deleted: ${fullName}${previousTierName ? ` (${previousTierName})` : ''}`);

    } catch (error) {
        logger.error('Error handling members:pledge:delete webhook', error as Error);
        throw error;
    }
}
