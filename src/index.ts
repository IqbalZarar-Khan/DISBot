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
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
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
        // Is the bot unconfigured? (Missing core tokens)
        if ((config as any)._isSetupMode) {
            console.log('🚧 CORE CONFIGURATION MISSING: Entering Cloud Setup Mode...');
            console.log('   Starting web server only so you can run the Setup Wizard.');
            try {
                await startWebhookServer(config.webhookPort, config.webhookSecret);
                console.log(`\n\n🧙 CLOUD SETUP READY: Open your domain at /setup to complete configuration (e.g. https://your-app.up.railway.app/setup)\n\n`);
            } catch (error) {
                console.error('❌ Failed to start webhook server for setup:', error);
                process.exit(1);
            }
            return; // Exit early, DO NOT login to Discord or start DB
        }

        // --- NORMAL BOOT SEQUENCE ---

        // Initialize Supabase
        initSupabase();

        // Run database migrations automatically
        try {
            const { runAutoMigrations } = await import('./database/autoMigrate');
            await runAutoMigrations();
        } catch (err) {
            console.warn('⚠️ Auto-migration check failed (non-fatal):', (err as Error).message);
        }

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

        // Auto-deploy slash commands on startup
        try {
            console.log('🔄 Auto-deploying slash commands...');
            const { REST, Routes } = await import('discord.js');
            const { getCommandData } = await import('./commands/commandData');
            const rest = new REST({ version: '10' }).setToken(config.discordToken);
            const applicationId = Buffer.from(config.discordToken.split('.')[0], 'base64').toString('utf-8');
            const commands = getCommandData();
            const data = await rest.put(
                Routes.applicationGuildCommands(applicationId, config.guildId),
                { body: commands }
            ) as any[];
            console.log(`✅ Auto-deployed ${data.length} slash commands`);
        } catch (err) {
            console.warn('⚠️ Auto-deploy commands failed (non-fatal):', (err as Error).message);
        }

        // Initialize in-memory DB cache for graceful degradation
        try {
            const { initDbCache } = await import('./database/dbCache');
            await initDbCache();
        } catch (err) {
            console.warn('⚠️ DB cache init failed (non-fatal):', (err as Error).message);
        }

        // Validate OAuth scopes on startup
        try {
            const axios = (await import('axios')).default;
            const res = await axios.get('https://www.patreon.com/api/oauth2/v2/campaigns', {
                headers: { Authorization: `Bearer ${config.patreonAccessToken}` },
                timeout: 10000,
            });
            if (res.status === 200) {
                console.log('✅ Patreon OAuth scopes validated (campaigns accessible)');
            }
        } catch (scopeErr: any) {
            if (scopeErr.response?.status === 401) {
                console.error('❌ PATREON_ACCESS_TOKEN is invalid or expired!');
                console.error('   → Run /oauth/start or refresh your token.');
            } else if (scopeErr.response?.status === 403) {
                console.error('❌ PATREON_ACCESS_TOKEN is missing required scopes!');
                console.error('   → Ensure your OAuth app has: campaigns, campaigns.members, campaigns.posts');
            } else {
                console.warn('⚠️ Could not validate Patreon scopes:', scopeErr.message);
            }
        }

        // Start Patreon post poller (checks for silent tier changes)
        startPolling();

        // Start anniversary checker (daily)
        try {
            const { startAnniversaryChecker } = await import('./utils/anniversaryChecker');
            startAnniversaryChecker();
        } catch (err) {
            console.warn('⚠️ Anniversary checker failed to start:', (err as Error).message);
        }

        // Start weekly digest scheduler (Sundays)
        try {
            const { startWeeklyDigest } = await import('./utils/weeklyDigest');
            startWeeklyDigest();
        } catch (err) {
            console.warn('⚠️ Weekly digest failed to start:', (err as Error).message);
        }

        // Register keyword detection (if Message Content Intent is enabled)
        try {
            const { registerKeywordDetection } = await import('./utils/keywordDetector');
            registerKeywordDetection(readyClient as any);
        } catch (err) {
            console.warn('⚠️ Keyword detection failed to register:', (err as Error).message);
        }

        // Run pre-flight health checks (intents, webhooks)
        try {
            const { runHealthChecks } = await import('./utils/healthChecks');
            await runHealthChecks(readyClient as any);
        } catch (err) {
            console.warn('⚠️ Health checks failed:', (err as Error).message);
        }

        // Register setup mode (!claim command) if IDs aren't configured
        try {
            const { registerSetupMode } = await import('./utils/setupMode');
            registerSetupMode(readyClient as any);
        } catch (err) {
            console.warn('⚠️ Setup mode failed to register:', (err as Error).message);
        }

        // Send first-deployment welcome DM
        try {
            const { sendFirstDeployDM } = await import('./utils/firstDeploy');
            await sendFirstDeployDM(readyClient as any);
        } catch (err) {
            console.warn('⚠️ First deploy DM failed:', (err as Error).message);
        }
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

