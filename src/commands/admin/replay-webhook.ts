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

// Safety cap: replaying sends real Discord messages — keep batches small
const MAX_BATCH_REPLAY = 10;

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
 * Restore redacted patron names in a stored payload before replay.
 * full_name/email etc. are stripped by PII redaction at log time; the
 * member_name column still holds the display name, so we patch it back in.
 * Emails and Discord IDs stay redacted (not recoverable — by design).
 */
function hydrateRedactedNames(row: WebhookLogRow): any {
    if (!row.payload) return null;

    const payload = JSON.parse(JSON.stringify(row.payload));
    if (!row.member_name || row.member_name === 'Unknown') return payload;

    // members:create / members:update / members:delete → name on data.attributes
    if (row.event_type.startsWith('members:') && !row.event_type.includes('pledge')) {
        if (payload.data?.attributes) {
            payload.data.attributes.full_name = row.member_name;
        }
        return payload;
    }

    // members:pledge:* → name lives on the user record inside included[]
    const included = payload.included || [];
    const patronRef = payload.data?.relationships?.patron?.data;
    const userRecord = patronRef
        ? included.find((item: any) => item.type === 'user' && item.id === patronRef.id)
        : included.find((item: any) => item.type === 'user');
    if (userRecord?.attributes) {
        userRecord.attributes.full_name = row.member_name;
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

    const payload = hydrateRedactedNames(row);
    const caveat = hasLegacyRedactedUrl(row) ? ' (legacy row — post link was redacted at log time)' : '';

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
                ? `Replayed${caveat} — announcement sent ✅`
                : `Replayed${caveat} — no announcement produced (check tier mappings)`,
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

        const batch = replayable.slice(0, MAX_BATCH_REPLAY);
        const outcomes: ReplayOutcome[] = [];
        for (const row of batch) {
            outcomes.push(await replayRow(row));
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
                    (replayable.length > MAX_BATCH_REPLAY
                        ? `\n⚠️ ${replayable.length - MAX_BATCH_REPLAY} older row(s) not replayed (batch cap ${MAX_BATCH_REPLAY}) — run again after reviewing.`
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
