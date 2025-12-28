import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getAllTierMappings } from '../../database/db';
import axios from 'axios';
import { config } from '../../config';

export async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    // Check admin permission
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    try {
        // Check Patreon API connection
        let patreonStatus = '🔴 Error';
        try {
            const response = await axios.get(
                `https://www.patreon.com/api/oauth2/v2/campaigns/${config.patreonCampaignId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${config.patreonAccessToken}`
                    },
                    timeout: 5000
                }
            );

            if (response.status === 200) {
                patreonStatus = '🟢 Connected';
            }
        } catch (error) {
            patreonStatus = '🔴 Error - Check token';
        }

        // Get tier mappings
        const tierMappings = await getAllTierMappings();
        let tierMappingText = '';

        if (tierMappings.length === 0) {
            tierMappingText = '*No tier mappings configured yet.*\nUse `/admin set-channel` to configure.';
        } else {
            tierMappingText = tierMappings
                .map(mapping => `**${mapping.tier_name}** (Rank ${mapping.tier_rank}) ➡️ <#${mapping.channel_id}>`)
                .join('\n');
        }

        // Create status embed
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Status')
            .setColor(0x5865f2)
            .addFields(
                { name: 'Patreon API', value: patreonStatus, inline: true },
                { name: 'Webhooks', value: '🟢 Listening', inline: true },
                { name: 'Database', value: '🟢 Connected', inline: true },
                { name: '\u200B', value: '\u200B' }, // Spacer
                { name: '📊 Tier Mappings', value: tierMappingText }
            )
            .setTimestamp()
            .setFooter({ text: `Admin: ${interaction.user.tag}` });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        await interaction.editReply({
            content: '❌ Failed to fetch status. Please check the logs.'
        });
        throw error;
    }
}
