import { WebhookPayload } from '../../database/schema';
import { upsertTrackedMember, getTrackedMember } from '../../database/db';
import { client } from '../../index';
import { TextChannel } from 'discord.js';
import { createMemberEmbed } from '../../utils/embedBuilder';
import { logger } from '../../utils/logger';
import { getTierRank } from '../../utils/tierRanking';
import { getEventChannel } from '../../commands/admin/set-event-channel';

// ── Notification dedup guard ───────────────────────────────────────
// Patreon fires both members:pledge:create AND the legacy pledges:create
// for the same action.  Both route to this handler, so we track member IDs
// that have already been notified within a short window.
const NOTIFY_DEDUP_TTL_MS = 60_000; // 60 seconds
const recentlyNotified = new Map<string, number>(); // memberId → timestamp

// Cleanup expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of recentlyNotified) {
        if (now - ts > NOTIFY_DEDUP_TTL_MS) recentlyNotified.delete(id);
    }
}, 5 * 60_000);

/**
 * Handle members:pledge:create webhook event
 * Triggered when a patron creates a new pledge (starts a subscription)
 * 
 * This is the SINGLE SOURCE of Discord welcome / upgrade notifications.
 * The members:create handler only tracks data; the legacy pledges:create
 * event routes here too, so a per-member dedup guard prevents duplicates.
 */
export async function handleMembersPledgeCreate(payload: WebhookPayload): Promise<void> {
    try {
        const member = payload.data;
        const included = payload.included || [];

        // Extract member data from attributes (same structure as members:create)
        const memberId = member.id;
        const attributes = member.attributes || {};
        const relationships = member.relationships || {};

        // Get member name — try attributes first, then fall back to included user data
        let fullName = attributes.full_name;
        let email = attributes.email || null;

        if (!fullName) {
            // Fall back: look for user in included data via relationships
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

        logger.info(`📥 [PLEDGE:CREATE] Processing pledge for: ${fullName} (ID: ${memberId})`);

        // ── Notification dedup: skip if we already notified for this member ──
        const now = Date.now();
        const lastNotified = recentlyNotified.get(memberId);
        if (lastNotified && now - lastNotified < NOTIFY_DEDUP_TTL_MS) {
            logger.info(`🔁 [PLEDGE:CREATE] Already notified for member ${memberId} — skipping duplicate`);
            return;
        }

        // Get tier information — try currently_entitled_tiers first, fall back to tier
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
            }
        } else if (singleTier) {
            const tierInfo = included.find((item: any) =>
                item.type === 'tier' && item.id === singleTier.id
            );
            if (tierInfo) {
                tierName = tierInfo.attributes?.title || 'Unknown Tier';
                tierId = singleTier.id;
            }
        }

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

        await upsertTrackedMember(trackedMember);

        // Mark this member as notified (dedup guard)
        recentlyNotified.set(memberId, now);

        // Route to the correct event channel based on whether this is new or upgrade
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
                    }
                } catch (error) {
                    logger.warn('Failed to send welcome alert', error as Error);
                }
            }
            logger.info(`🆕 New pledge created: ${fullName} (${tierName})`);
        } else {
            logger.info(`ℹ️ Pledge re-created (same tier): ${fullName} (${tierName})`);
        }

    } catch (error) {
        logger.error('Error handling members:pledge:create webhook', error as Error);
        throw error;
    }
}

