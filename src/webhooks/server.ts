import express, { Request, Response } from 'express';
import { verifyWebhookSignature } from './verify';
import { logger } from '../utils/logger';
import { WebhookEventType } from '../database/schema';

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
            const signature = req.headers['x-patreon-signature'] as string;
            const rawBody = (req as any).rawBody;

            // Verify signature
            if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
                logger.warn('Webhook signature verification failed');
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }

            // Get event type from headers
            const eventType = req.headers['x-patreon-event'] as WebhookEventType;

            if (!eventType) {
                logger.warn('Webhook missing event type header');
                res.status(400).json({ error: 'Missing event type' });
                return;
            }

            // Log webhook received
            logger.info(`Webhook received: ${eventType}`);

            // Route to appropriate handler
            await routeWebhookEvent(eventType, req.body);

            // Acknowledge receipt
            res.status(200).json({ received: true });

        } catch (error) {
            logger.error('Error processing webhook', error as Error);
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
        switch (eventType) {
            case 'members:create':
                const { handleMembersCreate } = await import('./handlers/members-create');
                await handleMembersCreate(payload);
                break;

            case 'members:update':
                const { handleMembersUpdate } = await import('./handlers/members-update');
                await handleMembersUpdate(payload);
                break;

            case 'members:delete':
                const { handleMembersDelete } = await import('./handlers/members-delete');
                await handleMembersDelete(payload);
                break;

            case 'members:pledge:create':
                const { handleMembersPledgeCreate } = await import('./handlers/members-pledge-create');
                await handleMembersPledgeCreate(payload);
                break;

            case 'members:pledge:update':
                const { handleMembersPledgeUpdate } = await import('./handlers/members-pledge-update');
                await handleMembersPledgeUpdate(payload);
                break;

            case 'members:pledge:delete':
                const { handleMembersPledgeDelete } = await import('./handlers/members-pledge-delete');
                await handleMembersPledgeDelete(payload);
                break;

            case 'posts:publish':
                const { handlePostsPublish } = await import('./handlers/posts-publish');
                await handlePostsPublish(payload);
                break;

            case 'posts:update':
                const { handlePostsUpdate } = await import('./handlers/posts-update');
                await handlePostsUpdate(payload);
                break;

            case 'posts:delete':
                const { handlePostsDelete } = await import('./handlers/posts-delete');
                await handlePostsDelete(payload);
                break;

            default:
                logger.warn(`Unhandled webhook event type: ${eventType}`);
        }
    } catch (error) {
        logger.error(`Error in webhook handler for ${eventType}`, error as Error);
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
