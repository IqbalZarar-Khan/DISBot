import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import {
    getMissedAnnouncements,
    getRecentWebhookLogs,
    getWebhookLogById,
    WebhookLogRow,
} from '../../database/webhookCache';
import { routeWebhookEvent, SUPPORTED_WEBHOOK_EVENTS } from '../../webhooks/router';
import { WebhookEventType } from '../../database/schema';
import { logger } from '../../utils/logger';

/**
 * /admin replay-webhook
 *
 * Audit + replay tool for the webhook_log table. Webhooks that arrived and
 * passed signature verification but never produced a Discord announcement
 * (handler threw, bot restarting, tier detection failed...) can be
 * re-dispatched through the normal router from here.
 *
 * Options:
 *   action:  view (default) | replay | replay-missed
 *   log_id:  webhook_log row id (required for "replay")
 *   hours:   lookback window for "replay-missed" (default 24, max 168)
 */

// Default batch cap if limit is unspecified
const DEFAULT_BATCH_REPLAY = 25;

const VIEW_ROW_LIMIT = 25; // Discord embed field limit

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRowStatus(row: { processed: boolean; announced: boolean; notes: string | null }): string {
    if (row.announced) return '✅ announced';
    if (row.processed) return '⚠️ processed, no announcement';
    return '❌ unprocessed';
}

function timeAgoTag(receivedAt: string): string {
    const unix = Math.floor(new Date(receivedAt).getTime() / 1000);
    return `<t:${unix}:R>`;
}

/**
 * Restore redacted patron names and Discord IDs in a stored payload before replay.
 * full_name/email etc. are stripped by PII redaction at log time; the
 * member_name column still holds the display name, and discord_user_id
 * preserves the Discord ID, so we patch them back in for replay.
 * Emails stay redacted (not recoverable — by design).
 */
/**
 * Restore redacted patron names, Discord IDs, and legacy post URLs in a stored payload before replay.
 * full_name/email etc. are stripped by PII redaction at log time; the
 * member_name column still holds the display name, and discord_user_id
 * preserves the Discord ID, so we patch them back in for replay.
 * For legacy posts:* rows where URL was redacted, we look up tracked_posts.
 */
async function hydrateRedactedPayload(row: WebhookLogRow): Promise<any> {
    if (!row.payload) return null;

    const payload = JSON.parse(JSON.stringify(row.payload));

    // 1. Member Events: Restore member name and Discord ID
    if (row.member_name && row.member_name !== 'Unknown') {
        if (row.event_type.startsWith('members:') && !row.event_type.includes('pledge')) {
            if (payload.data?.attributes) {
                payload.data.attributes.full_name = row.member_name;
            }
        } else if (row.event_type.startsWith('members:pledge')) {
            const included = payload.included || [];
            const patronRef = payload.data?.relationships?.patron?.data;
            const userRecord = patronRef
                ? included.find((item: any) => item.type === 'user' && item.id === patronRef.id)
                : included.find((item: any) => item.type === 'user');
            if (userRecord?.attributes) {
                userRecord.attributes.full_name = row.member_name;
                // Restore Discord user ID if available (for targeted DM delivery)
                if (row.discord_user_id && userRecord.attributes.social_connections) {
                    userRecord.attributes.social_connections.discord = {
                        user_id: row.discord_user_id,
                    };
                }
            }
        }
    }

    // 2. Post Events: Restore legacy redacted post URL / title from tracked_posts
    if (row.event_type.startsWith('posts:')) {
        const postId = payload.data?.id;
        if (postId && (payload.data?.attributes?.url === '[REDACTED]' || !payload.data?.attributes?.url)) {
            try {
                const { getTrackedPost } = await import('../../database/db');
                const post = await getTrackedPost(postId);
                if (post) {
                    payload.data.attributes = payload.data.attributes || {};
                    if (payload.data.attributes.title === '[REDACTED]' || !payload.data.attributes.title) {
                        payload.data.attributes.title = post.title;
                    }
                    payload.data.attributes.url = `https://www.patreon.com/posts/${post.post_id}`;
                }
            } catch {
                // Non-critical fallback
            }
        }
    }

    return payload;
}

/**
 * Detect payloads stored before redaction was scoped to user records —
 * those have the post URL stripped, so replays will announce a dead link.
 */
function hasLegacyRedactedUrl(row: WebhookLogRow): boolean {
    return row.payload?.data?.attributes?.url === '[REDACTED]';
}

interface ReplayOutcome {
    row: WebhookLogRow;
    ok: boolean;
    detail: string;
}

