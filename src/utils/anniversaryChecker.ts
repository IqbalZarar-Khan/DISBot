import { client } from '../index';
import { config } from '../config';
import { getAllTrackedMembers, getCustomMessage, getConfig, setConfig } from '../database/db';
import { logger } from './logger';
import { EmbedBuilder, TextChannel } from 'discord.js';

let anniversaryTimer: NodeJS.Timeout | null = null;

// Check once per day (24 hours)
const CHECK_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * Start the daily anniversary checker.
 * Runs once a day to detect 1-year and 2-year pledge anniversaries.
 */
export function startAnniversaryChecker(): void {
    logger.info('🎂 [ANNIVERSARY] Daily checker started');

    // Run first check 60s after boot (give DB time to initialize)
    setTimeout(() => checkAnniversaries().catch(err => logger.error('🎂 [ANNIVERSARY] Check failed', err as Error)), 60_000);
    anniversaryTimer = setInterval(() => checkAnniversaries().catch(err => logger.error('🎂 [ANNIVERSARY] Check failed', err as Error)), CHECK_INTERVAL_MS);
}

export function stopAnniversaryChecker(): void {
    if (anniversaryTimer) {
        clearInterval(anniversaryTimer);
        anniversaryTimer = null;
    }
}

async function checkAnniversaries(): Promise<void> {
    try {
        const now = new Date();
        const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`; // "YYYY-M-D" format
        const today = `${now.getMonth() + 1}-${now.getDate()}`; // "M-D" format

        // Check if we already checked today (survives restarts)
        const lastCheckDate = await getConfig('last_anniversary_check_date').catch(() => null);
        if (lastCheckDate === dateKey) {
            logger.info('🎂 [ANNIVERSARY] Already checked today — skipping');
            return;
        }

        const members = await getAllTrackedMembers();

        for (const member of members) {
            if (!member.joined_at) continue;

            const joinDate = new Date(member.joined_at);
            const joinDay = `${joinDate.getMonth() + 1}-${joinDate.getDate()}`;

            if (joinDay !== today) continue;

            const yearsAgo = now.getFullYear() - joinDate.getFullYear();

            if (yearsAgo === 1 || yearsAgo === 2) {
                await sendAnniversaryMessage(member.full_name, yearsAgo);
            }
        }

        // Persist completion date
        await setConfig('last_anniversary_check_date', dateKey).catch(() => {});
    } catch (err) {
        logger.warn(`🎂 [ANNIVERSARY] Check failed: ${(err as Error).message}`);
    }
}

async function sendAnniversaryMessage(name: string, years: number): Promise<void> {
    const template = await getCustomMessage('anniversary');
    const defaultMsg = `🎉🎂 **Happy ${years}-Year Anniversary, ${name}!** 🎂🎉\n\nThank you for ${years} incredible year${years > 1 ? 's' : ''} of support! You're amazing! 💙`;
    const message = template
        ? template.replace('{user}', name).replace('{years}', String(years))
        : defaultMsg;

    // Send to log channel
    const logChannelId = config.logChannelId;
    if (logChannelId) {
        try {
            const channel = await client.channels.fetch(logChannelId) as TextChannel;
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle(`🎂 ${years}-Year Pledge Anniversary!`)
                    .setDescription(message)
                    .setColor(0xFFD700)
                    .setTimestamp();

                await channel.send({ embeds: [embed] });
                logger.info(`🎂 [ANNIVERSARY] Celebrated ${name}'s ${years}-year anniversary`);
            }
        } catch (err) {
            logger.warn(`🎂 [ANNIVERSARY] Failed to send: ${(err as Error).message}`);
        }
    }
}
