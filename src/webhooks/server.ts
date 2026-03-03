import express, { Request, Response } from 'express';
import * as crypto from 'crypto';
import { verifyWebhookSignature } from './verify';
import { logger } from '../utils/logger';
import { WebhookEventType } from '../database/schema';

// ── Webhook idempotency guard ──────────────────────────────────────
// Prevents duplicate notifications when Patreon retries the same webhook.
const DEDUP_TTL_MS = 60_000; // 60 seconds
const recentWebhooks = new Map<string, number>(); // hash → timestamp

// ── Ghost webhook filter ───────────────────────────────────────────
// Discards webhooks where the meaningful state hasn't changed.
const GHOST_TTL_MS = 5 * 60_000; // 5 minutes
const recentStates = new Map<string, number>(); // stateHash → timestamp

// Clean expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [hash, ts] of recentWebhooks) {
        if (now - ts > DEDUP_TTL_MS) recentWebhooks.delete(hash);
    }
    for (const [hash, ts] of recentStates) {
        if (now - ts > GHOST_TTL_MS) recentStates.delete(hash);
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

/**
 * Ghost webhook filter: checks if the meaningful state actually changed.
 * Returns true if the webhook should be silently discarded.
 */
function isGhostWebhook(payload: any, eventType: string): boolean {
    // Only filter update events — creates/deletes always matter
    if (!eventType.includes('update')) return false;

    try {
        const data = payload?.data;
        if (!data) return false;

        // Build a state fingerprint from meaningful fields only
        const attrs = data.attributes || {};
        const rels = data.relationships || {};

        const stateFields: Record<string, any> = {
            id: data.id,
            event: eventType,
        };

        // Post-relevant fields
        if (eventType.includes('post')) {
            stateFields.title = attrs.title;
            stateFields.min_cents = attrs.min_cents_pledged_to_view;
            stateFields.tiers = rels?.access_rules?.data?.map((r: any) => r.id).sort() || [];
            stateFields.status = attrs.current_user_can_view;
        }

        // Member-relevant fields
        if (eventType.includes('member') || eventType.includes('pledge')) {
            stateFields.patron_status = attrs.patron_status;
            stateFields.pledge_amount = attrs.currently_entitled_amount_cents;
            stateFields.tier = rels?.currently_entitled_tiers?.data?.[0]?.id;
        }

        const stateHash = crypto.createHash('md5')
            .update(JSON.stringify(stateFields))
            .digest('hex');

        const now = Date.now();
        const lastSeen = recentStates.get(stateHash);
        if (lastSeen && now - lastSeen < GHOST_TTL_MS) {
            return true; // Same state within window → ghost webhook
        }
        recentStates.set(stateHash, now);
        return false;
    } catch {
        return false; // On any error, let the webhook through
    }
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

    // ── OAuth Flow: Eliminates need for Postman/curl ─────────────────
    // GET /oauth/start → redirects creator to Patreon authorization page
    app.get('/oauth/start', (_req: Request, res: Response) => {
        const clientId = process.env.PATREON_CLIENT_ID;
        const port = process.env.PORT || process.env.WEBHOOK_PORT || '3000';
        const host = process.env.PUBLIC_URL || `http://localhost:${port}`;
        const redirectUri = `${host}/oauth/redirect`;

        if (!clientId) {
            res.status(500).send('❌ PATREON_CLIENT_ID not configured in environment.');
            return;
        }

        const scopes = 'campaigns campaigns.members campaigns.posts w:campaigns.webhook';
        const url = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
        res.redirect(url);
    });

    // GET /oauth/redirect → exchanges code for tokens, saves to DB
    app.get('/oauth/redirect', async (req: Request, res: Response) => {
        const code = req.query.code as string;
        if (!code) {
            res.status(400).send('❌ Missing authorization code. Please start the flow at /oauth/start');
            return;
        }

        const clientId = process.env.PATREON_CLIENT_ID;
        const clientSecret = process.env.PATREON_CLIENT_SECRET;
        const port = process.env.PORT || process.env.WEBHOOK_PORT || '3000';
        const host = process.env.PUBLIC_URL || `http://localhost:${port}`;
        const redirectUri = `${host}/oauth/redirect`;

        if (!clientId || !clientSecret) {
            res.status(500).send('❌ PATREON_CLIENT_ID and PATREON_CLIENT_SECRET must be set.');
            return;
        }

        try {
            const axios = (await import('axios')).default;
            const tokenRes = await axios.post('https://www.patreon.com/api/oauth2/token', null, {
                params: {
                    code,
                    grant_type: 'authorization_code',
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUri,
                },
            });

            const { access_token, refresh_token } = tokenRes.data;

            // Save tokens to the database
            const { setConfig } = await import('../database/db');
            await setConfig('patreon_access_token', access_token);
            if (refresh_token) {
                await setConfig('patreon_refresh_token', refresh_token);
            }

            logger.info('🔑 [OAUTH] Tokens exchanged and saved to database successfully');

            res.send(`
                <html>
                <head><title>DISBot - OAuth Success</title></head>
                <body style="font-family:system-ui;background:#1a1a2e;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
                    <div style="text-align:center;max-width:500px">
                        <h1 style="color:#4ade80">✅ Authorization Successful!</h1>
                        <p>Your Patreon tokens have been saved to the database.</p>
                        <p style="color:#888">You can close this tab and return to your bot.</p>
                        <p style="font-size:0.8em;color:#666;margin-top:2em">Access Token: ${access_token.substring(0, 8)}...${access_token.slice(-4)}</p>
                    </div>
                </body>
                </html>
            `);
        } catch (err: any) {
            const detail = err.response?.data?.error || err.message;
            logger.error(`🔑 [OAUTH] Token exchange failed: ${detail}`);
            res.status(500).send(`❌ Token exchange failed: ${detail}`);
        }
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

            // Ghost webhook filter: skip webhooks with no meaningful state change
            if (isGhostWebhook(req.body, eventType || '')) {
                logger.info('👻 [GHOST] No meaningful state change — discarding ghost webhook');
                res.status(200).json({ received: true, ghost: true });
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
