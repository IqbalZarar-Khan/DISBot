import { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { getTierMappingByName, getMessageTemplate } from '../../database/db';
import { createTestEmbed, createPostEmbed } from '../../utils/embedBuilder';
import { formatMessage } from '../../utils/formatter';
import { client } from '../../index';

export async function handleTestAlert(interaction: ChatInputCommandInteraction): Promise<void> {
    // Check admin permission
    if (!await checkAdminPermission(interaction)) return;

    const tierName = interaction.options.getString('tier_name', true);
    const templateType = interaction.options.getString('template_type');

    try {
        // Get tier mapping
        const mapping = await getTierMappingByName(tierName);

        if (!mapping) {
            await interaction.reply({
                content: `❌ **Tier Not Found**\n\nNo channel mapping found for tier "${tierName}".\n\nUse \`/admin set-channel\` to configure tier mappings first.`,
                ephemeral: true
            });
            return;
        }

        // Get channel
        const channel = await client.channels.fetch(mapping.channel_id) as TextChannel;

        if (!channel) {
            await interaction.reply({
                content: `❌ **Channel Not Found**\n\nCould not find channel <#${mapping.channel_id}>.\n\nPlease update the tier mapping.`,
                ephemeral: true
            });
            return;
        }

        // If template_type is specified, preview custom template
        if (templateType) {
            const template = await getMessageTemplate(templateType as any);
            const defaultTemplates: Record<string, string> = {
                post_new: '📢 New {tier} post: **{title}**\n{url}',
                post_waterfall: '🌊 This post is now available to {tier}! **{title}**\n{url}',
                welcome: '👋 Welcome {user} to the **{tier}** tier!',
            };

            const activeTemplate = template || defaultTemplates[templateType] || 'No template found for this type.';

            // Format with sample data
            const messageText = formatMessage(activeTemplate, {
                tier: tierName,
                title: 'My Amazing Post Title',
                url: 'https://www.patreon.com/posts/example-12345',
                user: `<@${interaction.user.id}>`,
                pledge_amount: '$25.00',
                post_snippet: 'This is a preview of the post content that would appear here, showing the first 200 characters of the actual Patreon post...',
                patron_count: '42',
            });

            const embed = createPostEmbed({
                title: 'My Amazing Post Title',
                url: 'https://www.patreon.com/posts/example-12345',
                tierName: tierName,
                isUpdate: templateType === 'post_waterfall',
            });
            embed.setDescription(messageText);
            embed.setFooter({ text: `📋 Template Preview: ${templateType} • ${template ? 'Custom template' : 'Default template'}` });

            await channel.send({ embeds: [embed] });

            const templateLabel = template ? '✅ Custom template' : '⚠️ Default template (no custom set)';
            await interaction.reply({
                content: `✅ **Template Preview Sent**\n\nSent a **${templateType}** preview to ${channel}.\n\n**Template:** ${templateLabel}\n**Raw:** \`${activeTemplate}\``,
                ephemeral: true
            });
        } else {
            // Original behavior — generic test alert
            const embed = createTestEmbed(tierName);
            await channel.send({ embeds: [embed] });

            await interaction.reply({
                content: `✅ **Test Alert Sent**\n\nA test alert has been sent to ${channel}.\n\nPlease check the channel to verify formatting and permissions.\n\n💡 **Tip:** Use \`/admin test-alert <tier> <template_type>\` to preview your custom templates!`,
                ephemeral: true
            });
        }

    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to send test alert. Please check the logs and bot permissions.',
            ephemeral: true
        });
        throw error;
    }
}
