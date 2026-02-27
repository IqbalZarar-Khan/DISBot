import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getRecentLogs, LogLevel } from '../../utils/logger';

/**
 * /admin debug-logs
 * Sends the last 50 X-Ray debug log lines as an ephemeral message.
 */
export async function handleDebugLogs(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    const logs = getRecentLogs(50);

    if (logs.length === 0) {
        await interaction.editReply({ content: '📋 No log entries recorded yet. Logs appear after bot activity.' });
        return;
    }

    // Format log entries into readable text
    const lines = logs.map(entry => {
        const emoji = entry.level === LogLevel.ERROR ? '🚨'
            : entry.level === LogLevel.WARN ? '⚠️' : '✅';
        const time = entry.timestamp.substring(11, 19); // HH:MM:SS
        const errSuffix = entry.error ? ` | ${entry.error}` : '';
        return `${emoji} \`${time}\` ${entry.message}${errSuffix}`;
    });

    // Discord has a 4096 char embed description limit — split if needed
    const chunks: string[] = [];
    let current = '';

    for (const line of lines) {
        if ((current + '\n' + line).length > 3900) {
            chunks.push(current);
            current = line;
        } else {
            current = current ? current + '\n' + line : line;
        }
    }
    if (current) chunks.push(current);

    // Send first chunk as embed
    const embed = new EmbedBuilder()
        .setTitle('🔍 X-Ray Debug Logs')
        .setColor(0x5865f2)
        .setDescription(chunks[0])
        .setFooter({ text: `Showing ${logs.length} of ${logs.length} buffered entries (max 200)` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Send additional chunks as follow-ups
    for (let i = 1; i < chunks.length; i++) {
        const extraEmbed = new EmbedBuilder()
            .setDescription(chunks[i])
            .setColor(0x5865f2);
        await interaction.followUp({ embeds: [extraEmbed], ephemeral: true });
    }
}
