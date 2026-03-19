import { WebhookPayload } from '../../database/schema';
import { upsertTrackedMember, getTrackedMember } from '../../database/db';
import { logger } from '../../utils/logger';

/**
 * Handle members:create webhook event
 * 
 * DATA-ONLY handler: tracks the member in the database but does NOT send
 * Discord notifications. The members:pledge:create handler is the single
 * source of welcome / upgrade messages (Patreon fires both events together,
 * so sending from both would cause duplicates).
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

        logger.info(`📋 [MEMBERS:CREATE] Tracked member: ${fullName} (${tierName}) — notifications deferred to pledge handler`);

    } catch (error) {
        logger.error('Error handling members:create webhook', error as Error);
        throw error;
    }
}
