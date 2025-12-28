import { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getTierMappingByName } from '../../database/db';
import { createTestEmbed } from '../../utils/embedBuilder';
import { client } from '../../index';

export async function handleTestAlert(interaction: ChatInputCommandInteraction): Promise<void> {
    // Check admin permission
    if (!await checkAdminPermission(interaction)) return;

    const tierName = interaction.options.getString('tier_name', true);

    try {
        // Get tier mapping
        const mapping = await getTierMappingByName(tierName);

        if (!mapping) {
            await interaction.reply({
                content: `❌ **Tier Not Found**\n\nNo channel mapping found for tier "${tierName}".\n\nUse \`/admin set-channel\` to configure tier mappings first.`,
                ephemeral: true
            });
            return;
        }

        // Get channel
        const channel = await client.channels.fetch(mapping.channel_id) as TextChannel;

        if (!channel) {
            await interaction.reply({
                content: `❌ **Channel Not Found**\n\nCould not find channel <#${mapping.channel_id}>.\n\nPlease update the tier mapping.`,
                ephemeral: true
            });
            return;
        }

        // Create and send test embed
        const embed = createTestEmbed(tierName);
        await channel.send({ embeds: [embed] });

        await interaction.reply({
            content: `✅ **Test Alert Sent**\n\nA test alert has been sent to ${channel}.\n\nPlease check the channel to verify formatting and permissions.`,
            ephemeral: true
        });

    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to send test alert. Please check the logs and bot permissions.',
            ephemeral: true
        });
        throw error;
    }
}
