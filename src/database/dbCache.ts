import { TierMapping } from './schema';
import { getSupabase } from './supabase';
import { getRedis, isRedisConnected } from './redis';
import { logger } from '../utils/logger';

/**
 * Redis-backed cache with in-memory L2 fallback for graceful degradation.
 * Caches tier_mappings and bot_config, refreshing every 5 minutes.
 *
 * Cache hierarchy:
 *   1. Redis (shared across instances, TTL-managed)
 *   2. In-memory Map (L2 fallback when Redis is unreachable)
 *   3. Direct Supabase query (if both caches miss)
 */

const REDIS_KEY_TIERS = 'disbot:cache:tiers';
const REDIS_KEY_CONFIG = 'disbot:cache:config';
const REDIS_TTL_SECONDS = 5 * 60; // 5 minutes
const REDIS_INVALIDATION_CHANNEL = 'disbot:cache:invalidate';

// L2 in-memory fallback
let tierMappingsCache: TierMapping[] = [];
let configCache: Map<string, string> = new Map();
let lastRefresh = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
let refreshTimer: NodeJS.Timeout | null = null;
let subscriberRedis: any = null; // Dedicated Redis subscriber connection

/**
 * Initialize the cache and start automatic refresh.
 */
export async function initDbCache(): Promise<void> {
    await refreshCache();
    refreshTimer = setInterval(() => refreshCache(), CACHE_TTL_MS);

    // Subscribe to invalidation signals from other instances
    try {
        if (isRedisConnected()) {
            const Redis = (await import('ioredis')).default;
            const url = process.env.REDIS_URL || 'redis://localhost:6379';
            subscriberRedis = new Redis(url, { maxRetriesPerRequest: null });
            subscriberRedis.subscribe(REDIS_INVALIDATION_CHANNEL);
            subscriberRedis.on('message', (channel: string) => {
                if (channel === REDIS_INVALIDATION_CHANNEL) {
                    logger.info('🗄️ [CACHE] Received invalidation signal — refreshing...');
                    refreshCache().catch(() => {});
                }
            });
        }
    } catch {
        // Redis sub unavailable — 5-minute polling is the fallback
    }

    logger.info('🗄️ [CACHE] DB cache initialized (Redis-backed with in-memory fallback)');
}

export function stopDbCache(): void {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    if (subscriberRedis) {
        subscriberRedis.disconnect();
        subscriberRedis = null;
    }
}

/**
 * Publish a cache invalidation signal so all instances refresh immediately.
 * Call this after sync-tiers or any operation that mutates cached data.
 */
export async function invalidateCache(): Promise<void> {
    // Refresh local cache immediately
    await refreshCache();

    // Notify other instances via Redis pub/sub
    if (isRedisConnected()) {
        try {
            const redis = getRedis()!;
            await redis.publish(REDIS_INVALIDATION_CHANNEL, 'invalidate');
            logger.info('🗄️ [CACHE] Published invalidation signal to all instances');
        } catch {
            // Non-critical — other instances will refresh on their 5-minute cycle
        }
    }
}

/**
 * Refresh all caches from Supabase → write to Redis + in-memory.
 */
async function refreshCache(): Promise<void> {
    try {
        const supabase = getSupabase();

        // Cache tier mappings
        const { data: tiers, error: tiersErr } = await supabase
            .from('tier_mappings')
            .select('*')
            .order('tier_rank', { ascending: false });

        if (!tiersErr && tiers) {
            tierMappingsCache = tiers as TierMapping[];

            // Write to Redis
            if (isRedisConnected()) {
                try {
                    const redis = getRedis()!;
                    await redis.set(REDIS_KEY_TIERS, JSON.stringify(tierMappingsCache), 'EX', REDIS_TTL_SECONDS);
                } catch {
                    // Redis write failed — in-memory still has the data
                }
            }
        }

        // Cache bot_config
        const { data: configs, error: configErr } = await supabase
            .from('bot_config')
            .select('*');

        if (!configErr && configs) {
            configCache = new Map(configs.map((c: any) => [c.key, c.value]));

            // Write to Redis
            if (isRedisConnected()) {
                try {
                    const redis = getRedis()!;
                    const configObj: Record<string, string> = {};
                    for (const [k, v] of configCache) {
                        configObj[k] = v;
                    }
                    await redis.set(REDIS_KEY_CONFIG, JSON.stringify(configObj), 'EX', REDIS_TTL_SECONDS);
                } catch {
                    // Redis write failed — in-memory still has the data
                }
            }
        }

        lastRefresh = Date.now();
    } catch {
        // Supabase unreachable — keep existing cache
        logger.warn('🗄️ [CACHE] Could not refresh cache — using stale data');
    }
}

/**
 * Get a tier mapping by name, falling back to cache if DB is unreachable.
 */
export function getCachedTierMappingByName(tierName: string): TierMapping | null {
    return tierMappingsCache.find(t =>
        t.tier_name.toLowerCase() === tierName.toLowerCase()
    ) || null;
}

/**
 * Get all cached tier mappings.
 * Tries Redis first, falls back to in-memory.
 */
export async function getCachedTierMappingsAsync(): Promise<TierMapping[]> {
    if (isRedisConnected()) {
        try {
            const redis = getRedis()!;
            const data = await redis.get(REDIS_KEY_TIERS);
            if (data) return JSON.parse(data) as TierMapping[];
        } catch {
            // Fall through to in-memory
        }
    }
    return tierMappingsCache;
}

/**
 * Get all cached tier mappings (synchronous — in-memory only).
 */
export function getCachedTierMappings(): TierMapping[] {
    return tierMappingsCache;
}

/**
 * Get a config value, falling back to cache if DB is unreachable.
 */
export function getCachedConfig(key: string): string | null {
    return configCache.get(key) || null;
}

/**
 * Check if cache has data (used for graceful degradation decisions).
 */
export function isCacheWarmed(): boolean {
    return lastRefresh > 0 && tierMappingsCache.length > 0;
}
