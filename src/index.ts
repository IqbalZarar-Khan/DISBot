import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config, validateConfig } from './config';
import { initSupabase } from './database/supabase';
import { initDatabase } from './database/db';
import { initLogger, logger } from './utils/logger';
import { startWebhookServer } from './webhooks/server';
import https from 'https';

/**
 * Quick connectivity test to Discord API
 */
function testDiscordAPI(token: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = https.get('https://discord.com/api/v10/gateway/bot', {
            headers: { 'Authorization': `Bot ${token}` },
            timeout: 10000
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(`Status ${res.statusCode}: ${data}`));
        });
        req.on('error', (err) => reject(err));
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after 10s')); });
    });
}

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

        // Test Discord API connectivity BEFORE login
        console.log('🔍 Testing Discord API connectivity...');
        try {
            const result = await testDiscordAPI(config.discordToken);
            console.log(`✅ Discord API test: ${result}`);
        } catch (err) {
            console.error('❌ Discord API connectivity test FAILED:', (err as Error).message);
            console.error('❌ Cannot reach Discord from Render runtime. This is a network issue.');
        }

        // Raw event listeners for debugging
        client.on('error', (err) => {
            console.error('🔴 [CLIENT ERROR]:', err.message);
        });
        client.on('shardError', (err, shardId) => {
            console.error(`🔴 [SHARD ${shardId} ERROR]:`, err.message);
        });
        client.on('shardDisconnect', (event: any, shardId) => {
            console.error(`🔴 [SHARD ${shardId} DISCONNECT]: Code ${event.code}`);
        });
        client.on('shardReconnecting', (shardId) => {
            console.log(`🔄 [SHARD ${shardId} RECONNECTING]`);
        });
        client.on('debug', (info) => {
            console.log(`[DEBUG] ${info}`);
        });

        // Login to Discord with timeout
        console.log('🔑 Attempting Discord login...');

        const loginTimeout = setTimeout(() => {
            console.error('❌ Discord login TIMED OUT after 30s!');
        }, 30000);

        await client.login(config.discordToken);
        clearTimeout(loginTimeout);
        console.log('✅ Discord login successful (gateway connected)');

    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        console.error('❌ Error message:', (error as Error).message);
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

    client.on(Events.Error, (error) => {
        console.error('❌ [Events.Error]:', error.message);
        logger.error('Discord client error', error);
    });

    client.on(Events.Warn, (warning) => {
        console.warn('⚠️ [Events.Warn]:', warning);
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

process.on('unhandledRejection', (reason) => {
    console.error('🔴 [UNHANDLED REJECTION]:', reason);
});

// Start the bot
main();

// Export client for use in other modules
export { client };
