import { Queue } from 'bullmq';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import { WebhookEventType } from '../database/schema';

/**
 * Job data structure for webhook events in the queue.
 */
export interface WebhookJobData {
    eventType: WebhookEventType;
    payload: any;
    receivedAt: number;
}

let queue: Queue<WebhookJobData> | null = null;

/**
 * Initialize the BullMQ webhook queue.
 * Must be called after initRedis().
 */
export function initWebhookQueue(): Queue<WebhookJobData> | null {
    const redis = getRedis();
    if (!redis) {
        logger.warn('⚠️ [QUEUE] Redis not available — queue disabled, using direct processing');
        return null;
    }

    queue = new Queue<WebhookJobData>('webhook-events', {
        connection: redis,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
            removeOnComplete: {
                count: 1000,  // Keep last 1000 completed jobs
                age: 3600,    // Remove completed jobs older than 1 hour
            },
            removeOnFail: {
                count: 5000,  // Keep last 5000 failed jobs for debugging
            },
        },
    });

    logger.info('✅ [QUEUE] Webhook queue initialized');
    return queue;
}

/**
 * Add a webhook event to the queue for async processing.
 * Returns true if successfully enqueued, false if queue unavailable.
 */
export async function enqueueWebhookEvent(
    eventType: WebhookEventType,
    payload: any
): Promise<boolean> {
    if (!queue) return false;

    try {
        await queue.add(eventType, {
            eventType,
            payload,
            receivedAt: Date.now(),
        });
        logger.info(`📬 [QUEUE] Enqueued ${eventType} event`);
        return true;
    } catch (error) {
        logger.error(`❌ [QUEUE] Failed to enqueue ${eventType}`, error as Error);
        return false;
    }
}

/**
 * Get the queue instance (for metrics/monitoring).
 */
export function getWebhookQueue(): Queue<WebhookJobData> | null {
    return queue;
}

/**
 * Close the queue gracefully.
 */
export async function closeWebhookQueue(): Promise<void> {
    if (queue) {
        await queue.close();
        queue = null;
        logger.info('👋 [QUEUE] Webhook queue closed');
    }
}
