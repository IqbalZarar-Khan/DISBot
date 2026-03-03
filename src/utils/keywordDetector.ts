import { Client, Events, Message } from 'discord.js';
import { config } from '../config';
import { getConfig } from '../database/db';
import { logger } from './logger';

/**
 * Keyword Detection + Prefix Commands
 *
 * When Message Content Intent is enabled, this module:
 * 1. Detects configurable keywords and auto-replies
 * 2. Supports prefix commands (e.g., !status, !help) as slash-command fallbacks
 *
 * Activate by setting `enable_keyword_detection: true` in bot_config.
 */

// Default keyword responses (can be customized via bot_config)
const DEFAULT_KEYWORDS: Record<string, string> = {
    'when is the next chapter': '📅 Check the pinned messages for the latest release schedule!',
    'next release': '📅 Check the pinned messages for the latest release schedule!',
    'next update': '📅 Check the pinned messages for the latest release schedule!',
    'when is the next episode': '📅 Check the pinned messages for the latest release schedule!',
    'new chapter when': '📅 Check the pinned messages for the latest release schedule!',
    'release date': '📅 Check the pinned messages for the latest release schedule!',
    'patreon link': '🔗 Support us on Patreon: Check the server description for the link!',
    'how to support': '🔗 Check the server description for our Patreon link!',
};

// Prefix commands (fallback for slash commands)
const PREFIX = '!';

/**
 * Register message content handlers on the Discord client.
 * Only works if Message Content Intent is enabled.
 */
export function registerKeywordDetection(client: Client): void {
    client.on(Events.MessageCreate, async (message: Message) => {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;

        const content = message.content.toLowerCase().trim();

        // ── Prefix Commands (admin only) ─────────────────────────
        if (content.startsWith(PREFIX)) {
            const isAdmin = message.author.id === config.rootAdminId;
            const cmd = content.slice(PREFIX.length).split(/\s+/)[0];

            switch (cmd) {
                case 'status':
                    if (isAdmin) {
                        await message.reply('✅ Bot is online! Use `/admin status` for full details.');
                    }
                    break;
                case 'help':
                    await message.reply(
                        '**Available prefix commands:**\n' +
                        '`!status` — Quick status check (admin)\n' +
                        '`!help` — Show this help message\n\n' +
                        '*For full functionality, use `/admin` slash commands.*'
                    );
                    break;
            }
            return;
        }

        // ── Keyword Detection ────────────────────────────────────
        try {
            const enabled = await getConfig('enable_keyword_detection');
            if (enabled !== 'true') return;
        } catch {
            return; // DB unreachable — skip
        }

        // Check for keyword matches
        for (const [keyword, response] of Object.entries(DEFAULT_KEYWORDS)) {
            if (content.includes(keyword)) {
                try {
                    // Cooldown: don't reply to the same user more than once per 5 minutes
                    const cooldownKey = `kw_${message.author.id}_${keyword}`;
                    if (keywordCooldowns.has(cooldownKey)) continue;

                    // Check for custom response from database
                    const customResponse = await getConfig(`keyword_${keyword.replace(/\s+/g, '_')}`);
                    await message.reply(customResponse || response);

                    // Set cooldown (5 minutes)
                    keywordCooldowns.set(cooldownKey, true);
                    setTimeout(() => keywordCooldowns.delete(cooldownKey), 5 * 60_000);

                    logger.info(`🔑 [KEYWORD] Replied to "${keyword}" from ${message.author.username}`);
                    break; // Only one reply per message
                } catch (err) {
                    logger.warn(`🔑 [KEYWORD] Error: ${(err as Error).message}`);
                }
            }
        }
    });

    logger.info('🔑 [KEYWORD] Message content handler registered');
}

// Simple in-memory cooldown map
const keywordCooldowns = new Map<string, boolean>();
