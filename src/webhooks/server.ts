import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { verifyWebhookSignature } from './verify';
import { logger } from '../utils/logger';
import { WebhookEventType } from '../database/schema';
import { setupWizardPlugin } from './wizard';
import { routeWebhookEvent } from './router';
import { enqueueWebhookEvent } from '../queue/webhookQueue';
import { isRedisConnected } from '../database/redis';
import { dashboardPlugin } from './dashboard';
import { logWebhookReceived } from '../database/webhookCache';

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

let fastify: FastifyInstance | null = null;

/**
 * Start the webhook server (Fastify)
 */
export async function startWebhookServer(port: number, webhookSecret: string): Promise<void> {
    fastify = Fastify({
        logger: false, // We use our own logger
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: true,
    });

    // ── Raw body parser for signature verification ──────────────────
    // Fastify doesn't have Express's verify callback, so we capture
    // the raw body via a custom content type parser.
    fastify.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer' },
        (_req: FastifyRequest, body: Buffer, done: (err: Error | null, result?: any) => void) => {
            try {
                // Store raw body on request for signature verification
                (_req as any).rawBody = body.toString('utf8');
                const json = JSON.parse(body.toString('utf8'));
                done(null, json);
            } catch (err) {
                done(err as Error);
            }
        }
    );

    // Mount the setup wizard plugin for cloud deployments
    await fastify.register(setupWizardPlugin, { prefix: '/setup' });

    // Mount the analytics dashboard
    await fastify.register(dashboardPlugin, { prefix: '/dashboard' });

    // Health check endpoint (root)
    fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Health check endpoint (explicit)
    fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ── OAuth Flow: Eliminates need for Postman/curl ─────────────────
    // GET /oauth/start → redirects creator to Patreon authorization page
    fastify.get('/oauth/start', async (_request: FastifyRequest, reply: FastifyReply) => {
        const clientId = process.env.PATREON_CLIENT_ID;
        const portNum = process.env.PORT || process.env.WEBHOOK_PORT || '3000';
        const host = process.env.PUBLIC_URL || `http://localhost:${portNum}`;
        const redirectUri = `${host}/oauth/redirect`;

        if (!clientId) {
            return reply.code(500).send('❌ PATREON_CLIENT_ID not configured in environment.');
        }

        const scopes = 'campaigns campaigns.members campaigns.posts w:campaigns.webhook';
        const url = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
        return reply.redirect(url);
    });

    // GET /oauth/redirect → exchanges code for tokens, saves to DB
    fastify.get('/oauth/redirect', async (request: FastifyRequest, reply: FastifyReply) => {
        const query = request.query as Record<string, string>;
        const code = query.code;
        if (!code) {
            return reply.code(400).send('❌ Missing authorization code. Please start the flow at /oauth/start');
        }

        const clientId = process.env.PATREON_CLIENT_ID;
        const clientSecret = process.env.PATREON_CLIENT_SECRET;
        const portNum = process.env.PORT || process.env.WEBHOOK_PORT || '3000';
        const host = process.env.PUBLIC_URL || `http://localhost:${portNum}`;
        const redirectUri = `${host}/oauth/redirect`;

        if (!clientId || !clientSecret) {
            return reply.code(500).send('❌ PATREON_CLIENT_ID and PATREON_CLIENT_SECRET must be set.');
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

            return reply.type('text/html').send(`
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
            return reply.code(500).send(`❌ Token exchange failed: ${detail}`);
        }
    });

    // Patreon webhook endpoint
    fastify.post('/webhooks/patreon', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // --- 🔍 TRAFFIC CONTROL DEBUG START ---
            const eventType = request.headers['x-patreon-event'] as WebhookEventType;
            const signature = request.headers['x-patreon-signature'] as string;
            const rawBody = (request as any).rawBody;

            logger.info('\n📡 ========================================');
            logger.info('📡 [INCOMING WEBHOOK TRAFFIC]');
            logger.info('📡 ========================================');
            logger.info(`📡 Event Type Header: "${eventType}"`);
            logger.info(`📡 Signature Present: ${!!signature}`);
            logger.info(`📡 Raw Body Length: ${rawBody?.length || 0} bytes`);
            logger.info(`📡 Request Headers: ${JSON.stringify({
                'x-patreon-event': eventType,
                'x-patreon-signature': signature ? '***present***' : 'missing',
                'content-type': request.headers['content-type']
            })}`);

            // Verify signature
            if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
                logger.error('⛔ [SECURITY BLOCK] Signature verification FAILED');
                logger.error(`⛔ Signature: ${signature ? 'present but invalid' : 'missing'}`);
                logger.info('📡 ========================================\n');
                return reply.code(401).send({ error: 'Invalid signature' });
            }

            logger.info('✅ [SECURITY PASS] Signature verified successfully');

            // ── Webhook cache: persist every verified webhook immediately ──
            // This creates an audit trail so we can spot missed announcements.
            // logId is null if the table doesn't exist yet (pre-migration).
            const logId = await logWebhookReceived(eventType || 'unknown', request.body);

            // Idempotency guard: skip duplicate webhooks
            if (isDuplicate(rawBody, eventType || '')) {
                logger.warn('🔁 [DEDUP] Duplicate webhook detected — skipping');
                return reply.code(200).send({ received: true, duplicate: true });
            }

            // Ghost webhook filter: skip webhooks with no meaningful state change
            if (isGhostWebhook(request.body, eventType || '')) {
                logger.info('👻 [GHOST] No meaningful state change — discarding ghost webhook');
                return reply.code(200).send({ received: true, ghost: true });
            }

            if (!eventType) {
                logger.warn('⚠️ [MISSING HEADER] x-patreon-event header not found');
                logger.info('📡 ========================================\n');
                return reply.code(400).send({ error: 'Missing event type' });
            }

            // Log webhook received
            logger.info(`👉 [ROUTING] Event type: ${eventType}`);
            logger.info(`👉 [ROUTING] Payload data ID: ${(request.body as any)?.data?.id || 'unknown'}`);
            logger.info(`👉 [ROUTING] Included items: ${(request.body as any)?.included?.length || 0}`);

            // Try to enqueue via BullMQ; fall back to direct processing
            if (isRedisConnected()) {
                const enqueued = await enqueueWebhookEvent(eventType, request.body, logId);
                if (enqueued) {
                    logger.info(`📬 [QUEUE] Event ${eventType} enqueued for async processing`);
                } else {
                    // Queue failed — process directly
                    logger.warn('⚠️ [QUEUE] Enqueue failed — processing directly');
                    await routeWebhookEvent(eventType, request.body, logId);
                }
            } else {
                // Redis unavailable — direct processing (graceful degradation)
                logger.info(`🚀 [DIRECT] Processing ${eventType} directly (no Redis)`);
                await routeWebhookEvent(eventType, request.body, logId);
            }

            logger.info(`✅ [COMPLETE] Webhook ${eventType} acknowledged`);
            logger.info('📡 [END TRAFFIC] ========================================\n');

            // Acknowledge receipt immediately
            return reply.code(200).send({ received: true });

        } catch (error) {
            logger.error('❌ [CRASH] Error processing webhook in server.ts', error as Error);
            logger.error(`❌ Stack trace: ${(error as Error).stack}`);
            logger.info('📡 [END TRAFFIC - ERROR] ========================================\n');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    // Start server
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`✅ Webhook server listening on port ${port}`);
}

/**
 * Stop the webhook server
 */
export async function stopWebhookServer(): Promise<void> {
    if (fastify) {
        await fastify.close();
        console.log('👋 Webhook server stopped');
        fastify = null;
    }
}

/**
 * Get the Fastify instance (for registering additional plugins like dashboard).
 */
export function getFastifyInstance(): FastifyInstance | null {
    return fastify;
}
