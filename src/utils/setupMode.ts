/**
 * Auto-Capture Discord IDs — "Setup Mode"
 *
 * On first boot (when GUILD_ID or ROOT_ADMIN_ID is not set),
 * the bot enters "Setup Mode" and listens for `!claim` in any channel.
 * When a server admin types `!claim`, the bot auto-captures:
 * - Guild ID (from the message's guild)
 * - Admin User ID (from the message author)
 * - Log Channel ID (from the channel where !claim was sent)
 *
 * Saves them to the database and confirms with an embed.
 */

import { Client, Message, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { setConfig } from '../database/db';
import { logger } from './logger';

let claimed = false;

export function registerSetupMode(client: Client): void {
    const guildId = process.env.GUILD_ID;
    const adminId = process.env.ROOT_ADMIN_ID;

    // Only activate if IDs are missing
    if (guildId && adminId) return;

    console.log('🔧 [SETUP MODE] Guild/Admin ID not configured — listening for !claim');

    client.on('messageCreate', async (message: Message) => {
        if (claimed) return;
        if (message.author.bot) return;
        if (!message.guild) return;
        if (message.content.trim().toLowerCase() !== '!claim') return;

        // Only allow server admins to claim
        const member = message.member;
        if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
            await message.reply('❌ Only server administrators can run `!claim`.');
            return;
        }

        claimed = true;

        const capturedGuildId = message.guild.id;
        const capturedAdminId = message.author.id;
        const capturedChannelId = message.channel.id;

        try {
            // Save to database
            await setConfig('guild_id', capturedGuildId);
            await setConfig('root_admin_id', capturedAdminId);
            await setConfig('log_channel_id', capturedChannelId);

            logger.info(`🔧 [SETUP] Claimed by ${message.author.tag} in ${message.guild.name}`);

            const embed = new EmbedBuilder()
                .setTitle('✅ Bot Claimed Successfully!')
                .setColor(0x43b581)
                .setDescription('I\'ve captured your server details. No Developer Mode needed!')
                .addFields(
                    { name: '🏠 Server ID', value: `\`${capturedGuildId}\``, inline: true },
                    { name: '👤 Admin ID', value: `\`${capturedAdminId}\``, inline: true },
                    { name: '📢 Log Channel', value: `<#${capturedChannelId}>`, inline: true },
                )
                .setFooter({ text: 'Add these to your .env for persistence, or they\'ll be loaded from the database on next boot.' });

            await message.reply({ embeds: [embed] });
        } catch (err) {
            claimed = false;
            await message.reply(`❌ Failed to save: ${(err as Error).message}`);
        }
    });
}
