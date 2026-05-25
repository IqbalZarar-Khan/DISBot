import { WebhookEventType } from '../database/schema';
import { logger } from '../utils/logger';
import { markWebhookProcessed } from '../database/webhookCache';
import { recordWebhook } from '../commands/admin/status';

/**
 * Route webhook events to appropriate handlers.
 * Extracted from server.ts so it can be used by both the Fastify endpoint
 * (direct mode / fallback) and the BullMQ worker (queue mode).
 *
 * @param eventType - Patreon webhook event type
 * @param payload   - Full parsed webhook payload
 * @param logId     - webhook_log row id (from webhookCache); null if DB unavailable
 */
export async function routeWebhookEvent(
    eventType: WebhookEventType,
    payload: any,
    logId: number | null = null
): Promise<void> {
    let announced = false;

    try {
        logger.info(`🔀 [ROUTER] Routing event: ${eventType}`);

        switch (eventType) {
            case 'members:create': {
                logger.info(`📥 [HANDLER] Loading members:create handler...`);
                const { handleMembersCreate } = await import('./handlers/members-create');
                announced = await handleMembersCreate(payload);
                break;
            }

            case 'members:update': {
                logger.info(`📥 [HANDLER] Loading members:update handler...`);
                const { handleMembersUpdate } = await import('./handlers/members-update');
                await handleMembersUpdate(payload);
                break;
            }

            case 'members:delete': {
                logger.info(`📥 [HANDLER] Loading members:delete handler...`);
                const { handleMembersDelete } = await import('./handlers/members-delete');
                await handleMembersDelete(payload);
                break;
            }

            case 'members:pledge:create': {
                logger.info(`📥 [HANDLER] Loading members:pledge:create handler...`);
                const { handleMembersPledgeCreate } = await import('./handlers/members-pledge-create');
                announced = await handleMembersPledgeCreate(payload);
                break;
            }

            case 'members:pledge:update': {
                logger.info(`📥 [HANDLER] Loading members:pledge:update handler...`);
                const { handleMembersPledgeUpdate } = await import('./handlers/members-pledge-update');
                await handleMembersPledgeUpdate(payload);
                break;
            }

            case 'members:pledge:delete': {
                logger.info(`📥 [HANDLER] Loading members:pledge:delete handler...`);
                const { handleMembersPledgeDelete } = await import('./handlers/members-pledge-delete');
                await handleMembersPledgeDelete(payload);
                break;
            }

            case 'posts:publish': {
                logger.info(`📥 [HANDLER] Loading posts:publish handler...`);
                const { handlePostsPublish } = await import('./handlers/posts-publish');
                announced = await handlePostsPublish(payload);
                break;
            }

            case 'posts:update': {
                logger.info(`📥 [HANDLER] Loading posts:update handler...`);
                const { handlePostsUpdate } = await import('./handlers/posts-update');
                await handlePostsUpdate(payload);
                break;
            }

            case 'posts:delete': {
                logger.info(`📥 [HANDLER] Loading posts:delete handler...`);
                const { handlePostsDelete } = await import('./handlers/posts-delete');
                await handlePostsDelete(payload);
                break;
            }

            default:
                logger.warn(`⚠️ [IGNORED] No handler registered for event type: ${eventType}`);
                logger.warn(`⚠️ [IGNORED] Available handlers: members:*, members:pledge:*, posts:*`);
        }

        // Mark the cached row as successfully processed
        await markWebhookProcessed(logId, announced);
        recordWebhook(true); // ✅ increment webhook success counter

    } catch (error) {
        logger.error(`❌ [HANDLER ERROR] Error in webhook handler for ${eventType}`, error as Error);
        logger.error(`❌ [HANDLER ERROR] Stack: ${(error as Error).stack}`);
        // Mark processed=false is the default — we only update on success above
        // But we still update announced=false with a note so the cache row shows the error
        await markWebhookProcessed(logId, false, `Handler threw: ${(error as Error).message}`);
        recordWebhook(false); // ❌ increment webhook failure counter
        throw error;
    }
}

