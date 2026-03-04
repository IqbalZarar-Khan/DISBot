import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { startPolling, stopPolling, isPollingActive } from '../../utils/patreonPoller';
import { logger } from '../../utils/logger';

/**
 * /admin poller <action>
 * Start or stop the Patreon post poller to save resources.
 */
export async function handlePoller(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    // Defer the reply to give the bot more time to process without Discord throwing an Unknown Interaction error
    await interaction.deferReply({ ephemeral: true });

    const action = interaction.options.getString('action', true);
    const active = isPollingActive();

    if (action === 'status') {
        const embed = new EmbedBuilder()
            .setTitle('🔄 Patreon Poller Status')
            .setColor(active ? 0x00ff00 : 0xff4444)
            .setDescription(active
                ? '✅ **Active** — The poller is checking for silent tier changes.'
                : '⏸️ **Stopped** — The poller is currently disabled.')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    if (action === 'start') {
        if (active) {
            await interaction.editReply({ content: '⚠️ Poller is already running.' });
            return;
        }

        startPolling();
        logger.info('🔄 [POLLER] Manually started by admin');

        const embed = new EmbedBuilder()
            .setTitle('✅ Poller Started')
            .setColor(0x00ff00)
            .setDescription('The Patreon post poller has been manually enabled.\nIt will now check for silent tier changes on the configured interval.')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    if (action === 'stop') {
        if (!active) {
            await interaction.editReply({ content: '⚠️ Poller is already stopped.' });
            return;
        }

        stopPolling();
        logger.info('🔄 [POLLER] Manually stopped by admin');

        const embed = new EmbedBuilder()
            .setTitle('⏸️ Poller Stopped')
            .setColor(0xff4444)
            .setDescription('The Patreon post poller has been disabled.\nSilent tier changes will not be detected until the poller is restarted.')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    await interaction.editReply({ content: '❌ Unknown action. Use `start`, `stop`, or `status`.' });
}
