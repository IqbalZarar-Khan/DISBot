import { ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getAllTrackedMembers, getAllTrackedPosts, getAllTierMappings } from '../../database/db';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * /admin export-data
 * Exports patron tracking data as a CSV file sent to the admin's DMs.
 */
export async function handleExportData(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    // Only root admin can export data
    if (interaction.user.id !== config.rootAdminId) {
        await interaction.reply({
            content: '⛔ Only the Root Admin can export data.',
            ephemeral: true,
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const members = await getAllTrackedMembers();
        const posts = await getAllTrackedPosts();
        const mappings = await getAllTierMappings();

        // ── Members CSV ──────────────────────────────────────────────
        const memberHeader = 'member_id,full_name,current_tier_id,tier_name,email,joined_at,updated_at';
        const memberRows = members.map(m => {
            const tierName = config.tierConfig.find(t => t.id === m.current_tier_id)?.name || 'Unknown';
            return [
                m.member_id,
                `"${(m.full_name || '').replace(/"/g, '""')}"`,
                m.current_tier_id,
                `"${tierName}"`,
                m.email || '',
                new Date(m.joined_at).toISOString(),
                new Date(m.updated_at).toISOString(),
            ].join(',');
        });
        const memberCsv = [memberHeader, ...memberRows].join('\n');

        // ── Posts CSV ────────────────────────────────────────────────
        const postHeader = 'post_id,title,last_tier_access,updated_at';
        const postRows = posts.map(p => [
            p.post_id,
            `"${(p.title || '').replace(/"/g, '""')}"`,
            `"${p.last_tier_access}"`,
            new Date(p.updated_at).toISOString(),
        ].join(','));
        const postCsv = [postHeader, ...postRows].join('\n');

        // ── Tier Mappings CSV ────────────────────────────────────────
        const tierHeader = 'tier_id,tier_name,tier_rank,channel_id';
        const tierRows = mappings.map(m => [
            m.tier_id,
            `"${m.tier_name}"`,
            m.tier_rank,
            m.channel_id || '',
        ].join(','));
        const tierCsv = [tierHeader, ...tierRows].join('\n');

        // Create file attachments
        const now = new Date().toISOString().split('T')[0];
        const files = [
            new AttachmentBuilder(Buffer.from(memberCsv, 'utf-8'), { name: `patrons_${now}.csv` }),
            new AttachmentBuilder(Buffer.from(postCsv, 'utf-8'), { name: `posts_${now}.csv` }),
            new AttachmentBuilder(Buffer.from(tierCsv, 'utf-8'), { name: `tiers_${now}.csv` }),
        ];

        // Try to DM the admin
        try {
            const dm = await interaction.user.createDM();
            await dm.send({
                content: `📦 **DISBot Data Export** — ${now}\n\n• **${members.length}** patrons\n• **${posts.length}** tracked posts\n• **${mappings.length}** tier mappings`,
                files,
            });

            await interaction.editReply({
                content: '✅ Data export sent to your DMs! Check your direct messages for 3 CSV files.',
            });
        } catch {
            // DMs might be disabled — send as ephemeral reply instead
            await interaction.editReply({
                content: '📦 **Data Export** (DMs unavailable — sending here instead)',
                files,
            });
        }

        logger.info(`📦 [EXPORT] Data exported by ${interaction.user.tag}: ${members.length} patrons, ${posts.length} posts`);

    } catch (error: any) {
        await interaction.editReply({ content: `❌ Export failed: ${error.message}` });
        logger.error('Failed to export data', error as Error);
    }
}
