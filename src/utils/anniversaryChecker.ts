import { client } from '../index';
import { config } from '../config';
import { getAllTrackedMembers, getCustomMessage } from '../database/db';
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
    setTimeout(() => checkAnniversaries(), 60_000);
    anniversaryTimer = setInterval(() => checkAnniversaries(), CHECK_INTERVAL_MS);
}

export function stopAnniversaryChecker(): void {
    if (anniversaryTimer) {
        clearInterval(anniversaryTimer);
        anniversaryTimer = null;
    }
}

async function checkAnniversaries(): Promise<void> {
    try {
        const members = await getAllTrackedMembers();
        const now = new Date();
        const today = `${now.getMonth() + 1}-${now.getDate()}`; // "M-D" format

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
