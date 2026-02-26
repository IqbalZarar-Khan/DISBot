import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config, validateConfig } from './config';
import { initSupabase } from './database/supabase';
import { initDatabase } from './database/db';
import { initLogger, logger } from './utils/logger';
import { startWebhookServer } from './webhooks/server';
import { startPolling, stopPolling } from './utils/patreonPoller';
import { initI18n } from './utils/i18n';

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

/**
 * Login to Discord with retry logic and timeout.
 * Handles rate-limit gateway hangs (e.g., Render free tier shared IPs)
 * by giving up after a timeout and retrying with backoff.
 */
async function loginWithRetry(maxAttempts: number = 5): Promise<void> {
    const LOGIN_TIMEOUT_MS = 30_000; // 30 seconds per attempt

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`🔑 Discord login attempt ${attempt}/${maxAttempts}...`);

            // Race login against a timeout
            await Promise.race([
                client.login(config.discordToken),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Gateway connection timed out (30s)')), LOGIN_TIMEOUT_MS)
                ),
            ]);

            console.log('✅ Discord login successful');
            return;
        } catch (error: any) {
            const isTimeout = error.message?.includes('timed out');
            const isRateLimit = error.message?.includes('429') || error.code === 'ECONNRESET';

            if (attempt < maxAttempts) {
                const delay = Math.min(5_000 * Math.pow(2, attempt - 1), 60_000); // 5s, 10s, 20s, 40s, 60s
                const reason = isTimeout ? 'gateway timeout (shared IP rate-limited?)'
                    : isRateLimit ? 'rate-limited by Discord/Cloudflare'
                        : error.message;

                console.warn(`⚠️ Login failed: ${reason}`);
                console.warn(`   Retrying in ${delay / 1000}s...`);

                // Destroy the client to reset gateway state before retry
                client.destroy();
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('❌ All login attempts failed. The bot cannot connect to Discord.');
                console.error('   If this persists, your hosting IP may be rate-limited by Discord/Cloudflare.');
                console.error('   Consider using Railway or a VPS with a dedicated IP.');
                throw error;
            }
        }
    }
}

/**
 * Main bot initialization
 */
async function main() {
    try {
        console.log('🚀 Starting Patreon Tier-Waterfall Bot...');

        // Initialize i18n
        initI18n(process.env.BOT_LOCALE || 'en');

        // Validate configuration
        validateConfig();

        // Initialize Supabase
        initSupabase();

        // Initialize database (test connection)
        await initDatabase();

        // Initialize logger
        initLogger(client, config.logChannelId);

        // Start webhook server EARLY so cloud platforms detect the open port
        try {
            await startWebhookServer(config.webhookPort, config.webhookSecret);
        } catch (error) {
            console.error('❌ Failed to start webhook server:', error);
            process.exit(1);
        }

        // Register event handlers
        registerEventHandlers();

        // Login to Discord (with retry for rate-limited environments)
        await loginWithRetry();

    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
}

/**
 * Register Discord event handlers
 */
function registerEventHandlers() {
    // Bot ready event
    client.once(Events.ClientReady, async (readyClient) => {
        console.log(`✅ Bot logged in as ${readyClient.user.tag}`);
        logger.info(`Bot started successfully as ${readyClient.user.tag}`);

        // Start Patreon post poller (checks for silent tier changes)
        startPolling();
    });

    // Interaction create event (for slash commands)
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        try {
            const commandName = interaction.commandName;

            if (commandName.startsWith('admin')) {
                const { handleAdminCommand } = await import('./commands/admin/handler');
                await handleAdminCommand(interaction);
            }

        } catch (error) {
            logger.error(`Error handling command: ${interaction.commandName}`, error as Error);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: '❌ An error occurred while executing this command.',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while executing this command.',
                    ephemeral: true
                });
            }
        }
    });

    // Error handling
    client.on(Events.Error, (error) => {
        logger.error('Discord client error', error);
    });

    // Warning handling
    client.on(Events.Warn, (warning) => {
        logger.warn(warning);
    });
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down bot...');
    stopPolling();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down bot...');
    stopPolling();
    client.destroy();
    process.exit(0);
});

// Start the bot
main();

// Export client for use in other modules
export { client };

