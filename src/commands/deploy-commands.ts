import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { config, validateConfig } from '../config';

// Validate configuration
validateConfig();

const commands = [
    // Admin command with subcommands
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin commands for bot management')
        .setDefaultMemberPermissions(0) // Disable for regular users
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-owner')
                .setDescription('Transfer bot control to a new user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The new owner')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Display bot status and configuration')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-channel')
                .setDescription('Map a Patreon tier to a Discord channel')
                .addStringOption(option =>
                    option
                        .setName('tier_name')
                        .setDescription('Tier name (e.g., Diamond, Gold, Silver, Bronze, Free)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Diamond', value: 'Diamond' },
                            { name: 'Gold', value: 'Gold' },
                            { name: 'Silver', value: 'Silver' },
                            { name: 'Bronze', value: 'Bronze' },
                            { name: 'Free', value: 'Free' }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The Discord channel for this tier')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('test-alert')
                .setDescription('Send a test alert to a tier channel')
                .addStringOption(option =>
                    option
                        .setName('tier_name')
                        .setDescription('Tier name to test')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Diamond', value: 'Diamond' },
                            { name: 'Gold', value: 'Gold' },
                            { name: 'Silver', value: 'Silver' },
                            { name: 'Bronze', value: 'Bronze' },
                            { name: 'Free', value: 'Free' }
                        )
                )
        )
].map(command => command.toJSON());

// Create REST instance
const rest = new REST({ version: '10' }).setToken(config.discordToken);

// Deploy commands
(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

        // Register commands to guild (faster for development)
        const data = await rest.put(
            Routes.applicationGuildCommands(config.patreonClientId, config.guildId),
            { body: commands }
        ) as any[];

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        process.exit(1);
    }
})();
