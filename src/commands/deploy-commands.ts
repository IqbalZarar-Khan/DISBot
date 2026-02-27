import { REST, Routes } from 'discord.js';
import { config, validateConfig } from '../config';
import { getCommandData } from './commandData';

// Validate configuration
validateConfig();

const commands = getCommandData();

// Create REST instance
const rest = new REST({ version: '10' }).setToken(config.discordToken);

// Deploy commands
(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

        // Get Discord Application ID from token
        const applicationId = Buffer.from(config.discordToken.split('.')[0], 'base64').toString('utf-8');

        // Register commands to guild (faster for development)
        const data = await rest.put(
            Routes.applicationGuildCommands(applicationId, config.guildId),
            { body: commands }
        ) as any[];

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        process.exit(1);
    }
})();
