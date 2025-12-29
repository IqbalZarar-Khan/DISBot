import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define the interface for a Tier
export interface TierDefinition {
    name: string;
    id: string;
    rank: number;
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

    // Tier Configuration
    tierConfig: TierDefinition[];
}

function getEnvVar(key: string, required: boolean = true): string {
    const value = process.env[key];

    if (!value && required) {
        throw new Error(`Missing required environment variable: ${key}`);
    }

    return value || '';
}

// Helper to safely parse the tier configuration JSON from .env
function parseTierConfig(): TierDefinition[] {
    try {
        const rawConfig = process.env.TIER_CONFIG;
        if (!rawConfig) {
            console.warn("⚠️ TIER_CONFIG not set in .env. Using empty tier configuration.");
            return [];
        }
        const parsed = JSON.parse(rawConfig);
        console.log(`✅ Loaded ${parsed.length} tier(s) from TIER_CONFIG`);
        return parsed;
    } catch (error) {
        console.error("❌ FATAL ERROR: TIER_CONFIG in .env is not valid JSON.");
        console.error("Please format it like: [{'name':'Diamond','id':'123','rank':100}]");
        console.error("Error:", error);
        return [];
    }
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
        throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    console.log('✅ Configuration validated');
}