async function replayRow(row: WebhookLogRow): Promise<ReplayOutcome> {
    const eventType = row.event_type as WebhookEventType;

    if (!SUPPORTED_WEBHOOK_EVENTS.has(row.event_type)) {
        return { row, ok: false, detail: 'No handler for this event type' };
    }
    if (!row.payload) {
        return { row, ok: false, detail: 'No payload stored for this row' };
    }

    const payload = await hydrateRedactedPayload(row);
    const caveat = hasLegacyRedactedUrl(row) && (!payload.data?.attributes?.url || payload.data?.attributes?.url === '[REDACTED]')
        ? ' (legacy row — post link was redacted at log time)'
        : '';

    try {
        // Re-dispatch through the normal router; it updates the same
        // webhook_log row (processed/announced) as a live webhook would.
        await routeWebhookEvent(eventType, payload, row.id);

        const refreshed = await getWebhookLogById(row.id);
        const announced = refreshed?.announced ?? false;
        return {
            row,
            ok: true,
            detail: announced
                ? `Replayed${caveat} — announcement sent ✅ (⚠️ dedup/ghost filters bypassed)`
                : `Replayed${caveat} — no announcement produced (check tier mappings) (⚠️ dedup/ghost filters bypassed)`,
        };
    } catch (err) {
        logger.error(`🔁 [REPLAY] Replaying webhook log #${row.id} failed`, err as Error);
        return { row, ok: false, detail: `Handler threw: ${(err as Error).message}` };
    }
}

// ── Main command handler ──────────────────────────────────────────────────────

export async function handleReplayWebhook(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    const action = interaction.options.getString('action') ?? 'view';
    const logId = interaction.options.getInteger('log_id');
    const hours = Math.min(Math.max(interaction.options.getInteger('hours') ?? 24, 1), 168);
    const limit = Math.min(Math.max(interaction.options.getInteger('limit') ?? DEFAULT_BATCH_REPLAY, 1), 50);

    // ── View: list recent webhook_log rows ────────────────────────────────────
    if (action === 'view') {
        const rows = await getRecentWebhookLogs(VIEW_ROW_LIMIT);

        if (rows.length === 0) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(0x888888)
                    .setTitle('📋 Webhook Log')
                    .setDescription('No webhooks logged yet (or the `webhook_log` table is not reachable).')
                    .setTimestamp()],
            });
            return;
        }

        const fields = rows.map(row => ({
            name: `#${row.id} — ${row.event_type}`,
            value: `${formatRowStatus(row)} · ${timeAgoTag(row.received_at)}${row.member_name ? ` · ${row.member_name}` : ''}${row.notes ? `\n> ${row.notes.substring(0, 100)}` : ''}`,
        }));

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`📋 Webhook Log — last ${rows.length} entries`)
                .addFields(...fields.slice(0, VIEW_ROW_LIMIT))
                .setFooter({ text: 'Replay a row with /admin replay-webhook action:replay log_id:<id>' })
                .setTimestamp()],
        });
        return;
    }

    // ── Replay: re-dispatch one specific row ─────────────────────────────────
    if (action === 'replay') {
        if (!logId) {
            await interaction.editReply({
                content: '❌ The `log_id` option is required for `action: replay`. Find ids via `/admin replay-webhook action:view`.',
            });
            return;
        }

        const row = await getWebhookLogById(logId);
        if (!row) {
            await interaction.editReply({
                content: `❌ No webhook_log row found with id **${logId}**.`,
            });
            return;
        }

        const outcome = await replayRow(row);

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(outcome.ok ? 0x2ecc71 : 0xe74c3c)
                .setTitle(`🔁 Replay of webhook log #${row.id}`)
                .setDescription(`**Event:** \`${row.event_type}\`\n**Received:** ${timeAgoTag(row.received_at)}\n**Result:** ${outcome.detail}`)
                .setTimestamp()],
        });
        return;
    }

    // ── Replay-missed: re-dispatch every unannounced webhook in the window ───
    if (action === 'replay-missed') {
        const missed = await getMissedAnnouncements(hours);
        const replayable = missed.filter(row => SUPPORTED_WEBHOOK_EVENTS.has(row.event_type) && row.payload);
        const skippedUnknown = missed.length - replayable.length;

        if (replayable.length === 0) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle('🔁 Replay Missed Webhooks')
                    .setDescription(
                        `No replayable unannounced webhooks in the last **${hours}h**.\n` +
                        (skippedUnknown > 0 ? `(${skippedUnknown} row(s) skipped — no handler for their event type)` : '')
                    )
                    .setTimestamp()],
            });
            return;
        }

        const batch = replayable.slice(0, limit);
        const outcomes: ReplayOutcome[] = [];
        for (const row of batch) {
            outcomes.push(await replayRow(row));
            // Gentle 300ms pacing to avoid Discord API rate limits
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        const okCount = outcomes.filter(o => o.ok).length;
        const fields = outcomes.map(o => ({
            name: `#${o.row.id} — ${o.row.event_type}`,
            value: `${timeAgoTag(o.row.received_at)}\n${o.detail}`,
        }));

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(okCount === outcomes.length ? 0x2ecc71 : 0xff8c00)
                .setTitle('🔁 Replay Missed Webhooks')
                .setDescription(
                    `**${okCount}/${outcomes.length}** replayed successfully from the last **${hours}h**.` +
                    (replayable.length > limit
                        ? `\n⚠️ ${replayable.length - limit} older row(s) remaining (batch limit ${limit}) — run again to continue.`
                        : '') +
                    (skippedUnknown > 0 ? `\nℹ️ ${skippedUnknown} row(s) skipped (no handler for their event type).` : '')
                )
                .addFields(...fields)
                .setTimestamp()],
        });
        return;
    }

    await interaction.editReply({ content: `❌ Unknown action: ${action}` });
}
