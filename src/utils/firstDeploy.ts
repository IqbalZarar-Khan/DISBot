/**
 * First Deployment — Guided Welcome DM
 *
 * On the bot's first-ever successful cloud deployment, sends an
 * interactive DM to ROOT_ADMIN_ID with a welcome message and
 * guided setup buttons for completing the post-deployment checklist.
 */

import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getConfig, setConfig } from '../database/db';
import { config } from '../config';
import { logger } from './logger';

export async function sendFirstDeployDM(client: Client): Promise<void> {
    try {
        // Check if we've already sent the welcome DM
        const alreadySent = await getConfig('first_deploy_dm_sent');
        if (alreadySent === 'true') return;

        // Mark as sent immediately to prevent duplicates
        await setConfig('first_deploy_dm_sent', 'true');

        const admin = await client.users.fetch(config.rootAdminId);

        const embed = new EmbedBuilder()
            .setTitle('🎉 DISBot is LIVE!')
            .setColor(0x5865F2)
            .setDescription(
                'Your bot just completed its **first successful deployment**! ' +
                'Here\'s a quick checklist to finish setup:'
            )
            .addFields(
                {
                    name: '1️⃣ Map Tiers to Channels',
                    value: 'Run `/admin bulk-map` to connect your Patreon tiers to Discord channels.',
                },
                {
                    name: '2️⃣ Test a Post Alert',
                    value: 'Run `/admin test-alert` to send a test notification to your channels.',
                },
                {
                    name: '3️⃣ Check Bot Status',
                    value: 'Run `/admin status` to verify API connections and database health.',
                },
                {
                    name: '4️⃣ Configure Webhooks',
                    value: 'Ensure Patreon webhooks point to your deployment URL + `/webhooks/patreon`.',
                },
            )
            .setFooter({ text: 'You won\'t see this message again. Run /admin status anytime to check health.' });

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('first_deploy_docs')
                    .setLabel('📖 Full Setup Guide')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://github.com/IqbalZarar-Khan/DISBot/blob/main/SETUP.md'),
                new ButtonBuilder()
                    .setCustomId('first_deploy_status')
                    .setLabel('✅ I\'m All Set!')
                    .setStyle(ButtonStyle.Success),
            );

        await admin.send({ embeds: [embed], components: [row] });
        logger.info('🎉 [FIRST DEPLOY] Welcome DM sent to admin');

        // Handle button clicks
        const collector = (await admin.createDM()).createMessageComponentCollector({
            filter: (i: any) => i.customId === 'first_deploy_status',
            max: 1,
            time: 86400000, // 24 hours
        });

        collector.on('collect', async (interaction: any) => {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Setup Complete!')
                        .setColor(0x43b581)
                        .setDescription('Awesome! Your bot is fully configured. Run `/admin status` anytime to check health.')
                ],
                components: [],
            });
        });

    } catch (err) {
        // Don't crash if DM fails (e.g., admin has DMs disabled)
        logger.warn(`⚠️ [FIRST DEPLOY] Could not send welcome DM: ${(err as Error).message}`);
    }
}
