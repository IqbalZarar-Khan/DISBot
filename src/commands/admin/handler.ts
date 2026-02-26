import { ChatInputCommandInteraction } from 'discord.js';
import { handleSetOwner } from './set-owner';
import { handleStatus } from './status';
import { handleSetChannel } from './set-channel';
import { handleTestAlert } from './test-alert';
import { execute as handleSetMessage } from './set-message';
import { handleSyncTiers } from './sync-tiers';
import { handleSetup } from './setup';
import { handleStats } from './stats';
import { logger } from '../../utils/logger';

/**
 * Main handler for all admin commands
 */
export async function handleAdminCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    try {
        switch (subcommand) {
            case 'set-owner':
                await handleSetOwner(interaction);
                break;

            case 'status':
                await handleStatus(interaction);
                break;

            case 'set-channel':
                await handleSetChannel(interaction);
                break;

            case 'test-alert':
                await handleTestAlert(interaction);
                break;

            case 'set-message':
                await handleSetMessage(interaction);
                break;

            case 'sync-tiers':
                await handleSyncTiers(interaction);
                break;

            case 'setup':
                await handleSetup(interaction);
                break;

            case 'stats':
                await handleStats(interaction);
                break;

            default:
                await interaction.reply({
                    content: '❌ Unknown admin command.',
                    ephemeral: true
                });
        }
    } catch (error) {
        logger.error(`Error in admin command: ${subcommand}`, error as Error);

        // Try to send error message to user
        try {
            const errorMessage = {
                content: '❌ An error occurred while executing this command. Please check the logs.',
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            logger.error('Failed to send error message to user', replyError as Error);
        }
    }
}
