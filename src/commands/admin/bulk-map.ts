import {
    ChatInputCommandInteraction,
    ActionRowBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    ComponentType,
} from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getAllTierMappings, upsertTierMapping } from '../../database/db';
import { config } from '../../config';
import { getTierEmoji } from '../../utils/tierRanking';
import { logger } from '../../utils/logger';

/**
 * /admin bulk-map
 * Walk through all unmapped tiers sequentially, prompting for a channel for each.
 */
export async function handleBulkMap(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    const mappings = await getAllTierMappings();
    const tiers = config.tierConfig;

    if (tiers.length === 0) {
        await interaction.reply({
            content: '❌ No tiers configured. Run `/admin sync-tiers` first.',
            ephemeral: true,
        });
        return;
    }

    // Find unmapped tiers
    const unmapped = tiers.filter(tier => {
        const mapping = mappings.find(m => m.tier_id === tier.id);
        return !mapping || !mapping.channel_id;
    });

    if (unmapped.length === 0) {
        await interaction.reply({
            content: '✅ All tiers are already mapped to channels! Use `/admin setup` to change individual mappings.',
            ephemeral: true,
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    let mapped = 0;

    for (let i = 0; i < unmapped.length; i++) {
        const tier = unmapped[i];
        const emoji = getTierEmoji(tier.name);

        const embed = new EmbedBuilder()
            .setTitle(`🔧 Bulk Channel Mapping (${i + 1}/${unmapped.length})`)
            .setColor(0x5865f2)
            .setDescription(`Select a Discord channel for **${emoji} ${tier.name}** tier ($${((tier.cents || 0) / 100).toFixed(2)})`)
            .setFooter({ text: `${unmapped.length - i - 1} tiers remaining after this one` });

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId(`bulk_map_${tier.id}_${Date.now()}`)
            .setPlaceholder(`Select channel for ${tier.name}...`)
            .setChannelTypes(ChannelType.GuildText);

        const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

        const message = i === 0
            ? await interaction.editReply({ embeds: [embed], components: [row] })
            : await interaction.editReply({ embeds: [embed], components: [row] });

        try {
            const channelResponse = await message.awaitMessageComponent({
                componentType: ComponentType.ChannelSelect,
                time: 60_000,
            });

            const selectedChannelId = channelResponse.values[0];

            await upsertTierMapping({
                tier_id: tier.id,
                tier_name: tier.name,
                tier_rank: tier.rank || 0,
                channel_id: selectedChannelId,
            });

            mapped++;
            await channelResponse.update({
                content: `✅ **${tier.name}** → <#${selectedChannelId}>`,
                embeds: [],
                components: [],
            });

            // Brief pause before next tier
            if (i < unmapped.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

        } catch {
            // Timeout — stop the wizard
            await interaction.editReply({
                content: `⏰ Bulk mapping timed out. Mapped **${mapped}/${unmapped.length}** tiers.\nRun \`/admin bulk-map\` again to continue.`,
                embeds: [],
                components: [],
            });
            return;
        }
    }

    const summaryEmbed = new EmbedBuilder()
        .setTitle('✅ Bulk Mapping Complete')
        .setColor(0x00ff00)
        .setDescription(`Successfully mapped **${mapped}** tier(s) to channels.`)
        .setTimestamp();

    await interaction.editReply({ embeds: [summaryEmbed], components: [] });
    logger.info(`🔧 [BULK MAP] Mapped ${mapped} tiers`);
}
