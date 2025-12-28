import { ChatInputCommandInteraction } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { setConfig } from '../../database/db';

export async function handleSetOwner(interaction: ChatInputCommandInteraction): Promise<void> {
    // Check admin permission
    if (!await checkAdminPermission(interaction)) return;

    const newOwner = interaction.options.getUser('user', true);

    try {
        // Update admin ID in database
        setConfig('current_admin_id', newOwner.id);

        await interaction.reply({
            content: `✅ **Owner Updated**\n\nBot control has been transferred to <@${newOwner.id}>.\n\n⚠️ **Important:** You will need to update the \`ROOT_ADMIN_ID\` in your environment variables and restart the bot for this change to take full effect.`,
            ephemeral: true
        });
    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to update owner. Please check the logs.',
            ephemeral: true
        });
        throw error;
    }
}
