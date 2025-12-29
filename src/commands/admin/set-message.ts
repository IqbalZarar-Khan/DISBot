import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { setCustomMessage } from '../../database/db';
import { config } from '../../config';

export const data = new SlashCommandBuilder()
    .setName('set-message')
    .setDescription('Customize automated messages (Admin Only)')
    .addStringOption(option =>
        option.setName('type')
            .setDescription('Which message to update')
            .setRequired(true)
            .addChoices(
                { name: 'Welcome Message (New Pledge)', value: 'welcome' },
                { name: 'Post Alert (New Post)', value: 'post_new' },
                { name: 'Waterfall Alert (Post Update)', value: 'post_waterfall' }
            )
    )
    .addStringOption(option =>
        option.setName('content')
            .setDescription('Variables: {user}, {tier}, {title}, {url}')
            .setRequired(true)
    );

export const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
    // Security Check - Only root admin can use this
    if (interaction.user.id !== config.rootAdminId) {
        await interaction.reply({
            content: '⛔ Only the Root Admin can use this command.',
            ephemeral: true
        });
        return;
    }

    const type = interaction.options.getString('type', true);
    const content = interaction.options.getString('content', true);

    await interaction.deferReply({ ephemeral: true });

    try {
        // Save to Supabase
        await setCustomMessage(type, content);

        await interaction.editReply({
            content: `✅ **Updated ${type} message!**\n\n**Preview:**\n${content}\n\n**Available Variables:**\n- \`{user}\` - Mention the user\n- \`{tier}\` - Tier name\n- \`{title}\` - Post title\n- \`{url}\` - Post URL`
        });
    } catch (error) {
        console.error('Error saving custom message:', error);
        await interaction.editReply({
            content: '❌ Failed to save message to database. Check bot logs for details.'
        });
    }
};
