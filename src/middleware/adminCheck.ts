import { ChatInputCommandInteraction } from 'discord.js';
import { config } from '../config';

/**
 * Check if user is authorized to use admin commands
 */
export function isAdmin(userId: string): boolean {
    return userId === config.rootAdminId;
}

/**
 * Middleware to check admin authorization
 * Returns true if authorized, false if not (and sends error message)
 */
export async function checkAdminPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (!isAdmin(interaction.user.id)) {
        await interaction.reply({
            content: '⛔ **Access Denied**\n\nYou do not have permission to use this command.',
            ephemeral: true
        });
        return false;
    }

    return true;
}
