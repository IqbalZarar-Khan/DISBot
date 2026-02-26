import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getAllTrackedMembers, getAllTierMappings, getAllTrackedPosts } from '../../database/db';
import { config } from '../../config';
import { getTierEmoji } from '../../utils/tierRanking';
import { logger } from '../../utils/logger';

/**
 * /admin stats
 * Patron analytics dashboard with overview, growth, and tier breakdown.
 */
export async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    try {
        const members = await getAllTrackedMembers();
        const mappings = await getAllTierMappings();
        const posts = await getAllTrackedPosts();

        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

        // ── Overview Embed ─────────────────────────────────────────

        const overviewEmbed = new EmbedBuilder()
            .setTitle('📊 Patron Analytics Dashboard')
            .setColor(0x5865f2)
            .setTimestamp();

        // Total members
        overviewEmbed.addFields({
            name: '👥 Total Patrons',
            value: `**${members.length}**`,
            inline: true,
        });

        // Active tiers
        overviewEmbed.addFields({
            name: '🏷️ Active Tiers',
            value: `**${mappings.filter(m => m.channel_id).length}** mapped`,
            inline: true,
        });

        // Tracked posts
        overviewEmbed.addFields({
            name: '📝 Tracked Posts',
            value: `**${posts.length}**`,
            inline: true,
        });

        // ── Growth Stats ───────────────────────────────────────────

        const newLast30 = members.filter(m => m.joined_at > thirtyDaysAgo);
        const newLast7 = members.filter(m => m.joined_at > sevenDaysAgo);
        const updatedLast30 = members.filter(m => m.updated_at > thirtyDaysAgo && m.joined_at <= thirtyDaysAgo);

        overviewEmbed.addFields({
            name: '📈 Growth (Last 30 Days)',
            value: [
                `New patrons: **${newLast30.length}**`,
                `Active changes: **${updatedLast30.length}** upgrades/changes`,
                `New this week: **${newLast7.length}**`,
            ].join('\n'),
            inline: false,
        });

        // ── Tier Breakdown ─────────────────────────────────────────

        const tierCounts: Record<string, number> = {};
        for (const member of members) {
            const tierId = member.current_tier_id || 'unknown';
            tierCounts[tierId] = (tierCounts[tierId] || 0) + 1;
        }

        // Map tier IDs to names from config
        const tierLines: string[] = [];
        for (const tier of config.tierConfig) {
            const count = tierCounts[tier.id] || 0;
            const emoji = getTierEmoji(tier.name);
            const bar = '█'.repeat(Math.min(Math.round((count / Math.max(members.length, 1)) * 20), 20));
            const pct = members.length > 0 ? ((count / members.length) * 100).toFixed(1) : '0.0';
            tierLines.push(`${emoji} **${tier.name}** — ${count} (${pct}%) ${bar}`);
        }

        // Include any unmapped tiers
        for (const [tierId, count] of Object.entries(tierCounts)) {
            const isKnown = config.tierConfig.some(t => t.id === tierId);
            if (!isKnown && tierId !== 'unknown') {
                tierLines.push(`❓ **ID: ${tierId}** — ${count} patron(s)`);
            }
        }

        if (tierLines.length > 0) {
            overviewEmbed.addFields({
                name: '🎯 Tier Distribution',
                value: tierLines.join('\n') || 'No tier data',
                inline: false,
            });
        }

        // ── Recent Activity ────────────────────────────────────────

        const recentMembers = members
            .sort((a, b) => b.updated_at - a.updated_at)
            .slice(0, 5);

        if (recentMembers.length > 0) {
            const activityLines = recentMembers.map(m => {
                const date = new Date(m.updated_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                });
                const tierName = config.tierConfig.find(t => t.id === m.current_tier_id)?.name || 'Unknown';
                return `• **${m.full_name}** → ${tierName} (${date})`;
            });

            overviewEmbed.addFields({
                name: '🕐 Recent Activity',
                value: activityLines.join('\n'),
                inline: false,
            });
        }

        overviewEmbed.setFooter({
            text: `Data from ${members.length} tracked patrons • ${posts.length} posts`,
        });

        await interaction.editReply({ embeds: [overviewEmbed] });

    } catch (error: any) {
        await interaction.editReply({ content: `❌ Failed to load stats: ${error.message}` });
        logger.error('Failed to load patron stats', error as Error);
    }
}
