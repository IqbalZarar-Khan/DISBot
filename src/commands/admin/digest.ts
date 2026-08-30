import { ChatInputCommandInteraction } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { generateWeeklyDigestEmbeds } from '../../utils/weeklyDigest';
import { config } from '../../config';
import { client } from '../../index';
import { logger } from '../../utils/logger';

/**
 * /admin digest [days] [dm_admin]
 * Generate and display the latest patron community digest on-demand.
 */
export async function handleDigest(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    try {
        const days = interaction.options.getInteger('days') ?? 7;
        const dmAdmin = interaction.options.getBoolean('dm_admin') ?? false;

        const embeds = await generateWeeklyDigestEmbeds(days);

        await interaction.editReply({ embeds });

        if (dmAdmin && config.rootAdminId) {
            try {
                const admin = await client.users.fetch(config.rootAdminId);
                await admin.send({ embeds });
                logger.info(`📊 [DIGEST] On-demand digest (${days}d) forwarded to root admin DM`);
            } catch (err) {
                logger.warn(`📊 [DIGEST] Failed to forward on-demand digest to admin DM: ${(err as Error).message}`);
            }
        }
    } catch (error: any) {
        await interaction.editReply({ content: `❌ Failed to generate digest: ${error.message}` });
        logger.error('Failed to generate on-demand digest', error as Error);
    }
}
