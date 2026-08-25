import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyWebhookSignature } from './verify';
import { logger } from '../utils/logger';
import { WebhookEventType } from '../database/schema';
import { setupWizardPlugin } from './wizard';
import { routeWebhookEvent } from './router';
import { enqueueWebhookEvent } from '../queue/webhookQueue';
import { isRedisConnected } from '../database/redis';
import { dashboardPlugin } from './dashboard';
import { logWebhookReceived } from '../database/webhookCache';
import { isDuplicateAsync, isGhostWebhook, startFilterCleanupInterval } from './webhookFilters';
import { getDiagnosticCounters } from '../commands/admin/status';
import { getWebhookQueue } from '../queue/webhookQueue';
import { config } from '../config';

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

    // Start the dedup/ghost filter state cleanup (idempotent)
    startFilterCleanupInterval();

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

    // ── Prometheus metrics endpoint ──────────────────────────────────
    // Exposes runtime counters in the Prometheus text exposition format.
    // Optional auth: set METRICS_TOKEN to require `Authorization: Bearer <token>`
    // (or `?token=<token>`). If unset, the endpoint is open (local dev default).
    fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
        const requiredToken = process.env.METRICS_TOKEN;
        if (requiredToken) {
            const authHeader = (request.headers['authorization'] || '') as string;
            const bearer = authHeader.replace(/^Bearer\s+/i, '');
            const queryToken = (request.query as Record<string, string>).token || '';
            if (bearer !== requiredToken && queryToken !== requiredToken) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        }

        const counters = getDiagnosticCounters();
        const mem = process.memoryUsage();

        const lines: string[] = [
            '# HELP disbot_uptime_seconds Process uptime in seconds.',
            '# TYPE disbot_uptime_seconds gauge',
            `disbot_uptime_seconds ${process.uptime().toFixed(2)}`,
            '# HELP disbot_process_resident_memory_bytes Resident memory size in bytes.',
            '# TYPE disbot_process_resident_memory_bytes gauge',
            `disbot_process_resident_memory_bytes ${mem.rss}`,
            '# HELP disbot_process_heap_used_bytes Heap memory currently in use, in bytes.',
            '# TYPE disbot_process_heap_used_bytes gauge',
            `disbot_process_heap_used_bytes ${mem.heapUsed}`,
            '# HELP disbot_webhooks_success_total Webhooks processed successfully since last counter load.',
            '# TYPE disbot_webhooks_success_total counter',
            `disbot_webhooks_success_total ${counters.webhookSuccessCount}`,
            '# HELP disbot_webhooks_failed_total Webhooks whose handler threw an error.',
            '# TYPE disbot_webhooks_failed_total counter',
            `disbot_webhooks_failed_total ${counters.webhookFailCount}`,
            '# HELP disbot_tier_detection_success_total Post tier detections that resolved to a mapped tier.',
            '# TYPE disbot_tier_detection_success_total counter',
            `disbot_tier_detection_success_total ${counters.tierDetectionSuccess}`,
            '# HELP disbot_tier_detection_failed_total Post tier detections that fell back or failed.',
            '# TYPE disbot_tier_detection_failed_total counter',
            `disbot_tier_detection_failed_total ${counters.tierDetectionFail}`,
            '# HELP disbot_last_webhook_timestamp_seconds Unix timestamp of the last received webhook (0 = never).',
            '# TYPE disbot_last_webhook_timestamp_seconds gauge',
            `disbot_last_webhook_timestamp_seconds ${counters.lastWebhookTimestamp ? Math.floor(counters.lastWebhookTimestamp / 1000) : 0}`,
            '# HELP disbot_redis_connected Whether the Redis connection is up (1) or not (0).',
            '# TYPE disbot_redis_connected gauge',
            `disbot_redis_connected ${isRedisConnected() ? 1 : 0}`,
        ];

        // Queue depth (only available when Redis/BullMQ is active)
        const queue = getWebhookQueue();
        if (queue && isRedisConnected()) {
            try {
                const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
                lines.push(
                    '# HELP disbot_queue_jobs Jobs in the BullMQ webhook queue by state.',
                    '# TYPE disbot_queue_jobs gauge',
                    `disbot_queue_jobs{state="waiting"} ${counts.waiting ?? 0}`,
                    `disbot_queue_jobs{state="active"} ${counts.active ?? 0}`,
                    `disbot_queue_jobs{state="delayed"} ${counts.delayed ?? 0}`,
                    `disbot_queue_jobs{state="failed"} ${counts.failed ?? 0}`,
                );
            } catch {
                // Queue stats are best-effort — skip on error
            }
        }

        return reply.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
    });

    // ── OAuth Flow: Eliminates need for Postman/curl ─────────────────
    // GET /oauth/start → redirects creator to Patreon authorization page
    fastify.get('/oauth/start', async (_request: FastifyRequest, reply: FastifyReply) => {
        const clientId = process.env.PATREON_CLIENT_ID;
        const portNum = process.env.PORT || process.env.WEBHOOK_PORT || '3000';
        const host = (config.publicUrl || process.env.PUBLIC_URL || `http://localhost:${portNum}`).replace(/\/+$/, '');
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
        const host = (config.publicUrl || process.env.PUBLIC_URL || `http://localhost:${portNum}`).replace(/\/+$/, '');
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
                        <p style="font-size:0.8em;color:#666;margin-top:2em">Access token saved securely. You can close this tab.</p>
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

            // Idempotency guard: skip duplicate webhooks (cross-instance via Redis, local fallback)
            if (await isDuplicateAsync(rawBody, eventType || '')) {
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
                // Redis unavailable — direct processing with retry (graceful degradation)
                logger.info(`🚀 [DIRECT] Processing ${eventType} directly (no Redis)`);
                let lastError: Error | null = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await routeWebhookEvent(eventType, request.body, logId);
                        lastError = null;
                        break;
                    } catch (err) {
                        lastError = err as Error;
                        if (attempt < 3) {
                            logger.warn(`⚠️ [DIRECT] Attempt ${attempt}/3 failed — retrying in ${attempt}s...`);
                            await new Promise(r => setTimeout(r, attempt * 1000));
                        }
                    }
                }
                if (lastError) {
                    logger.error(`❌ [DIRECT] All 3 attempts failed for ${eventType}`, lastError);
                }
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
