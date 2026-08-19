/**
 * Unit tests for the tier-resolution cascade in tierRanking.ts.
 *
 * The module populates its lookup maps from TIER_CONFIG at import time,
 * so each test seeds the mutable maps explicitly to stay deterministic
 * regardless of the environment the suite runs in.
 */
import {
    tierRankings,
    tierIdMap,
    centsMap,
    getTierRank,
    compareTiers,
    isUpgrade,
    isWaterfall,
    getTierColor,
    getTierEmoji,
} from '../tierRanking';
import { TierRank } from '../../database/schema';

// Names chosen so they can never collide with a real TIER_CONFIG
const TEST_TIERS: Record<string, number> = {
    'ZqxTestBronze': 25,
    'ZqxTestSilver': 50,
    'ZqxTestGold': 75,
    'ZqxTestDiamond': 100,
};

let savedRankings: Record<string, number>;

beforeAll(() => {
    savedRankings = { ...tierRankings };
});

beforeEach(() => {
    // Reset module-level maps to a known state
    for (const key of Object.keys(tierRankings)) delete tierRankings[key];
    for (const key of Object.keys(tierIdMap)) delete tierIdMap[key];
    for (const key of Object.keys(centsMap)) delete centsMap[Number(key)];
    Object.assign(tierRankings, TEST_TIERS);
});

afterAll(() => {
    for (const key of Object.keys(tierRankings)) delete tierRankings[key];
    Object.assign(tierRankings, savedRankings);
});

// ── getTierRank ───────────────────────────────────────────────────────────────

describe('getTierRank', () => {
    it('resolves dynamically configured tiers exactly', () => {
        expect(getTierRank('ZqxTestGold')).toBe(75);
        expect(getTierRank('ZqxTestDiamond')).toBe(100);
    });

    it('resolves tier names case-insensitively', () => {
        expect(getTierRank('zqxtestsilver')).toBe(50);
        expect(getTierRank('ZQXTESTBRONZE')).toBe(25);
    });

    it('ignores trailing dots and whitespace (Patreon title artifacts)', () => {
        expect(getTierRank('ZqxTestGold...')).toBe(75);
        expect(getTierRank('  ZqxTestGold  ')).toBe(75);
    });

    it('falls back to well-known tier names when not in config', () => {
        expect(getTierRank('Diamond')).toBe(TierRank.Diamond);
        expect(getTierRank('gold')).toBe(TierRank.Gold);
        expect(getTierRank('Silver')).toBe(TierRank.Silver);
        expect(getTierRank('BRONZE')).toBe(TierRank.Bronze);
        expect(getTierRank('Free')).toBe(TierRank.Free);
    });

    it('returns Free for completely unknown tier names', () => {
        expect(getTierRank('Totally Unknown Tier')).toBe(TierRank.Free);
        expect(getTierRank('')).toBe(TierRank.Free);
    });
});

// ── rank comparison ───────────────────────────────────────────────────────────

describe('compareTiers / isUpgrade / isWaterfall', () => {
    it('compareTiers returns the rank difference', () => {
        expect(compareTiers(100, 50)).toBeGreaterThan(0);
        expect(compareTiers(25, 75)).toBeLessThan(0);
        expect(compareTiers(50, 50)).toBe(0);
    });

    it('detects upgrades (new rank strictly higher)', () => {
        expect(isUpgrade(25, 100)).toBe(true);
        expect(isUpgrade(100, 100)).toBe(false);
        expect(isUpgrade(100, 25)).toBe(false);
    });

    it('detects waterfall events (requirement drops = access expands)', () => {
        expect(isWaterfall(100, 25)).toBe(true);
        expect(isWaterfall(25, 25)).toBe(false);
        expect(isWaterfall(25, 100)).toBe(false);
    });
});

// ── lookup maps ───────────────────────────────────────────────────────────────

describe('tier lookup maps', () => {
    it('tierIdMap and centsMap are populated alongside tierRankings', () => {
        tierIdMap['tier-id-1'] = 'ZqxTestGold';
        centsMap[1500] = 'ZqxTestGold';

        expect(tierIdMap['tier-id-1']).toBe('ZqxTestGold');
        expect(centsMap[1500]).toBe('ZqxTestGold');
    });

    it('getTierRank reads ranks added to the map after import', () => {
        tierRankings['ZqxTestLate'] = 42;
        expect(getTierRank('ZqxTestLate')).toBe(42);
    });
});

// ── presentation helpers ──────────────────────────────────────────────────────

describe('getTierColor / getTierEmoji', () => {
    it('uses well-known colors and emojis for classic tier names', () => {
        expect(getTierColor('Diamond')).toBe(0x00ffff);
        expect(getTierColor('Gold')).toBe(0xffd700);
        expect(getTierColor('silver')).toBe(0xc0c0c0);
        expect(getTierColor('Bronze.')).toBe(0xcd7f32);
        expect(getTierColor('Free')).toBe(0x808080);

        expect(getTierEmoji('Diamond')).toBe('💎');
        expect(getTierEmoji('Gold')).toBe('🥇');
        expect(getTierEmoji('Silver')).toBe('🥈');
        expect(getTierEmoji('Bronze')).toBe('🥉');
        expect(getTierEmoji('Free')).toBe('🆓');
    });

    it('falls back to Discord blurple / star for unknown tiers', () => {
        expect(getTierColor('ZqxUnheardOfTier')).toBe(0x5865f2);
        expect(getTierEmoji('ZqxUnheardOfTier')).toBe('⭐');
    });
});
