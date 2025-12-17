import { ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { upsertTierMapping } from '../../database/db';
import { getTierRank } from '../../utils/tierRanking';
import { config } from '../../config';

export async function handleSetChannel(interaction: ChatInputCommandInteraction): Promise<void> {
    // Check admin permission
    if (!await checkAdminPermission(interaction)) return;

    const tierName = interaction.options.getString('tier_name', true);
    const channel = interaction.options.getChannel('channel', true);

    // Validate channel type
    if (channel.type !== ChannelType.GuildText) {
        await interaction.reply({
            content: '❌ Please select a text channel.',
            ephemeral: true
        });
        return;
    }

    try {
        // Get tier rank
        const tierRank = getTierRank(tierName);

        // Create tier mapping
        const mapping = {
            tier_id: `tier_${tierName.toLowerCase()}`,
            tier_name: tierName,
            tier_rank: tierRank,
            channel_id: channel.id
        };

        // Save to database
        upsertTierMapping(mapping, config.databasePath);

        await interaction.reply({
            content: `✅ **Tier Mapping Updated**\n\n**${tierName}** tier is now mapped to ${channel}.\n\nAll alerts for this tier will be sent to this channel.`,
            ephemeral: true
        });

    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to set channel mapping. Please check the logs.',
            ephemeral: true
        });
        throw error;
    }
}
