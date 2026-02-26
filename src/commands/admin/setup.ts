import {
    ChatInputCommandInteraction,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ComponentType,
    EmbedBuilder,
    ChannelType,
} from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getAllTierMappings, upsertTierMapping } from '../../database/db';
import { config } from '../../config';
import { getTierEmoji } from '../../utils/tierRanking';
import { logger } from '../../utils/logger';

/**
 * /admin setup
 * Interactive tier-to-channel mapping using Discord dropdown menus.
 * Step 1: Select a tier from a dropdown
 * Step 2: Select a channel from a dropdown
 */
export async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    // Get available tiers from config
    const tiers = config.tierConfig;

    if (!tiers || tiers.length === 0) {
        await interaction.reply({
            content: '❌ No tiers configured. Run `/admin sync-tiers` first to fetch tiers from Patreon.',
            ephemeral: true,
        });
        return;
    }

    // Get existing mappings for display
    const existingMappings = await getAllTierMappings();

    // Build tier select menu
    const tierOptions = tiers.map(tier => {
        const emoji = getTierEmoji(tier.name);
        const mapped = existingMappings.find(m => m.tier_name === tier.name);
        const status = mapped?.channel_id ? '✅ Mapped' : '⚠️ Unmapped';
        return {
            label: tier.name,
            description: `$${((tier.cents || 0) / 100).toFixed(2)}/mo • Rank ${tier.rank} • ${status}`,
            value: `${tier.id}::${tier.name}::${tier.rank}`,
            emoji: emoji,
        };
    });

    const tierSelect = new StringSelectMenuBuilder()
        .setCustomId('setup_tier_select')
        .setPlaceholder('Select a Patreon tier to map...')
        .addOptions(tierOptions);

    const tierRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tierSelect);

    // Show current mappings in the embed
    const embed = new EmbedBuilder()
        .setTitle('🔧 Interactive Tier Setup')
        .setColor(0x5865f2)
        .setDescription('**Step 1/2** — Select a tier to map to a Discord channel.')
        .setTimestamp();

    if (existingMappings.length > 0) {
        const mappingList = existingMappings
            .map(m => `${getTierEmoji(m.tier_name)} **${m.tier_name}** → ${m.channel_id ? `<#${m.channel_id}>` : '⚠️ *unmapped*'}`)
            .join('\n');
        embed.addFields({ name: 'Current Mappings', value: mappingList });
    }

    const tierMsg = await interaction.reply({
        embeds: [embed],
        components: [tierRow],
        ephemeral: true,
        fetchReply: true,
    });

    // Wait for tier selection (60 seconds)
    try {
        const tierInteraction = await tierMsg.awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 60_000,
            filter: (i) => i.user.id === interaction.user.id,
        });

        const [tierId, tierName, tierRankStr] = tierInteraction.values[0].split('::');
        const tierRank = parseInt(tierRankStr, 10);

        // Step 2: Channel selection
        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('setup_channel_select')
            .setPlaceholder(`Select a channel for ${tierName}...`)
            .setChannelTypes(ChannelType.GuildText);

        const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

        const step2Embed = new EmbedBuilder()
            .setTitle('🔧 Interactive Tier Setup')
            .setColor(0x5865f2)
            .setDescription(`**Step 2/2** — Select a Discord channel for **${getTierEmoji(tierName)} ${tierName}**`)
            .setTimestamp();

        await tierInteraction.update({
            embeds: [step2Embed],
            components: [channelRow],
        });

        // Wait for channel selection (60 seconds)
        const channelInteraction = await tierMsg.awaitMessageComponent({
            componentType: ComponentType.ChannelSelect,
            time: 60_000,
            filter: (i) => i.user.id === interaction.user.id,
        });

        const channelId = channelInteraction.values[0];

        // Save mapping
        await upsertTierMapping({
            tier_id: tierId,
            tier_name: tierName,
            tier_rank: tierRank,
            channel_id: channelId,
        });

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Tier Mapped Successfully')
            .setColor(0x00ff00)
            .setDescription(`${getTierEmoji(tierName)} **${tierName}** → <#${channelId}>\n\nAll alerts for this tier will now be sent to that channel.\n\nRun \`/admin setup\` again to map more tiers.`)
            .setTimestamp();

        await channelInteraction.update({
            embeds: [successEmbed],
            components: [],
        });

        logger.info(`🔧 [SETUP] Mapped ${tierName} → #${channelId}`);

    } catch (error: any) {
        if (error.code === 'InteractionCollectorError') {
            await interaction.editReply({
                content: '⏰ Setup timed out. Run `/admin setup` again when ready.',
                embeds: [],
                components: [],
            });
        } else {
            throw error;
        }
    }
}
