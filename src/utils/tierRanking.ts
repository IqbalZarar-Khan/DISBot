import { TierRank } from '../database/schema';
import { config } from '../config';

/**
 * Tier ID to Name Translation Map
 * Dynamically populated from TIER_CONFIG environment variable
 */
export const tierIdMap: Record<string, string> = {};

/**
 * Tier Rankings
 * Dynamically populated from TIER_CONFIG environment variable
 * Higher number = Higher priority
 */
export const tierRankings: Record<string, number> = {};

/**
 * Cents to Tier Name Map
 * Maps pledge amounts (in cents) to tier names
 * Used as fallback when tier ID is not available
 */
export const centsMap: Record<number, string> = {};

// Dynamically populate tier maps from configuration
if (config.tierConfig && config.tierConfig.length > 0) {
    config.tierConfig.forEach(tier => {
        // Map Name -> Rank (e.g., "Tier1" -> 100)
        tierRankings[tier.name] = tier.rank;

        // Map ID -> Name (e.g., "TIER_ID_1" -> "Tier1")
        tierIdMap[tier.id] = tier.name;

        // Map Cents -> Name (e.g., 2500 -> "Tier1")
        if (tier.cents !== undefined) {
            centsMap[tier.cents] = tier.name;
        }
    });

    console.log(`✅ Global Tier System Loaded: ${config.tierConfig.length} tier(s) configured.`);
    console.log(`   Tiers: ${config.tierConfig.map(t => `${t.name}(${t.rank})`).join(', ')}`);
    if (Object.keys(centsMap).length > 0) {
        console.log(`✅ Cents Fallback Map: ${Object.keys(centsMap).length} tier(s) with pledge amounts`);
    }
} else {
    console.warn("⚠️ NO TIERS CONFIGURED. Please set TIER_CONFIG in .env");
    console.warn("   Example: TIER_CONFIG='[{\"name\":\"Tier1\",\"id\":\"TIER_ID_1\",\"rank\":100,\"cents\":2500}]'");
    // Default fallback (keeps the bot from crashing if config is missing)
    tierRankings['Free'] = 0;
}

/**
 * Get tier rank by tier name
 * Handles tier names with or without trailing dots (e.g., "Tier1" or "Tier1.")
 */
export function getTierRank(tierName: string): number {
    // Normalize: lowercase and remove trailing dots/spaces
    const normalizedName = tierName.toLowerCase().trim().replace(/\.+$/, '');

    switch (normalizedName) {
        case 'diamond':
            return TierRank.Diamond;
        case 'gold':
            return TierRank.Gold;
        case 'silver':
            return TierRank.Silver;
        case 'bronze':
            return TierRank.Bronze;
        case 'free':
            return TierRank.Free;
        default:
            return TierRank.Free;
    }
}

/**
 * Compare two tiers
 * @returns positive if tier1 > tier2, negative if tier1 < tier2, 0 if equal
 */
export function compareTiers(tier1Rank: number, tier2Rank: number): number {
    return tier1Rank - tier2Rank;
}

/**
 * Check if a tier change represents an upgrade
 */
export function isUpgrade(oldTierRank: number, newTierRank: number): boolean {
    return newTierRank > oldTierRank;
}

/**
 * Check if a tier change represents a waterfall event (access expansion)
 * A waterfall event occurs when the tier requirement DECREASES (lower rank = more accessible)
 */
export function isWaterfall(oldTierRank: number, newTierRank: number): boolean {
    return newTierRank < oldTierRank;
}

/**
 * Get tier color for Discord embeds
 */
export function getTierColor(tierName: string): number {
    // Normalize: lowercase and remove trailing dots/spaces
    const normalizedName = tierName.toLowerCase().trim().replace(/\.+$/, '');

    switch (normalizedName) {
        case 'diamond':
            return 0x00ffff; // Cyan
        case 'gold':
            return 0xffd700; // Gold
        case 'silver':
            return 0xc0c0c0; // Silver
        case 'bronze':
            return 0xcd7f32; // Bronze
        case 'free':
            return 0x808080; // Gray
        default:
            return 0x5865f2; // Discord Blurple
    }
}

/**
 * Get tier emoji
 */
export function getTierEmoji(tierName: string): string {
    // Normalize: lowercase and remove trailing dots/spaces
    const normalizedName = tierName.toLowerCase().trim().replace(/\.+$/, '');

    switch (normalizedName) {
        case 'diamond':
            return '💎';
        case 'gold':
            return '🥇';
        case 'silver':
            return '🥈';
        case 'bronze':
            return '🥉';
        case 'free':
            return '🆓';
        default:
            return '⭐';
    }
}
