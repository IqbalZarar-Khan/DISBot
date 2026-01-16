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

/**
 * Tier Colors
 * Dynamically populated from TIER_CONFIG environment variable or generated
 */
export const tierColors: Record<string, number> = {};

/**
 * Tier Emojis
 * Dynamically populated from TIER_CONFIG environment variable or defaulted
 */
export const tierEmojis: Record<string, string> = {};

// Default colors (Discord specific mostly)
const DEFAULT_COLORS = [
    0x00ffff, // Cyan
    0xffd700, // Gold
    0xc0c0c0, // Silver
    0xcd7f32, // Bronze
    0x5865f2, // Blurple
    0xeb459e, // Fuchsia
    0x57f287, // Green
    0xfee75c, // Yellow
    0xed4245, // Red
];

// Dynamically populate tier maps from configuration
if (config.tierConfig && config.tierConfig.length > 0) {
    config.tierConfig.forEach((tier, index) => {
        // Map Name -> Rank (e.g., "Tier1" -> 100)
        tierRankings[tier.name] = tier.rank;

        // Map ID -> Name (e.g., "TIER_ID_1" -> "Tier1")
        tierIdMap[tier.id] = tier.name;

        // Map Cents -> Name (e.g., 2500 -> "Tier1")
        if (tier.cents !== undefined) {
            centsMap[tier.cents] = tier.name;
        }

        // Assign default colors if not defined (cyclic)
        tierColors[tier.name] = DEFAULT_COLORS[index % DEFAULT_COLORS.length];

        // Assign default emoji
        tierEmojis[tier.name] = '⭐';
    });

    // Explicitly set Free tier
    if (!tierRankings['Free']) {
        tierRankings['Free'] = 0;
        tierColors['Free'] = 0x808080; // Gray
        tierEmojis['Free'] = '🆓';
    }

    console.log(`✅ Global Tier System Loaded: ${config.tierConfig.length} tier(s) configured.`);
    console.log(`   Tiers: ${config.tierConfig.map(t => `${t.name}(${t.rank})`).join(', ')}`);
    if (Object.keys(centsMap).length > 0) {
        console.log(`✅ Cents Fallback Map: ${Object.keys(centsMap).length} tier(s) with pledge amounts`);
    }
} else {
    console.warn("⚠️ NO TIERS CONFIGURED. Please set TIER_CONFIG in .env");
    console.warn("   Example: TIER_CONFIG='[{\"name\":\"Tier1\",\"id\":\"TIER_ID_1\",\"rank\":100,\"cents\":2500}]'");

    // Default fallback to prevent regression for legacy users
    // These match the old hardcoded enum
    tierRankings['Diamond'] = 100;
    tierRankings['Gold'] = 75;
    tierRankings['Silver'] = 50;
    tierRankings['Bronze'] = 25;
    tierRankings['Free'] = 0;

    tierColors['Diamond'] = 0x00ffff;
    tierColors['Gold'] = 0xffd700;
    tierColors['Silver'] = 0xc0c0c0;
    tierColors['Bronze'] = 0xcd7f32;
    tierColors['Free'] = 0x808080;

    tierEmojis['Diamond'] = '💎';
    tierEmojis['Gold'] = '🥇';
    tierEmojis['Silver'] = '🥈';
    tierEmojis['Bronze'] = '🥉';
    tierEmojis['Free'] = '🆓';
}

/**
 * Get tier rank by tier name
 * Handles tier names with or without trailing dots (e.g., "Tier1" or "Tier1.")
 */
export function getTierRank(tierName: string): number {
    // Normalize: lowercase and remove trailing dots/spaces
    // NOTE: This logic assumes keys in tierRankings are Case-Sensitive or we need to handle casing carefully.
    // The previous implementation used lowercased switch cases.
    // To support dynamic names properly, we should probably stick to case-insensitive matching or require config to match.
    // Let's try to match exactly first, then fuzzy.

    if (tierRankings[tierName] !== undefined) {
        return tierRankings[tierName];
    }

    // Fuzzy match (ignore case and trailing dots)
    const normalizedInput = tierName.toLowerCase().trim().replace(/\.+$/, '');

    for (const [name, rank] of Object.entries(tierRankings)) {
        if (name.toLowerCase() === normalizedInput) {
            return rank;
        }
    }

    return 0; // Default to lowest rank (Free) if unknown
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
    if (tierColors[tierName]) {
        return tierColors[tierName];
    }

    // Fuzzy match
    const normalizedInput = tierName.toLowerCase().trim().replace(/\.+$/, '');
    for (const [name, color] of Object.entries(tierColors)) {
        if (name.toLowerCase() === normalizedInput) {
            return color;
        }
    }

    // Default Fallback
    return 0x5865f2; // Discord Blurple
}

/**
 * Get tier emoji
 */
export function getTierEmoji(tierName: string): string {
    if (tierEmojis[tierName]) {
        return tierEmojis[tierName];
    }

    // Fuzzy match
    const normalizedInput = tierName.toLowerCase().trim().replace(/\.+$/, '');
    for (const [name, emoji] of Object.entries(tierEmojis)) {
        if (name.toLowerCase() === normalizedInput) {
            return emoji;
        }
    }

    return '⭐';
}
