import { client } from '../index';
import { config } from '../config';
import { getAllTrackedMembers } from '../database/db';
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
    digestTimer = setInterval(() => maybeRunDigest(), CHECK_INTERVAL_MS);
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

    // Only run once per week (prevent re-runs on the same Sunday)
    const weekNumber = getWeekNumber(now);
    if (weekNumber === lastDigestWeek) return;
    lastDigestWeek = weekNumber;

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

        // Count activity in the past 7 days
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

        // DM the root admin
        const adminId = config.rootAdminId;
        if (adminId) {
            try {
                const admin = await client.users.fetch(adminId);
                await admin.send({ embeds: [embed] });
                logger.info('📊 [DIGEST] Weekly digest sent to root admin');
            } catch (err) {
                logger.warn(`📊 [DIGEST] Could not DM admin: ${(err as Error).message}`);
            }
        }
    } catch (err) {
        logger.error(`📊 [DIGEST] Failed to generate digest: ${(err as Error).message}`);
    }
}
