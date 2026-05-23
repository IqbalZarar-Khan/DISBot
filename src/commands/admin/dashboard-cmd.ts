import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import jwt from 'jsonwebtoken';

/**
 * /admin dashboard
 * Generates a short-lived JWT link to the web analytics dashboard.
 */
export async function handleDashboard(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    try {
        const secret = config.webhookSecret;
        if (!secret) {
            await interaction.editReply({
                content: '❌ WEBHOOK_SECRET is not configured. The dashboard requires it for JWT signing.'
            });
            return;
        }

        // Determine the base URL
        const baseUrl = config.publicUrl
            || process.env.PUBLIC_URL
            || `http://localhost:${config.webhookPort}`;

        // Generate a JWT that expires in 1 hour
        const token = jwt.sign(
            {
                sub: interaction.user.id,
                guildId: config.guildId,
                type: 'dashboard',
            },
            secret,
            { expiresIn: '1h' }
        );

        const dashboardUrl = `${baseUrl}/dashboard?token=${token}`;

        const embed = new EmbedBuilder()
            .setTitle('📊 Analytics Dashboard')
            .setDescription(`Your secure dashboard link is ready.\nThis link expires in **1 hour**.`)
            .addFields(
                { name: '🔗 Dashboard URL', value: `[Open Dashboard](${dashboardUrl})` },
                { name: '⏰ Expires', value: `<t:${Math.floor(Date.now() / 1000) + 3600}:R>`, inline: true },
            )
            .setColor(0x5865f2)
            .setFooter({ text: 'Do not share this link — it grants access to your patron data.' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        logger.info(`📊 [DASHBOARD] Link generated for ${interaction.user.tag}`);

    } catch (error: any) {
        await interaction.editReply({ content: `❌ Failed to generate dashboard link: ${error.message}` });
        logger.error('Error in /admin dashboard', error as Error);
    }
}
