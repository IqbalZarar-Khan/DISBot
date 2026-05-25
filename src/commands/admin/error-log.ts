import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import {
    getRecentErrors,
    getErrorSummary,
    clearErrorLog,
    ErrorLogEntry,
} from '../../utils/logger';

// ── Severity display helpers ──────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
    low: '🟡',
    medium: '🟠',
    high: '🔴',
    critical: '💀',
};

const SEVERITY_COLOR: Record<string, number> = {
    low: 0xf5c542,      // Yellow
    medium: 0xff8c00,   // Dark orange
    high: 0xe74c3c,     // Red
    critical: 0x8b0000, // Deep crimson
};

/**
 * Format a single ErrorLogEntry into an embed.
 * Each error gets its own embed so the layout is always readable.
 */
function buildErrorEmbed(entry: ErrorLogEntry, total: number, index: number): EmbedBuilder {
    const sev = entry.explanation.severity;
    const sevEmoji = SEVERITY_EMOJI[sev] ?? '⚪';
    const color = SEVERITY_COLOR[sev] ?? 0x888888;

    // Time: HH:MM:SS UTC
    const time = entry.timestamp.substring(11, 19);
    const date = entry.timestamp.substring(0, 10);

    // Context tag label
    const contextLabel = entry.context
        ? `\`[${entry.context.toUpperCase()}]\``
        : '`[UNKNOWN]`';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${sevEmoji} Error #${entry.id} — ${sev.toUpperCase()}`)
        .setFooter({ text: `${index + 1} of ${total}  •  ${date} ${time} UTC` });

    // What the bot was doing when it failed
    embed.addFields({
        name: '📍 Where it happened',
        value: `${contextLabel}  ${entry.message.length > 200 ? entry.message.substring(0, 200) + '…' : entry.message}`,
    });

    // Raw error message
    embed.addFields({
        name: '❌ Error message',
        value: `\`\`\`${entry.errorMessage.length > 800 ? entry.errorMessage.substring(0, 800) + '…' : entry.errorMessage}\`\`\``,
    });

    // Explanation: cause
    embed.addFields({
        name: '🔍 Why this happened',
        value: entry.explanation.cause,
    });

    // Explanation: fix
    embed.addFields({
        name: '🛠️ What to do',
        value: entry.explanation.fix,
    });

    // Stack trace (truncated) — only include if it adds useful info
    if (entry.stack && entry.stack.length > 50) {
        const stackSnippet = entry.stack
            .split('\n')
            .filter(line => line.includes('DISBot') || line.includes('src/'))
            .slice(0, 4)
            .join('\n')
            .substring(0, 600);

        if (stackSnippet.trim().length > 0) {
            embed.addFields({
                name: '📚 Stack trace (bot frames only)',
                value: `\`\`\`${stackSnippet}\`\`\``,
            });
        }
    }

    return embed;
}

/**
 * Build the summary header embed shown at the top of every /admin error-log response.
 */
function buildSummaryEmbed(
    errors: ErrorLogEntry[],
    filter?: string
): EmbedBuilder {
    const summary = getErrorSummary();
    const total = summary.low + summary.medium + summary.high + summary.critical;

    const filterLabel = filter
        ? `Showing: **${filter.toUpperCase()}** severity only`
        : 'Showing: **all** severities';

    const embed = new EmbedBuilder()
        .setColor(
            summary.critical > 0 ? 0x8b0000
                : summary.high > 0 ? 0xe74c3c
                    : summary.medium > 0 ? 0xff8c00
                        : 0xf5c542
        )
        .setTitle('🚨 Error Log')
        .setDescription(
            `${filterLabel}  •  Fetched **${errors.length}** of **${total}** buffered errors (max 100)\n` +
            `> 💀 Critical: **${summary.critical}**  🔴 High: **${summary.high}**  🟠 Medium: **${summary.medium}**  🟡 Low: **${summary.low}**\n\n` +
            (total === 0
                ? '✅ **No errors recorded since last restart.** The bot is running clean.'
                : errors.length === 0
                    ? '✅ No errors match the current filter.'
                    : `Scroll through the embeds below. Each error includes a **cause** and **fix**.`)
        )
        .setTimestamp()
        .setFooter({ text: 'Use /admin error-log clear to reset · /admin debug-logs for full trace' });

    return embed;
}

// ── Main command handler ──────────────────────────────────────────────────────

/**
 * /admin error-log
 *
 * Options:
 *   action:  view (default) | clear
 *   severity: all (default) | low | medium | high | critical
 *   count:   1–25 (default 10)
 */
export async function handleErrorLog(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    const action = interaction.options.getString('action') ?? 'view';
    const severityFilter = interaction.options.getString('severity') ?? undefined;
    const count = Math.min(Math.max(interaction.options.getInteger('count') ?? 10, 1), 25);

    // ── Clear action ──────────────────────────────────────────────────────────
    if (action === 'clear') {
        clearErrorLog();
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle('✅ Error log cleared')
                    .setDescription('All buffered errors have been removed from memory.\nThe log will repopulate as new errors occur.')
                    .setTimestamp()
            ]
        });
        return;
    }

    // ── View action ───────────────────────────────────────────────────────────
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    const sev = validSeverities.includes(severityFilter ?? '')
        ? severityFilter as 'low' | 'medium' | 'high' | 'critical'
        : undefined;

    const errors = getRecentErrors(count, sev);

    // Always show summary header first
    const summaryEmbed = buildSummaryEmbed(errors, sev);
    await interaction.editReply({ embeds: [summaryEmbed] });

    if (errors.length === 0) return;

    // Send each error as a separate follow-up so they don't get squashed
    // Discord allows up to 10 embeds per message, so we batch them
    const BATCH_SIZE = 4; // 4 errors per message keeps each one readable

    for (let i = 0; i < errors.length; i += BATCH_SIZE) {
        const batch = errors.slice(i, i + BATCH_SIZE);
        const embeds = batch.map((entry, batchIdx) =>
            buildErrorEmbed(entry, errors.length, i + batchIdx)
        );
        await interaction.followUp({ embeds, ephemeral: true });
    }
}
