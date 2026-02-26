import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import axios from 'axios';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { config, TierDefinition } from '../../config';
import { upsertTierMapping, getAllTierMappings } from '../../database/db';
import { logger } from '../../utils/logger';
import { tierIdMap, tierRankings, centsMap } from '../../utils/tierRanking';

/**
 * /admin sync-tiers
 * Fetches tiers from the Patreon API and synchronizes them into the database
 * and the in-memory tier maps — no restart required.
 */
export async function handleSyncTiers(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    try {
        if (!config.patreonAccessToken || !config.patreonCampaignId) {
            await interaction.editReply({
                content: '❌ Missing `PATREON_ACCESS_TOKEN` or `PATREON_CAMPAIGN_ID` in environment.'
            });
            return;
        }

        // Fetch campaign data with tiers from Patreon API v2
        const res = await axios.get(
            `https://www.patreon.com/api/oauth2/v2/campaigns/${config.patreonCampaignId}`,
            {
                headers: { Authorization: `Bearer ${config.patreonAccessToken}` },
                params: {
                    'include': 'tiers',
                    'fields[tier]': 'title,amount_cents,patron_count,published',
                },
            }
        );

        const included = res.data.included || [];
        const tiers = included.filter((item: any) => item.type === 'tier' && item.attributes?.published);

        if (tiers.length === 0) {
            await interaction.editReply({ content: '⚠️ No published tiers found on your Patreon campaign.' });
            return;
        }

        // Sort by price descending (highest = highest rank)
        tiers.sort((a: any, b: any) => (b.attributes.amount_cents || 0) - (a.attributes.amount_cents || 0));

        // Auto-assign ranks: highest price → rank 100, evenly spaced
        const step = tiers.length > 1 ? Math.floor(100 / (tiers.length - 1)) : 100;
        const syncedTiers: TierDefinition[] = [];

        for (let i = 0; i < tiers.length; i++) {
            const tier = tiers[i];
            const name = tier.attributes.title;
            const id = tier.id;
            const rank = tiers.length === 1 ? 100 : 100 - (i * step);
            const cents = tier.attributes.amount_cents || 0;

            const tierDef: TierDefinition = { name, id, rank, cents };
            syncedTiers.push(tierDef);

            // Update in-memory maps (live, no restart)
            tierIdMap[id] = name;
            tierRankings[name] = rank;
            if (cents > 0) centsMap[cents] = name;

            // Preserve existing channel mappings
            const existingMappings = await getAllTierMappings();
            const existing = existingMappings.find(m => m.tier_name === name || m.tier_id === id);

            await upsertTierMapping({
                tier_id: id,
                tier_name: name,
                tier_rank: rank,
                channel_id: existing?.channel_id || '',  // keep existing channel, or blank
            });
        }

        // Also update config.tierConfig in memory
        config.tierConfig.length = 0;
        config.tierConfig.push(...syncedTiers);

        // Build response embed
        const embed = new EmbedBuilder()
            .setTitle('✅ Tiers Synchronized')
            .setColor(0x00ff00)
            .setDescription(`Fetched **${syncedTiers.length}** tier(s) from Patreon and updated the database.\nThe in-memory tier maps are now live — **no restart needed**.`)
            .setTimestamp();

        const tierList = syncedTiers.map((t, i) =>
            `${i + 1}. **${t.name}** — $${((t.cents || 0) / 100).toFixed(2)}/mo (rank ${t.rank}, ID: \`${t.id}\`)`
        ).join('\n');

        embed.addFields({ name: 'Synced Tiers', value: tierList || 'None' });

        // Check for unmapped tiers
        const allMappings = await getAllTierMappings();
        const unmappedNames = syncedTiers
            .filter(t => !allMappings.find(m => m.tier_name === t.name && m.channel_id))
            .map(t => t.name);

        if (unmappedNames.length > 0) {
            embed.addFields({
                name: '⚠️ Unmapped Tiers',
                value: `The following tiers need a Discord channel:\n${unmappedNames.map(n => `• ${n}`).join('\n')}\n\nUse \`/admin setup\` or \`/admin set-channel\` to map them.`
            });
        }

        await interaction.editReply({ embeds: [embed] });
        logger.info(`🔄 [SYNC] Synchronized ${syncedTiers.length} tier(s) from Patreon API`);

    } catch (error: any) {
        const msg = error.response?.status === 401
            ? '❌ Patreon API returned 401 — your access token may be expired.'
            : `❌ Failed to sync tiers: ${error.message}`;
        await interaction.editReply({ content: msg });
        logger.error('Failed to sync tiers', error as Error);
    }
}
