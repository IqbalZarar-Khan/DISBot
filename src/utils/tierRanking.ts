import { TierRank } from '../database/schema';

/**
 * Get tier rank by tier name
 * Handles tier names with or without trailing dots (e.g., "Diamond" or "Diamond.")
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
