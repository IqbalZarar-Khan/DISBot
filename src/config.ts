import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define the interface for a Tier
export interface TierDefinition {
    name: string;
    id: string;
    rank: number;
    cents?: number; // Optional: minimum pledge amount in cents for this tier
}

interface Config {
    // Discord
    discordToken: string;
    guildId: string;
    rootAdminId: string;
    logChannelId: string;

    // Patreon
    patreonClientId: string;
    patreonClientSecret: string;
    patreonAccessToken: string;
    patreonRefreshToken: string;
    patreonCampaignId: string;

    // Webhook
    webhookSecret: string;
    webhookPort: number;

    // Supabase
    supabaseUrl: string;
    supabaseKey: string;

    // Redis
    redisUrl: string;

    // Role Sync
    roleSyncEnabled: boolean;

    // Public URL (for dashboard links)
    publicUrl: string;

    // Tier Configuration
    tierConfig: TierDefinition[];

    // Internal flag for setup mode
    _isSetupMode?: boolean;
}

function getEnvVar(key: string, required: boolean = true): string {
    const value = process.env[key];
    if (required && !value) {
        // Don't crash here — validateConfig() will handle the user-facing error.
        // Just return '' so all missing fields are collected and reported together.
    }
    return value || '';
}

// Helper to safely parse and validate the tier configuration JSON from .env
function parseTierConfig(): TierDefinition[] {
    const rawConfig = process.env.TIER_CONFIG;

    if (!rawConfig) {
        console.warn("⚠️ TIER_CONFIG not set in .env. Using empty tier configuration.");
        return [];
    }

    // Parse JSON
    let parsed: any;
    try {
        parsed = JSON.parse(rawConfig);
    } catch (error) {
        console.error("❌ FATAL: TIER_CONFIG is not valid JSON.");
        console.error("   Expected format: [{\"name\":\"Tier1\",\"id\":\"123\",\"rank\":100}]");
        console.error("   Parse error:", (error as Error).message);
        return [];
    }

    // Must be an array
    if (!Array.isArray(parsed)) {
        console.error("❌ FATAL: TIER_CONFIG must be a JSON array, got:", typeof parsed);
        process.exit(1);
    }

    // Validate each tier entry
    const errors: string[] = [];
    parsed.forEach((tier: any, index: number) => {
        if (!tier.name || typeof tier.name !== 'string') {
            errors.push(`  Tier ${index}: missing or invalid "name" (expected string)`);
        }
        if (!tier.id || typeof tier.id !== 'string') {
            errors.push(`  Tier ${index}: missing or invalid "id" (expected string)`);
        }
        if (tier.rank === undefined || typeof tier.rank !== 'number') {
            errors.push(`  Tier ${index}: missing or invalid "rank" (expected number)`);
        }
    });

    if (errors.length > 0) {
        console.error("❌ FATAL: TIER_CONFIG has invalid tier entries:");
        errors.forEach(e => console.error(e));
        console.error("   Each tier needs: {\"name\":\"...\", \"id\":\"...\", \"rank\":N}");
        process.exit(1);
    }

    console.log(`✅ Loaded ${parsed.length} tier(s) from TIER_CONFIG`);
    return parsed;
}

export const config: Config = {
    // Discord
    discordToken: getEnvVar('DISCORD_TOKEN'),
    guildId: getEnvVar('GUILD_ID'),
    rootAdminId: getEnvVar('ROOT_ADMIN_ID'),
    logChannelId: getEnvVar('LOG_CHANNEL_ID', false),

    // Patreon
    patreonClientId: getEnvVar('PATREON_CLIENT_ID'),
    patreonClientSecret: getEnvVar('PATREON_CLIENT_SECRET'),
    patreonAccessToken: getEnvVar('PATREON_ACCESS_TOKEN'),
    patreonRefreshToken: getEnvVar('PATREON_REFRESH_TOKEN', false),
    patreonCampaignId: getEnvVar('PATREON_CAMPAIGN_ID'),

    // Webhook
    webhookSecret: getEnvVar('WEBHOOK_SECRET'),
    webhookPort: parseInt(process.env.PORT || getEnvVar('WEBHOOK_PORT', false) || '3000'),

    // Supabase
    supabaseUrl: getEnvVar('SUPABASE_URL'),
    supabaseKey: getEnvVar('SUPABASE_KEY'),

    // Redis
    redisUrl: getEnvVar('REDIS_URL', false) || 'redis://localhost:6379',

    // Role Sync
    roleSyncEnabled: (process.env.DISCORD_ROLE_SYNC_ENABLED || 'false').toLowerCase() === 'true',

    // Public URL
    publicUrl: (getEnvVar('PUBLIC_URL', false) || '').replace(/\/+$/, ''),

    // Tier Configuration
    tierConfig: parseTierConfig()
};

// Validate configuration
export function validateConfig(): void {
    console.log('🔍 Validating configuration...');

    const requiredFields: (keyof Config)[] = [
        'discordToken',
        'guildId',
        'rootAdminId',
        'patreonClientId',
        'patreonClientSecret',
        'patreonAccessToken',
        'patreonCampaignId',
        'webhookSecret'
    ];

    const missing = requiredFields.filter(field => !config[field]);

    if (missing.length > 0) {
        // If we're missing core config, signal to index.ts that we're in SETUP MODE,
        // but don't hard crash here.
        console.warn(`⚠️ Missing configuration: ${missing.join(', ')}`);
        config._isSetupMode = true;
        return;
    }

    // ── Tier rank/cents mismatch validator ────────────────────────────
    // Warns if a cheaper tier has a higher rank than an expensive tier,
    // which would break waterfall logic.
    const tiersWithCents = config.tierConfig.filter(t => t.cents !== undefined && t.cents > 0);
    if (tiersWithCents.length >= 2) {
        const sorted = [...tiersWithCents].sort((a, b) => (b.cents || 0) - (a.cents || 0));

        for (let i = 0; i < sorted.length - 1; i++) {
            const expensive = sorted[i];
            const cheaper = sorted[i + 1];

            if (cheaper.rank > expensive.rank) {
                console.error(`\n❌ FATAL: TIER RANK INVERSION DETECTED:`);
                console.error(`    "${cheaper.name}" costs ${cheaper.cents}¢ but has rank ${cheaper.rank}`);
                console.error(`    "${expensive.name}" costs ${expensive.cents}¢ but has rank ${expensive.rank}`);
                console.error(`    → The cheaper tier "${cheaper.name}" outranks the expensive tier "${expensive.name}".`);
                console.error(`    → This WILL break waterfall logic and may leak premium content.`);
                console.error(`    → Fix your TIER_CONFIG ranks, or set ALLOW_RANK_INVERSION=true to bypass.\n`);
                if (process.env.ALLOW_RANK_INVERSION?.toLowerCase() !== 'true') {
                    process.exit(1);
                }
            }
        }
    }

    console.log('✅ Configuration validated');
}
