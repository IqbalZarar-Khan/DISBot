import { ChatInputCommandInteraction } from 'discord.js';
import { handleSetOwner } from './set-owner';
import { handleStatus } from './status';
import { handleSetChannel } from './set-channel';
import { handleTestAlert } from './test-alert';
import { execute as handleSetMessage } from './set-message';
import { handleSyncTiers } from './sync-tiers';
import { handleSetup } from './setup';
import { handleStats } from './stats';
import { handleDigest } from './digest';
import { handleSetEventChannel } from './set-event-channel';
import { handleDebugLogs } from './debug-logs';
import { handleExportData } from './export-data';
import { handleBulkMap } from './bulk-map';
import { handlePoller } from './poller';
import { handleServerStats } from './server-stats';
import { handleRoleMap } from './role-map';
import { handleDashboard } from './dashboard-cmd';
import { handleErrorLog } from './error-log';
import { handleReplayWebhook } from './replay-webhook';
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

            case 'digest':
                await handleDigest(interaction);
                break;

            case 'set-event-channel':
                await handleSetEventChannel(interaction);
                break;

            case 'debug-logs':
                await handleDebugLogs(interaction);
                break;

            case 'export-data':
                await handleExportData(interaction);
                break;

            case 'bulk-map':
                await handleBulkMap(interaction);
                break;

            case 'poller':
                await handlePoller(interaction);
                break;

            case 'server-stats':
                await handleServerStats(interaction);
                break;

            case 'role-map':
                await handleRoleMap(interaction);
                break;

            case 'dashboard':
                await handleDashboard(interaction);
                break;

            case 'error-log':
                await handleErrorLog(interaction);
                break;

            case 'replay-webhook':
                await handleReplayWebhook(interaction);
                break;

            default:
                await interaction.reply({
                    content: '❌ Unknown admin command.',
                    ephemeral: true
                });
        }
    } catch (error: any) {
        // Handle Unknown Interaction (10062) commonly caused by zero-downtime overlaps 
        // on hosts like Railway or slow event loops.
        if (error.code === 10062) {
            logger.warn(`⚠️ Interaction expired or handled by another instance for: ${subcommand}`);
            return;
        }

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
        } catch (replyError: any) {
            if (replyError.code !== 10062) {
                logger.error('Failed to send error message to user', replyError as Error);
            }
        }
    }
}
