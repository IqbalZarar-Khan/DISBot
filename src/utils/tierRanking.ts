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
 * Get tier rank by tier name.
 * Checks the dynamic tierRankings map (from TIER_CONFIG) first,
 * then falls back to well-known defaults.
 */
export function getTierRank(tierName: string): number {
    // Normalize: remove trailing dots/spaces
    const cleaned = tierName.trim().replace(/\.+$/, '');

    // 1. Exact match in dynamic config (case-sensitive, fastest)
    if (tierRankings[cleaned] !== undefined) return tierRankings[cleaned];

    // 2. Case-insensitive match in dynamic config
    const lower = cleaned.toLowerCase();
    for (const [name, rank] of Object.entries(tierRankings)) {
        if (name.toLowerCase() === lower) return rank;
    }

    // 3. Hardcoded fallback for well-known tier names
    switch (lower) {
        case 'diamond': return TierRank.Diamond;
        case 'gold': return TierRank.Gold;
        case 'silver': return TierRank.Silver;
        case 'bronze': return TierRank.Bronze;
        case 'free': return TierRank.Free;
        default: return TierRank.Free;
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
 * Select the widest-audience (lowest access requirement) tier from a list of eligible tiers.
 * Guarantees that the broadest tier is selected using rank AND cents cost to prevent
 * accidental premium content leaks even if ranks were inverted in config.
 */
export function getWidestAudienceTier(availableTiers: string[]): { name: string; rank: number } {
    if (!availableTiers || availableTiers.length === 0) {
        return { name: 'Free', rank: 0 };
    }

    let lowestTierName = 'Free';
    let lowestTierRank = Infinity;
    let lowestTierCents = Infinity;

    for (const tierName of availableTiers) {
        const cleanName = tierName.trim().replace(/\.+$/, '');
        const rank = getTierRank(cleanName);
        const configTier = config.tierConfig.find(t => t.name.toLowerCase() === cleanName.toLowerCase());
        const cents = configTier?.cents !== undefined ? configTier.cents : (rank * 100);

        if (rank > 0 && (rank < lowestTierRank || (rank === lowestTierRank && cents < lowestTierCents))) {
            lowestTierRank = rank;
            lowestTierName = cleanName;
            lowestTierCents = cents;
        }
    }

    if (lowestTierRank === Infinity) {
        return { name: 'Free', rank: 0 };
    }

    return { name: lowestTierName, rank: lowestTierRank };
}

// ── Color palette for dynamic tiers (cycles for unlimited tiers) ───
const TIER_COLORS = [
    0x00ffff, // Cyan
    0xffd700, // Gold
    0xc0c0c0, // Silver
    0xcd7f32, // Bronze
    0xe91e63, // Pink
    0x9b59b6, // Purple
    0x3498db, // Blue
    0x2ecc71, // Green
];

/**
 * Get tier color for Discord embeds.
 * Assigns colors based on rank position in the config, with well-known fallbacks.
 */
export function getTierColor(tierName: string): number {
    const lower = tierName.toLowerCase().trim().replace(/\.+$/, '');

    // Well-known tier colors
    const knownColors: Record<string, number> = {
        diamond: 0x00ffff, gold: 0xffd700, silver: 0xc0c0c0,
        bronze: 0xcd7f32, free: 0x808080,
    };
    if (knownColors[lower]) return knownColors[lower];

    // Dynamic: find position in sorted config and assign from palette
    if (config.tierConfig.length > 0) {
        const idx = config.tierConfig.findIndex(
            t => t.name.toLowerCase() === lower
        );
        if (idx >= 0) return TIER_COLORS[idx % TIER_COLORS.length];
    }

    return 0x5865f2; // Discord Blurple fallback
}

// ── Emoji set for dynamic tiers ────────────────────────────────────
const TIER_EMOJIS = ['💎', '🥇', '🥈', '🥉', '🏅', '⭐', '✨', '🎖️'];

/**
 * Get tier emoji.
 * Assigns emojis based on rank position in the config, with well-known fallbacks.
 */
export function getTierEmoji(tierName: string): string {
    const lower = tierName.toLowerCase().trim().replace(/\.+$/, '');

    // Well-known tier emojis
    const knownEmojis: Record<string, string> = {
        diamond: '💎', gold: '🥇', silver: '🥈',
        bronze: '🥉', free: '🆓',
    };
    if (knownEmojis[lower]) return knownEmojis[lower];

    // Dynamic: find position in sorted config and assign from palette
    if (config.tierConfig.length > 0) {
        const idx = config.tierConfig.findIndex(
            t => t.name.toLowerCase() === lower
        );
        if (idx >= 0) return TIER_EMOJIS[idx % TIER_EMOJIS.length];
    }

    return '⭐';
}
