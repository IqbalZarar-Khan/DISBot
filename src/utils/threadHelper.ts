import { TextChannel, ThreadAutoArchiveDuration } from 'discord.js';
import { logger } from './logger';
import { getConfig } from '../database/db';

/**
 * Check if thread creation is enabled for post alerts.
 */
export async function isThreadEnabled(): Promise<boolean> {
    const setting = await getConfig('enable_threads');
    return setting === 'true';
}

/**
 * Create a discussion thread under a post notification.
 * @param channel - The TextChannel the alert was sent to
 * @param messageId - The ID of the alert message (thread parent)
 * @param title - The post title for the thread name
 * @returns The created thread, or null if threads are disabled/failed
 */
export async function createPostThread(
    channel: TextChannel,
    messageId: string,
    title: string
): Promise<any | null> {
    try {
        const enabled = await isThreadEnabled();
        if (!enabled) return null;

        const threadName = `💬 ${title}`.substring(0, 100); // Discord max 100 chars

        const thread = await channel.threads.create({
            startMessage: messageId,
            name: threadName,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Discussion thread for Patreon post: ${title}`,
        });

        logger.info(`🧵 Created discussion thread: "${threadName}" in #${channel.name}`);
        return thread;
    } catch (error) {
        logger.warn('Failed to create discussion thread', error as Error);
        return null;
    }
}
