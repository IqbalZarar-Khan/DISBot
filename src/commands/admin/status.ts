import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getAllTierMappings, getAllTrackedMembers, getAllTrackedPosts } from '../../database/db';
import { config } from '../../config';
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

// ── Cached Patreon API health check ──────────────────────────────
const PATREON_CACHE_TTL_MS = 60_000; // Cache for 60 seconds
let cachedPatreonResult: { status: string; latency: string; timestamp: number } | null = null;

async function getPatreonHealth(): Promise<{ status: string; latency: string }> {
    // Return cached result if still fresh
    if (cachedPatreonResult && (Date.now() - cachedPatreonResult.timestamp) < PATREON_CACHE_TTL_MS) {
        return { status: cachedPatreonResult.status, latency: cachedPatreonResult.latency };
    }

    let status = '🔴 Error';
    let latency = '';

    try {
        const start = Date.now();
        const axios = (await import('axios')).default;
        const token = process.env.PATREON_ACCESS_TOKEN || config.patreonAccessToken;

        const response = await axios.get(
            'https://www.patreon.com/api/oauth2/api/current_user',
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Accept-Encoding': 'gzip, deflate',
                },
                timeout: 5000,
            }
        );
        const ms = Date.now() - start;
        if (response.status === 200) {
            const name = response.data?.data?.attributes?.full_name || 'Unknown';
            status = '🟢 Connected';
            latency = ` (${ms}ms, ${name})`;
        }
    } catch (err: any) {
        const code = err.response?.status;
        if (code === 401) {
            status = '🔴 Token expired/invalid';
        } else if (code === 403) {
            status = '🔴 Token missing required scopes';
        } else {
            status = `🔴 Error (${code || 'network'}): ${(err.message || '').substring(0, 40)}`;
        }
    }

    cachedPatreonResult = { status, latency, timestamp: Date.now() };
    return { status, latency };
}

export async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    try {
        // ── Patreon API (cached) ─────────────────────────────────
        const { status: patreonStatus, latency: patreonLatency } = await getPatreonHealth();

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
