import { WebhookPayload } from '../../database/schema';
import { getTrackedMember } from '../../database/db';
import { queueMemberUpsert } from '../../database/batchWriter';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { getTierRank, tierIdMap, centsMap } from '../../utils/tierRanking';
import { getEventChannel } from '../../commands/admin/set-event-channel';
import { config } from '../../config';

/**
 * Handle members:pledge:create webhook event (Patreon v2)
 * Triggered when a patron creates a new pledge (starts a subscription)
 * 
 * Handles upgrade / downgrade notifications for EXISTING members.
 * Welcome notifications are handled by the members:create handler
 * (which upserts the member first), so this handler's `!isExisting`
 * branch is a safety-net fallback only.
 */
export async function handleMembersPledgeCreate(payload: WebhookPayload): Promise<boolean> {
    try {
        const member = payload.data;
        const included = payload.included || [];
        const attributes = member.attributes || {};
        const relationships = member.relationships || {};
        const memberId = member.id;

        // Get member name — try attributes first, then fall back to included user data
        let fullName = attributes.full_name || '';
        let email = attributes.email || null;

        if (!fullName) {
            const userData = relationships.user?.data || relationships.patron?.data;
            if (userData) {
                const userInfo = included.find((item: any) =>
                    item.type === 'user' && item.id === userData.id
                );
                fullName = userInfo?.attributes?.full_name || 'Unknown Member';
                email = email || userInfo?.attributes?.email || null;
            } else {
                fullName = 'Unknown Member';
            }
        }

        // Get tier information — multi-layer resolution:
        //   1. currently_entitled_tiers + included[] lookup
        //   2. relationships.tier + included[] lookup
        //   3. tierIdMap fallback (config-based tier ID → name)
        //   4. centsMap fallback (pledge amount → tier name)
        const entitledTiers = relationships.currently_entitled_tiers?.data || [];
        const singleTier = relationships.tier?.data;
        let tierName = 'Free';
        let tierId = 'free';

        if (entitledTiers.length > 0) {
            const firstTierId = entitledTiers[0].id;
            const tierInfo = included.find((item: any) =>
                item.type === 'tier' && item.id === firstTierId
            );
            if (tierInfo) {
                tierName = tierInfo.attributes?.title || 'Unknown Tier';
                tierId = firstTierId;
            } else if (tierIdMap[firstTierId]) {
                tierName = tierIdMap[firstTierId];
                tierId = firstTierId;
                logger.info(`📥 [PLEDGE:CREATE] Tier resolved via tierIdMap: ${firstTierId} → ${tierName}`);
            } else {
                tierId = firstTierId;
                tierName = 'Unknown Tier';
                logger.warn(`📥 [PLEDGE:CREATE] Tier ID ${firstTierId} not found in included[] or tierIdMap`);
            }
        } else if (singleTier) {
            const tierInfo = included.find((item: any) =>
                item.type === 'tier' && item.id === singleTier.id
            );
            if (tierInfo) {
                tierName = tierInfo.attributes?.title || 'Unknown Tier';
                tierId = singleTier.id;
            } else if (tierIdMap[singleTier.id]) {
                tierName = tierIdMap[singleTier.id];
                tierId = singleTier.id;
                logger.info(`📥 [PLEDGE:CREATE] Tier resolved via tierIdMap: ${singleTier.id} → ${tierName}`);
            }
        }

        // Final fallback: if still 'free', try to resolve from pledge amount (cents)
        if (tierId === 'free') {
            const pledgeCents = attributes.currently_entitled_amount_cents
                || attributes.pledge_amount_cents
                || attributes.amount_cents;
            if (pledgeCents && pledgeCents > 0 && centsMap[pledgeCents]) {
                tierName = centsMap[pledgeCents];
                const matchedTier = config.tierConfig?.find(t => t.name === tierName);
                if (matchedTier) tierId = matchedTier.id;
                logger.info(`📥 [PLEDGE:CREATE] Tier resolved via centsMap: ${pledgeCents}¢ → ${tierName}`);
            }
        }

        logger.info(`📥 [PLEDGE:CREATE] Processing pledge for: ${fullName} (ID: ${memberId})`);

        // Check if member already exists — determines welcome vs upgrade message
        const existingMember = await getTrackedMember(memberId);
        const oldTierId = existingMember?.current_tier_id || 'free';
        const isExisting = !!existingMember;
        const tierChanged = oldTierId !== tierId;
        const isUpgrade = tierChanged && getTierRank(tierId) > getTierRank(oldTierId);

        logger.info(`📥 [PLEDGE:CREATE] Existing member: ${isExisting}, Old tier: ${oldTierId}, New tier: ${tierId} (${tierName}), Upgrade: ${isUpgrade}`);

        // Store/update member in database
        const trackedMember = {
            member_id: memberId,
            full_name: fullName,
            current_tier_id: tierId,
            email: email,
            joined_at: existingMember?.joined_at || Date.now(),
            updated_at: Date.now()
        };

        queueMemberUpsert(trackedMember);

        // Sync Discord role if enabled
        try {
            const { isRoleSyncEnabled, syncMemberRole } = await import('../../utils/roleSync');
            if (await isRoleSyncEnabled()) {
                const { config: appConfig } = await import('../../config');
                await syncMemberRole(appConfig.guildId, memberId, tierId, oldTierId);
            }
        } catch (syncErr) {
            logger.warn(`🔄 [ROLE SYNC] Failed for ${fullName}: ${(syncErr as Error).message}`);
        }

        // Route to the correct event channel based on whether this is new or upgrade
        let announced = false;
        if (isExisting && tierChanged) {
            // Existing member upgrading — send upgrade notification
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
                        announced = true;
                    }
                } catch (error) {
                    logger.warn('Failed to send pledge upgrade/downgrade alert', error as Error);
                }
            }
            logger.info(`♻️ Pledge changed: ${fullName} → ${tierName} (${isUpgrade ? 'UPGRADE' : 'DOWNGRADE'})`);
        } else if (!isExisting) {
            // Brand new member — send welcome notification
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
                        announced = true;
                    }
                } catch (error) {
                    logger.warn('Failed to send welcome alert', error as Error);
                }
            }
            logger.info(`🆕 New pledge created: ${fullName} (${tierName})`);
        } else {
            logger.info(`ℹ️ Pledge re-created (same tier): ${fullName} (${tierName})`);
        }

        return announced;

    } catch (error) {
        logger.error('Error handling members:pledge:create webhook', error as Error);
        throw error;
    }
}
