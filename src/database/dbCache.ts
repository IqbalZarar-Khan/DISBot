import { TierMapping } from './schema';
import { getSupabase } from './supabase';
import { logger } from '../utils/logger';

/**
 * In-memory cache for graceful degradation when Supabase is unreachable.
 * Caches tier_mappings and bot_config, refreshing every 5 minutes.
 */

let tierMappingsCache: TierMapping[] = [];
let configCache: Map<string, string> = new Map();
let lastRefresh = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
let refreshTimer: NodeJS.Timeout | null = null;

/**
 * Initialize the cache and start automatic refresh.
 */
export async function initDbCache(): Promise<void> {
    await refreshCache();
    refreshTimer = setInterval(() => refreshCache(), CACHE_TTL_MS);
    logger.info('🗄️ [CACHE] In-memory DB cache initialized');
}

export function stopDbCache(): void {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

/**
 * Refresh all caches from Supabase.
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
        }

        // Cache bot_config
        const { data: configs, error: configErr } = await supabase
            .from('bot_config')
            .select('*');

        if (!configErr && configs) {
            configCache = new Map(configs.map((c: any) => [c.key, c.value]));
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
