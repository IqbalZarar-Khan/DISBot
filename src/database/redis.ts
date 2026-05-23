import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redis: Redis | null = null;
let isConnected = false;

/**
 * Initialize the Redis connection.
 * Uses REDIS_URL env var, defaults to localhost:6379.
 */
export function initRedis(): Redis {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';

    redis = new Redis(url, {
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: true,
        retryStrategy(times: number) {
            if (times > 10) {
                logger.warn('🔴 [REDIS] Max reconnect attempts reached — giving up');
                return null; // Stop retrying
            }
            const delay = Math.min(times * 500, 5000);
            return delay;
        },
    });

    redis.on('connect', () => {
        isConnected = true;
        console.log('✅ Redis connected');
    });

    redis.on('error', (err) => {
        logger.warn(`🔴 [REDIS] Connection error: ${err.message}`);
    });

    redis.on('close', () => {
        isConnected = false;
    });

    redis.on('reconnecting', () => {
        logger.info('🔄 [REDIS] Reconnecting...');
    });

    return redis;
}

/**
 * Get the Redis instance. Returns null if not initialized.
 */
export function getRedis(): Redis | null {
    return redis;
}

/**
 * Check if Redis is currently connected.
 */
export function isRedisConnected(): boolean {
    return isConnected && redis !== null;
}

/**
 * Close the Redis connection gracefully.
 */
export async function closeRedis(): Promise<void> {
    if (redis) {
        await redis.quit();
        redis = null;
        isConnected = false;
        console.log('👋 Redis disconnected');
    }
}
