import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getAllTierMappings, getAllTrackedMembers, getAllTrackedPosts, getConfig, setConfig } from '../../database/db';
import { config } from '../../config';
import { getRecentLogs, LogLevel } from '../../utils/logger';
import { getSupabase } from '../../database/supabase';

// ── DB-backed diagnostic counters ────────────────────────────────
// In-memory cache for fast reads — persisted to database for survival
// across restarts. Loaded on startup via loadDiagnosticCounters().

interface DiagnosticCounters {
    lastWebhookTimestamp: number | null;
    webhookSuccessCount: number;
    webhookFailCount: number;
    tierDetectionSuccess: number;
    tierDetectionFail: number;
}

const counters: DiagnosticCounters = {
    lastWebhookTimestamp: null,
    webhookSuccessCount: 0,
    webhookFailCount: 0,
    tierDetectionSuccess: 0,
    tierDetectionFail: 0,
};

// Debounce timer for batching DB writes (avoid hammering on every webhook)
let persistTimer: NodeJS.Timeout | null = null;
const PERSIST_DEBOUNCE_MS = 5_000; // batch writes within 5s window

/**
 * Load diagnostic counters from the database on startup.
 *
 * Webhook stats come from the `webhook_log` table (ground truth).
 * Tier detection stats come from `bot_config` (persisted counters).
 *
 * Should be called once from index.ts after DB is initialized.
 */
export async function loadDiagnosticCounters(): Promise<void> {
    console.log('📊 [DIAGNOSTICS] Loading persisted counters from database...');

    // ── 1. Webhook stats from webhook_log table ──────────────────────
    try {
        const supabase = getSupabase();

        // Total webhooks received (all rows in webhook_log)
        const { error: totalErr } = await supabase
            .from('webhook_log')
            .select('*', { count: 'exact', head: true });

        // Successful webhooks (processed=true, no error notes)
        const { count: successCount } = await supabase
            .from('webhook_log')
            .select('*', { count: 'exact', head: true })
            .eq('processed', true)
            .is('notes', null);

        // Also count where notes exist but don't start with "Handler threw"
        // (e.g., informational notes are still successes)
        const { count: successWithNotesCount } = await supabase
            .from('webhook_log')
            .select('*', { count: 'exact', head: true })
            .eq('processed', true)
            .not('notes', 'is', null)
            .not('notes', 'like', 'Handler threw:%');

        // Failed webhooks (notes start with "Handler threw:")
        const { count: failCount } = await supabase
            .from('webhook_log')
            .select('*', { count: 'exact', head: true })
            .like('notes', 'Handler threw:%');

        // Last webhook timestamp
        const { data: lastRow, error: lastErr } = await supabase
            .from('webhook_log')
            .select('received_at')
            .order('received_at', { ascending: false })
            .limit(1)
            .single();

        if (!totalErr) {
            const okCount = (successCount ?? 0) + (successWithNotesCount ?? 0);
            counters.webhookSuccessCount = okCount;
            counters.webhookFailCount = failCount ?? 0;
        }

        if (!lastErr && lastRow) {
            counters.lastWebhookTimestamp = new Date(lastRow.received_at).getTime();
        }

        console.log(`📊 [DIAGNOSTICS] Webhook log: ${counters.webhookSuccessCount} success, ${counters.webhookFailCount} failed, last: ${counters.lastWebhookTimestamp ? new Date(counters.lastWebhookTimestamp).toISOString() : 'never'}`);
    } catch (err) {
        console.warn('⚠️ [DIAGNOSTICS] Could not load webhook stats from webhook_log (table may not exist yet):', (err as Error).message);
    }

    // ── 2. Tier detection stats from bot_config ─────────────────────
    try {
        const tdSuccess = await getConfig('diag_tier_detect_success');
        const tdFail = await getConfig('diag_tier_detect_fail');

        counters.tierDetectionSuccess = tdSuccess ? parseInt(tdSuccess, 10) : 0;
        counters.tierDetectionFail = tdFail ? parseInt(tdFail, 10) : 0;

        console.log(`📊 [DIAGNOSTICS] Tier detection: ${counters.tierDetectionSuccess} success, ${counters.tierDetectionFail} failed`);
    } catch (err) {
        console.warn('⚠️ [DIAGNOSTICS] Could not load tier detection stats:', (err as Error).message);
    }

    console.log('📊 [DIAGNOSTICS] Counters loaded successfully');
}

