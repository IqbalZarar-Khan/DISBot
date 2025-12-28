import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
}

function getEnvVar(key: string, required: boolean = true): string {
    const value = process.env[key];

    if (!value && required) {
        throw new Error(`Missing required environment variable: ${key}`);
    }

    return value || '';
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
    supabaseKey: getEnvVar('SUPABASE_KEY')
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
