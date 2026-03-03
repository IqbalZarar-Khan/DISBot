import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getAllTierMappings, getAllTrackedMembers, getAllTrackedPosts } from '../../database/db';
import { config } from '../../config';
import { getPatreonClient } from '../../utils/patreonClient';
import { getRecentLogs, LogLevel } from '../../utils/logger';

// ── In-memory diagnostic counters ────────────────────────────────
let lastWebhookTimestamp: number | null = null;
let webhookSuccessCount = 0;
let webhookFailCount = 0;
let tierDetectionSuccess = 0;
let tierDetectionFail = 0;

/** Call this from webhook handlers to track activity */
export function recordWebhook(success: boolean): void {
    lastWebhookTimestamp = Date.now();
    if (success) webhookSuccessCount++;
    else webhookFailCount++;
}

/** Call this from tier detection logic to track accuracy */
export function recordTierDetection(success: boolean): void {
    if (success) tierDetectionSuccess++;
    else tierDetectionFail++;
}

export async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    try {
        // ── Patreon API ──────────────────────────────────────────
        let patreonStatus = '🔴 Error';
        let patreonLatency = '';
        try {
            const start = Date.now();
            const patreon = await getPatreonClient();
            const response = await patreon.get(
                `/campaigns/${config.patreonCampaignId}`,
                {
                    timeout: 5000,
                    params: { 'fields[campaign]': 'created_at' }
                }
            );
            const latency = Date.now() - start;
            if (response.status === 200) {
                patreonStatus = '🟢 Connected';
                patreonLatency = ` (${latency}ms)`;
            }
        } catch (err: any) {
            const code = err.response?.status;
            const detail = err.response?.data?.errors?.[0]?.detail || err.message || '';
            if (code === 401) {
                patreonStatus = '🔴 Token expired/invalid';
            } else if (code === 404) {
                patreonStatus = `🔴 Campaign not found (ID: ${config.patreonCampaignId || 'MISSING'})`;
            } else {
                patreonStatus = `🔴 Error (${code || 'network'}): ${detail.substring(0, 50)}`;
            }
        }

        // ── Database health ──────────────────────────────────────
        let dbStatus = '🔴 Error';
        let memberCount = 0;
        let postCount = 0;
        try {
            const members = await getAllTrackedMembers();
            const posts = await getAllTrackedPosts();
            memberCount = members.length;
            postCount = posts.length;
            dbStatus = '🟢 Connected';
        } catch {
            dbStatus = '🔴 Unreachable';
        }

        // ── Tier mappings ────────────────────────────────────────
        const tierMappings = await getAllTierMappings();
        let tierMappingText = '';
        if (tierMappings.length === 0) {
            tierMappingText = '*No tier mappings configured yet.*\nUse `/admin setup` to configure.';
        } else {
            tierMappingText = tierMappings
                .map(m => `**${m.tier_name}** (Rank ${m.tier_rank}) ➡️ <#${m.channel_id}>`)
                .join('\n');
        }

        // ── Webhook diagnostics ──────────────────────────────────
        const lastWh = lastWebhookTimestamp
            ? `<t:${Math.floor(lastWebhookTimestamp / 1000)}:R>`
            : '*No webhooks received yet*';
        const whTotal = webhookSuccessCount + webhookFailCount;
        const whRate = whTotal > 0 ? `${((webhookSuccessCount / whTotal) * 100).toFixed(0)}%` : 'N/A';

        // ── Tier detection stats ─────────────────────────────────
        const tdTotal = tierDetectionSuccess + tierDetectionFail;
        const tdRate = tdTotal > 0 ? `${((tierDetectionSuccess / tdTotal) * 100).toFixed(0)}%` : 'N/A';

        // ── Recent errors ────────────────────────────────────────
        const recentErrors = getRecentLogs(200)
            .filter(l => l.level === LogLevel.ERROR || l.level === LogLevel.WARN)
            .slice(-3);
        const errorText = recentErrors.length > 0
            ? recentErrors.map(e => `\`${e.timestamp.substring(11, 19)}\` ${e.message}`).join('\n')
            : '✅ No recent errors';

        // ── Uptime ──────────────────────────────────────────────
        const uptimeMs = process.uptime() * 1000;
        const hours = Math.floor(uptimeMs / 3600000);
        const minutes = Math.floor((uptimeMs % 3600000) / 60000);
        const uptimeText = `${hours}h ${minutes}m`;

        // ── Build embed ──────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Status & Diagnostics')
            .setColor(0x5865f2)
            .addFields(
                { name: 'Patreon API', value: `${patreonStatus}${patreonLatency}`, inline: true },
                { name: 'Database', value: `${dbStatus} (${memberCount} patrons, ${postCount} posts)`, inline: true },
                { name: 'Uptime', value: uptimeText, inline: true },
                { name: '\u200B', value: '\u200B' },
                { name: '📡 Last Webhook', value: lastWh, inline: true },
                { name: '📊 Webhook Success', value: `${webhookSuccessCount}/${whTotal} (${whRate})`, inline: true },
                { name: '🎯 Tier Detection', value: `${tierDetectionSuccess}/${tdTotal} (${tdRate})`, inline: true },
                { name: '\u200B', value: '\u200B' },
                { name: '📊 Tier Mappings', value: tierMappingText },
                { name: '⚠️ Recent Errors', value: errorText },
            )
            .setTimestamp()
            .setFooter({ text: `Admin: ${interaction.user.tag}` });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        await interaction.editReply({
            content: '❌ Failed to fetch status. Please check the logs.'
        });
        throw error;
    }
}
