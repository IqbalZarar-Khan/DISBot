import { client } from '../index';
import { config } from '../config';
import { getAllTrackedMembers, getConfig, setConfig } from '../database/db';
import { getWeeklyCancellations, getWeeklyTierChanges } from '../database/webhookCache';
import { logger } from './logger';
import { EmbedBuilder } from 'discord.js';

let digestTimer: NodeJS.Timeout | null = null;

// Check every hour whether it's Sunday
const CHECK_INTERVAL_MS = 60 * 60_000;
let lastDigestWeek = -1;

/**
 * Start the weekly digest scheduler.
 * Every Sunday at ~noon, DMs the root admin a summary of the week's activity.
 */
export function startWeeklyDigest(): void {
    logger.info('📊 [DIGEST] Weekly digest scheduler started');
    // Run an initial check 30s after boot (handles restart on Sunday)
    setTimeout(() => maybeRunDigest().catch(err => logger.error('📊 [DIGEST] Initial digest check failed', err as Error)), 30_000);
    digestTimer = setInterval(() => maybeRunDigest().catch(err => logger.error('📊 [DIGEST] Digest check failed', err as Error)), CHECK_INTERVAL_MS);
}

export function stopWeeklyDigest(): void {
    if (digestTimer) {
        clearInterval(digestTimer);
        digestTimer = null;
    }
}

async function maybeRunDigest(): Promise<void> {
    const now = new Date();

    // Only run on Sunday (day 0)
    if (now.getDay() !== 0) return;

    // Load persisted last digest week from DB to survive ephemeral container restarts
    try {
        const savedWeek = await getConfig('last_digest_week');
        if (savedWeek) {
            lastDigestWeek = parseInt(savedWeek, 10);
        }
    } catch {
        // Fall back to memory
    }

    // Only run once per week (prevent re-runs on the same Sunday)
    const weekNumber = getWeekNumber(now);
    if (weekNumber === lastDigestWeek) return;
    lastDigestWeek = weekNumber;

    // Persist week number to DB
    await setConfig('last_digest_week', String(weekNumber)).catch(() => {});

    await sendWeeklyDigest();
}

function getWeekNumber(d: Date): number {
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = d.getTime() - start.getTime();
    return Math.ceil(diff / (7 * 24 * 60 * 60_000));
}

async function sendWeeklyDigest(): Promise<void> {
    try {
        const members = await getAllTrackedMembers();
        const now = Date.now();
        const oneWeekAgo = now - 7 * 24 * 60 * 60_000;

        // ── Basic counts from tracked_members ────────────────────────────
        let newPatrons = 0;
        let updatedPatrons = 0;
        let totalActive = members.length;

        for (const member of members) {
            if (member.joined_at && member.joined_at > oneWeekAgo) {
                newPatrons++;
            }
            if (member.updated_at && member.updated_at > oneWeekAgo && member.joined_at !== member.updated_at) {
                updatedPatrons++;
            }
        }

        // ── Cancellations from webhook_log ───────────────────────────────
        const cancellations = await getWeeklyCancellations(7);
        const cancelCount = cancellations.length;

        let cancelList = 'None this week 🎉';
        if (cancelCount > 0) {
            const names = cancellations.map(c => `• ${c.memberName}`);
            cancelList = names.length <= 15
                ? names.join('\n')
                : [...names.slice(0, 15), `_...and ${names.length - 15} more_`].join('\n');
        }

        // ── Tier changes from webhook_log ────────────────────────────────
        const tierChanges = await getWeeklyTierChanges(7);
        const changeCount = tierChanges.length;

        let changeList = 'None this week';
        if (changeCount > 0) {
            const entries = tierChanges.map(tc =>
                `• ${tc.memberName}: ${tc.oldTier} → **${tc.newTier}**`
            );
            changeList = entries.length <= 15
                ? entries.join('\n')
                : [...entries.slice(0, 15), `_...and ${entries.length - 15} more_`].join('\n');
        }

        // ── Build the embed ──────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setTitle('📊 Weekly Patron Digest')
            .setColor(0x5865F2)
            .setDescription(`Here's your weekly community summary for the past 7 days:`)
            .addFields(
                { name: '👤 Total Active Patrons', value: `${totalActive}`, inline: true },
                { name: '🆕 New Patrons', value: `${newPatrons}`, inline: true },
                { name: '🔄 Tier Changes', value: `${updatedPatrons}`, inline: true },
            )
            .setFooter({ text: 'DISBot Weekly Digest • Sent every Sunday' })
            .setTimestamp();

        // Cancellation details embed
        const cancelEmbed = new EmbedBuilder()
            .setColor(0xFF4444)
            .setTitle(`❌ Cancellations (${cancelCount})`)
            .setDescription(cancelList);

        // Tier change details embed
        const changeEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle(`🔀 Membership Changes (${changeCount})`)
            .setDescription(changeList);

        // DM the root admin
        const adminId = config.rootAdminId;
        if (adminId) {
            try {
                const admin = await client.users.fetch(adminId);
                await admin.send({ embeds: [embed, cancelEmbed, changeEmbed] });
                logger.info('📊 [DIGEST] Weekly digest sent to root admin');
            } catch (err) {
                logger.warn(`📊 [DIGEST] Could not DM admin: ${(err as Error).message}`);
            }
        }
    } catch (err) {
        logger.error(`📊 [DIGEST] Failed to generate digest: ${(err as Error).message}`);
    }
}
