import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config, validateConfig } from './config';
import { initSupabase } from './database/supabase';
import { initDatabase } from './database/db';
import { initLogger, logger } from './utils/logger';
import { startWebhookServer } from './webhooks/server';

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

/**
 * Main bot initialization
 */
async function main() {
    try {
        console.log('🚀 Starting Patreon Tier-Waterfall Bot...');

        // Validate configuration
        validateConfig();

        // Initialize Supabase
        initSupabase();

        // Initialize database (test connection)
        await initDatabase();

        // Initialize logger
        initLogger(client, config.logChannelId);

        // Start webhook server EARLY so Render detects the open port
        try {
            await startWebhookServer(config.webhookPort, config.webhookSecret);
        } catch (error) {
            console.error('❌ Failed to start webhook server:', error);
            process.exit(1);
        }

        // Register event handlers
        registerEventHandlers();

        // Login to Discord
        console.log('🔑 Attempting Discord login...');
        console.log(`🔑 Token length: ${config.discordToken.length} chars`);
        console.log(`🔑 Token prefix: ${config.discordToken.substring(0, 10)}...`);

        await client.login(config.discordToken);
        console.log('✅ Discord login successful (gateway connected)');

    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        console.error('❌ Error name:', (error as Error).name);
        console.error('❌ Error message:', (error as Error).message);
        // Don't exit - keep webhook server alive so we can see logs on Render
        console.error('⚠️ Bot will stay alive for debugging (webhook server still running)');
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
    });

    // Interaction create event (for slash commands)
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        try {
            // Import command handlers dynamically
            const commandName = interaction.commandName;

            // Admin commands
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
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down bot...');
    client.destroy();
    process.exit(0);
});

// Start the bot
main();

// Export client for use in other modules
export { client };
