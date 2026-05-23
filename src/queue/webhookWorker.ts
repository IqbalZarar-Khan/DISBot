import { Worker, Job } from 'bullmq';
import { getRedis } from '../database/redis';
import { routeWebhookEvent } from '../webhooks/router';
import { logger } from '../utils/logger';
import { WebhookJobData } from './webhookQueue';

let worker: Worker<WebhookJobData> | null = null;

/**
 * Start the BullMQ worker that processes webhook events from the queue.
 * Concurrency is set to 3 to respect Discord API rate limits.
 * Must be called after initRedis().
 */
export function startWebhookWorker(): Worker<WebhookJobData> | null {
    const redis = getRedis();
    if (!redis) {
        logger.warn('⚠️ [WORKER] Redis not available — worker disabled');
        return null;
    }

    worker = new Worker<WebhookJobData>(
        'webhook-events',
        async (job: Job<WebhookJobData>) => {
            const { eventType, payload, receivedAt } = job.data;
            const queueDelay = Date.now() - receivedAt;

            logger.info(`⚙️ [WORKER] Processing ${eventType} (queued ${queueDelay}ms ago, attempt ${job.attemptsMade + 1})`);
            await routeWebhookEvent(eventType, payload);
            logger.info(`✅ [WORKER] Completed ${eventType}`);
        },
        {
            connection: redis,
            concurrency: 3,
            limiter: {
                max: 10,
                duration: 10_000, // Max 10 jobs per 10 seconds
            },
        }
    );

    worker.on('completed', (job: Job<WebhookJobData>) => {
        logger.info(`✅ [WORKER] Job ${job.id} (${job.data.eventType}) completed`);
    });

    worker.on('failed', (job: Job<WebhookJobData> | undefined, err: Error) => {
        if (job) {
            logger.error(`❌ [WORKER] Job ${job.id} (${job.data.eventType}) failed: ${err.message}`, err);
        } else {
            logger.error(`❌ [WORKER] Job failed (no job data): ${err.message}`, err);
        }
    });

    worker.on('error', (err: Error) => {
        logger.error('❌ [WORKER] Worker error', err);
    });

    logger.info('✅ [WORKER] Webhook worker started (concurrency: 3)');
    return worker;
}

/**
 * Stop the worker gracefully.
 */
export async function stopWebhookWorker(): Promise<void> {
    if (worker) {
        await worker.close();
        worker = null;
        logger.info('👋 [WORKER] Webhook worker stopped');
    }
}
