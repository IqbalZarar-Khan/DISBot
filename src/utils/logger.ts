import { Client, TextChannel, EmbedBuilder } from 'discord.js';

export enum LogLevel {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

let discordClient: Client | null = null;
let logChannel: TextChannel | null = null;

/**
 * Initialize logger with Discord client
 */
export async function initLogger(client: Client, channelId?: string): Promise<void> {
    discordClient = client;
    if (channelId) {
        try {
            logChannel = await client.channels.fetch(channelId) as TextChannel;
        } catch (err) {
            console.error('Failed to fetch log channel:', err);
        }
    }
}

/**
 * Log a message to console and optionally to Discord
 */
export async function log(level: LogLevel, message: string, error?: Error): Promise<void> {
    const timestamp = new Date().toISOString();
    const prefix = getLogPrefix(level);

    // Console log
    console.log(`[${timestamp}] ${prefix} ${message}`);
    if (error) {
        console.error(error);
    }

    // Discord log (only for WARN and ERROR)
    if ((level === LogLevel.WARN || level === LogLevel.ERROR) && logChannel) {
        try {
            const embed = new EmbedBuilder()
                .setTitle(`${getLogEmoji(level)} ${level}`)
                    .setDescription(message)
                    .setColor(getLogColor(level))
                    .setTimestamp();

                if (error) {
                    embed.addFields({
                        name: 'Error Details',
                        value: `\`\`\`${error.message}\`\`\``
                    });

                    if (error.stack) {
                        embed.addFields({
                            name: 'Stack Trace',
                            value: `\`\`\`${error.stack.substring(0, 1000)}\`\`\``
                        });
                    }
                }
                await logChannel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Failed to send log to Discord:', err);
        }
    }
}

/**
 * Convenience methods
 */
export const logger = {
    info: (message: string) => log(LogLevel.INFO, message),
    warn: (message: string, error?: Error) => log(LogLevel.WARN, message, error),
    error: (message: string, error?: Error) => log(LogLevel.ERROR, message, error)
};

function getLogPrefix(level: LogLevel): string {
    switch (level) {
        case LogLevel.INFO:
            return '✅';
        case LogLevel.WARN:
            return '⚠️';
        case LogLevel.ERROR:
            return '❌';
    }
}

function getLogEmoji(level: LogLevel): string {
    switch (level) {
        case LogLevel.INFO:
            return '✅';
        case LogLevel.WARN:
            return '⚠️';
        case LogLevel.ERROR:
            return '🚨';
    }
}

function getLogColor(level: LogLevel): number {
    switch (level) {
        case LogLevel.INFO:
            return 0x00ff00; // Green
        case LogLevel.WARN:
            return 0xffaa00; // Orange
        case LogLevel.ERROR:
            return 0xff0000; // Red
    }
}