/**
 * Record a webhook processing result.
 * Updates in-memory cache immediately + schedules a debounced DB persist.
 *
 * NOTE: webhook counts are derived from webhook_log on startup, so we
 * only need to update in-memory during the session. But we still bump
 * lastWebhookTimestamp in bot_config for fastest startup recovery.
 */
export function recordWebhook(success: boolean): void {
    counters.lastWebhookTimestamp = Date.now();
    if (success) counters.webhookSuccessCount++;
    else counters.webhookFailCount++;

    schedulePersist();
}

/**
 * Record a tier detection result.
 * Updates in-memory cache + schedules a debounced DB persist.
 */
export function recordTierDetection(success: boolean): void {
    if (success) counters.tierDetectionSuccess++;
    else counters.tierDetectionFail++;

    schedulePersist();
}

/**
 * Debounced DB persist — batches rapid webhook bursts into a single write.
 */
function schedulePersist(): void {
    if (persistTimer) return; // Already scheduled

    persistTimer = setTimeout(async () => {
        persistTimer = null;
        try {
            // Tier detection counters → bot_config
            await setConfig('diag_tier_detect_success', String(counters.tierDetectionSuccess));
            await setConfig('diag_tier_detect_fail', String(counters.tierDetectionFail));

            // Last webhook timestamp → bot_config (fast startup recovery)
            if (counters.lastWebhookTimestamp) {
                await setConfig('diag_last_webhook_at', String(counters.lastWebhookTimestamp));
            }
        } catch {
            // Non-critical — in-memory values are still correct
        }
    }, PERSIST_DEBOUNCE_MS);
}

/**
 * Immediately flush all diagnostic counters to the database.
 * Called during graceful shutdown (SIGINT/SIGTERM) to prevent data loss
 * from the 5-second debounce window.
 */
export async function flushDiagnosticCounters(): Promise<void> {
    // Cancel any pending debounced write
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
    }

    try {
        await setConfig('diag_tier_detect_success', String(counters.tierDetectionSuccess));
        await setConfig('diag_tier_detect_fail', String(counters.tierDetectionFail));
        if (counters.lastWebhookTimestamp) {
            await setConfig('diag_last_webhook_at', String(counters.lastWebhookTimestamp));
        }
        console.log('📊 [DIAGNOSTICS] Counters flushed to database on shutdown');
    } catch (err) {
        console.warn('⚠️ [DIAGNOSTICS] Failed to flush counters on shutdown:', (err as Error).message);
    }
}

/**
 * Get the current diagnostic counters (for use by other modules).
 */
export function getDiagnosticCounters(): Readonly<DiagnosticCounters> {
    return counters;
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

        // ── Webhook diagnostics (from DB-backed counters) ────────
        const lastWh = counters.lastWebhookTimestamp
            ? `<t:${Math.floor(counters.lastWebhookTimestamp / 1000)}:R>`
            : '*No webhooks received yet*';
        const whTotal = counters.webhookSuccessCount + counters.webhookFailCount;
        const whRate = whTotal > 0 ? `${((counters.webhookSuccessCount / whTotal) * 100).toFixed(0)}%` : 'N/A';

        // ── Tier detection stats (from DB-backed counters) ────────
        const tdTotal = counters.tierDetectionSuccess + counters.tierDetectionFail;
        const tdRate = tdTotal > 0 ? `${((counters.tierDetectionSuccess / tdTotal) * 100).toFixed(0)}%` : 'N/A';

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
                { name: '📊 Webhook Success', value: `${counters.webhookSuccessCount}/${whTotal} (${whRate})`, inline: true },
                { name: '🎯 Tier Detection', value: `${counters.tierDetectionSuccess}/${tdTotal} (${tdRate})`, inline: true },
                { name: '\u200B', value: '\u200B' },
                { name: '📊 Tier Mappings', value: tierMappingText },
                { name: '⚠️ Recent Errors', value: errorText },
            )
            .setTimestamp()
            .setFooter({ text: `Admin: ${interaction.user.tag} · Counters persisted to DB` });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        await interaction.editReply({
            content: '❌ Failed to fetch status. Please check the logs.'
        });
        throw error;
    }
}

