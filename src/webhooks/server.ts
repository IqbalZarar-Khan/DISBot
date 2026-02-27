import express, { Request, Response } from 'express';
import * as crypto from 'crypto';
import { verifyWebhookSignature } from './verify';
import { logger } from '../utils/logger';
import { WebhookEventType } from '../database/schema';

// ── Webhook idempotency guard ──────────────────────────────────────
// Prevents duplicate notifications when Patreon retries the same webhook.
const DEDUP_TTL_MS = 60_000; // 60 seconds
const recentWebhooks = new Map<string, number>(); // hash → timestamp

// Clean expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [hash, ts] of recentWebhooks) {
        if (now - ts > DEDUP_TTL_MS) recentWebhooks.delete(hash);
    }
}, 5 * 60_000);

function isDuplicate(body: string, eventType: string): boolean {
    const hash = crypto.createHash('md5').update(eventType + body).digest('hex');
    const now = Date.now();
    const lastSeen = recentWebhooks.get(hash);
    if (lastSeen && now - lastSeen < DEDUP_TTL_MS) return true;
    recentWebhooks.set(hash, now);
    return false;
}

let server: any = null;

/**
 * Start the webhook server
 */
export async function startWebhookServer(port: number, webhookSecret: string): Promise<void> {
    const app = express();

    // Raw body parser for signature verification
    app.use(express.json({
        verify: (req: any, _res, buf) => {
            req.rawBody = buf.toString('utf8');
        }
    }));

    // Health check endpoint
    app.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Patreon webhook endpoint
    app.post('/webhooks/patreon', async (req: Request, res: Response) => {
        try {
            // --- 🔍 TRAFFIC CONTROL DEBUG START ---
            const eventType = req.headers['x-patreon-event'] as WebhookEventType;
            const signature = req.headers['x-patreon-signature'] as string;
            const rawBody = (req as any).rawBody;

            logger.info('\n📡 ========================================');
            logger.info('📡 [INCOMING WEBHOOK TRAFFIC]');
            logger.info('📡 ========================================');
            logger.info(`📡 Event Type Header: "${eventType}"`);
            logger.info(`📡 Signature Present: ${!!signature}`);
            logger.info(`📡 Raw Body Length: ${rawBody?.length || 0} bytes`);
            logger.info(`📡 Request Headers: ${JSON.stringify({
                'x-patreon-event': eventType,
                'x-patreon-signature': signature ? '***present***' : 'missing',
                'content-type': req.headers['content-type']
            })}`);

            // Verify signature
            if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
                logger.error('⛔ [SECURITY BLOCK] Signature verification FAILED');
                logger.error(`⛔ Signature: ${signature ? 'present but invalid' : 'missing'}`);
                logger.info('📡 ========================================\n');
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }

            logger.info('✅ [SECURITY PASS] Signature verified successfully');

            // Idempotency guard: skip duplicate webhooks
            if (isDuplicate(rawBody, eventType || '')) {
                logger.warn('🔁 [DEDUP] Duplicate webhook detected — skipping');
                res.status(200).json({ received: true, duplicate: true });
                return;
            }

            if (!eventType) {
                logger.warn('⚠️ [MISSING HEADER] x-patreon-event header not found');
                logger.info('📡 ========================================\n');
                res.status(400).json({ error: 'Missing event type' });
                return;
            }

            // Log webhook received
            logger.info(`👉 [ROUTING] Event type: ${eventType}`);
            logger.info(`👉 [ROUTING] Payload data ID: ${req.body?.data?.id || 'unknown'}`);
            logger.info(`👉 [ROUTING] Included items: ${req.body?.included?.length || 0}`);

            // Route to appropriate handler
            logger.info(`🚀 [EXECUTING] Calling handler for ${eventType}...`);
            await routeWebhookEvent(eventType, req.body);
            logger.info(`✅ [COMPLETE] Handler for ${eventType} completed successfully`);

            logger.info('📡 [END TRAFFIC] ========================================\n');

            // Acknowledge receipt
            res.status(200).json({ received: true });

        } catch (error) {
            logger.error('❌ [CRASH] Error processing webhook in server.ts', error as Error);
            logger.error(`❌ Stack trace: ${(error as Error).stack}`);
            logger.info('📡 [END TRAFFIC - ERROR] ========================================\n');
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Start server
    return new Promise((resolve, reject) => {
        server = app.listen(port, () => {
            console.log(`✅ Webhook server listening on port ${port}`);
            resolve();
        }).on('error', (error) => {
            reject(error);
        });
    });
}

/**
 * Route webhook events to appropriate handlers
 */
async function routeWebhookEvent(eventType: WebhookEventType, payload: any): Promise<void> {
    try {
        logger.info(`🔀 [ROUTER] Routing event: ${eventType}`);

        switch (eventType) {
            case 'members:create':
                logger.info(`📥 [HANDLER] Loading members:create handler...`);
                const { handleMembersCreate } = await import('./handlers/members-create');
                await handleMembersCreate(payload);
                break;

            case 'members:update':
                logger.info(`📥 [HANDLER] Loading members:update handler...`);
                const { handleMembersUpdate } = await import('./handlers/members-update');
                await handleMembersUpdate(payload);
                break;

            case 'members:delete':
                logger.info(`📥 [HANDLER] Loading members:delete handler...`);
                const { handleMembersDelete } = await import('./handlers/members-delete');
                await handleMembersDelete(payload);
                break;

            case 'members:pledge:create':
                logger.info(`📥 [HANDLER] Loading members:pledge:create handler...`);
                const { handleMembersPledgeCreate } = await import('./handlers/members-pledge-create');
                await handleMembersPledgeCreate(payload);
                break;

            case 'members:pledge:update':
                logger.info(`📥 [HANDLER] Loading members:pledge:update handler...`);
                const { handleMembersPledgeUpdate } = await import('./handlers/members-pledge-update');
                await handleMembersPledgeUpdate(payload);
                break;

            case 'members:pledge:delete':
                logger.info(`📥 [HANDLER] Loading members:pledge:delete handler...`);
                const { handleMembersPledgeDelete } = await import('./handlers/members-pledge-delete');
                await handleMembersPledgeDelete(payload);
                break;

            case 'posts:publish':
                logger.info(`📥 [HANDLER] Loading posts:publish handler...`);
                const { handlePostsPublish } = await import('./handlers/posts-publish');
                await handlePostsPublish(payload);
                break;

            case 'posts:update':
                logger.info(`📥 [HANDLER] Loading posts:update handler...`);
                const { handlePostsUpdate } = await import('./handlers/posts-update');
                await handlePostsUpdate(payload);
                break;

            case 'posts:delete':
                logger.info(`📥 [HANDLER] Loading posts:delete handler...`);
                const { handlePostsDelete } = await import('./handlers/posts-delete');
                await handlePostsDelete(payload);
                break;

            // ── Legacy pledge events (Patreon sends both members:pledge:* AND pledges:*) ──
            case 'pledges:create':
                logger.info(`📥 [HANDLER] Legacy pledges:create → routing to members:pledge:create...`);
                const { handleMembersPledgeCreate: legacyPledgeCreate } = await import('./handlers/members-pledge-create');
                await legacyPledgeCreate(payload);
                break;

            case 'pledges:update':
                logger.info(`📥 [HANDLER] Legacy pledges:update → routing to members:pledge:update...`);
                const { handleMembersPledgeUpdate: legacyPledgeUpdate } = await import('./handlers/members-pledge-update');
                await legacyPledgeUpdate(payload);
                break;

            case 'pledges:delete':
                logger.info(`📥 [HANDLER] Legacy pledges:delete → routing to members:pledge:delete...`);
                const { handleMembersPledgeDelete: legacyPledgeDelete } = await import('./handlers/members-pledge-delete');
                await legacyPledgeDelete(payload);
                break;

            default:
                logger.warn(`⚠️ [IGNORED] No handler registered for event type: ${eventType}`);
                logger.warn(`⚠️ [IGNORED] Available handlers: members:*, members:pledge:*, pledges:*, posts:*`);
        }
    } catch (error) {
        logger.error(`❌ [HANDLER ERROR] Error in webhook handler for ${eventType}`, error as Error);
        logger.error(`❌ [HANDLER ERROR] Stack: ${(error as Error).stack}`);
        throw error;
    }
}

/**
 * Stop the webhook server
 */
export function stopWebhookServer(): Promise<void> {
    return new Promise((resolve) => {
        if (server) {
            server.close(() => {
                console.log('👋 Webhook server stopped');
                resolve();
            });
        } else {
            resolve();
        }
    });
}
