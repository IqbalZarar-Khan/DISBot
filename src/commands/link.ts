import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { setDiscordLink, getDiscordLink } from '../utils/roleSync';
import { getTrackedMember, getAllTrackedMembers } from '../database/db';
import { logger } from '../utils/logger';

/**
 * /link <patreon_email_or_id>
 * Links the Discord user to their Patreon member record for role sync.
 */
export async function handleLink(interaction: ChatInputCommandInteraction): Promise<void> {
    const identifier = interaction.options.getString('identifier', true);
    const discordUserId = interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    try {
        // Try to find the Patreon member by email or member ID
        let patreonMemberId: string | null = null;

        // First try: exact member ID match
        const directMember = await getTrackedMember(identifier);
        if (directMember) {
            patreonMemberId = directMember.member_id;
        }

        // Second try: search by email across all tracked members
        if (!patreonMemberId) {
            const allMembers = await getAllTrackedMembers();
            const byEmail = allMembers.find(m =>
                m.email && m.email.toLowerCase() === identifier.toLowerCase()
            );
            if (byEmail) {
                patreonMemberId = byEmail.member_id;
            }
        }

        // Third try: search by full name
        if (!patreonMemberId) {
            const allMembers = await getAllTrackedMembers();
            const byName = allMembers.find(m =>
                m.full_name.toLowerCase() === identifier.toLowerCase()
            );
            if (byName) {
                patreonMemberId = byName.member_id;
            }
        }

        if (!patreonMemberId) {
            await interaction.editReply({
                content: '❌ Could not find a Patreon member matching that email, name, or ID.\n\n' +
                    '**Tips:**\n' +
                    '• Use the exact email on your Patreon account\n' +
                    '• Or your full Patreon display name\n' +
                    '• The bot must have received at least one webhook for your account'
            });
            return;
        }

        // Check if this Patreon account is already linked to someone else
        const existingLink = await getDiscordLink(patreonMemberId);
        if (existingLink && existingLink.discord_user_id !== discordUserId) {
            await interaction.editReply({
                content: '⚠️ This Patreon account is already linked to a different Discord user. Contact an admin if this is an error.'
            });
            return;
        }

        // Create the link
        await setDiscordLink(discordUserId, patreonMemberId);

        const member = await getTrackedMember(patreonMemberId);
        const embed = new EmbedBuilder()
            .setTitle('🔗 Account Linked!')
            .setDescription(`Your Discord account has been linked to your Patreon membership.`)
            .addFields(
                { name: 'Patreon Name', value: member?.full_name || 'Unknown', inline: true },
                { name: 'Member ID', value: patreonMemberId, inline: true },
            )
            .setColor(0x43b581)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        logger.info(`🔗 [LINK] Discord user ${interaction.user.tag} linked to Patreon member ${patreonMemberId}`);

    } catch (error: any) {
        await interaction.editReply({ content: `❌ Failed to link account: ${error.message}` });
        logger.error('Error in /link command', error as Error);
    }
}
