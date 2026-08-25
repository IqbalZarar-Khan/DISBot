import { ChatInputCommandInteraction, ChannelType, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { setConfig, getConfig } from '../../database/db';
import { logger } from '../../utils/logger';

/**
 * Valid member event types that can be routed to different channels.
 */
export const MEMBER_EVENT_TYPES = [
    'member_join',       // New patron joins
    'member_leave',      // Patron departs
    'pledge_upgrade',    // Tier upgrade
    'pledge_downgrade',  // Tier downgrade
    'pledge_create',     // New pledge created
    'pledge_delete',     // Pledge cancelled
] as const;

export type MemberEventType = typeof MEMBER_EVENT_TYPES[number];

/**
 * Get the channel ID configured for a specific member event.
 * Falls back to LOG_CHANNEL_ID, then to the member_join channel — an
 * announcement routed somewhere visible beats one silently dropped.
 */
export async function getEventChannel(eventType: MemberEventType): Promise<string | null> {
    const channelId = await getConfig(`event_channel_${eventType}`);
    if (channelId) return channelId;

    // Fallback to the global log channel
    const logChannel = process.env.LOG_CHANNEL_ID;
    if (logChannel) return logChannel;

    // Final fallback: the welcome channel is where members are watched —
    // use it rather than dropping the announcement entirely.
    if (eventType !== 'member_join') {
        try {
            const joinChannel = await getConfig('event_channel_member_join');
            if (joinChannel) return joinChannel;
        } catch {
            // Config lookup failure — treat as no fallback
        }
    }

    return null;
}

/**
 * /admin set-event-channel
 * Route specific member events to specific Discord channels.
 */
export async function handleSetEventChannel(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    const eventType = interaction.options.getString('event', true) as MemberEventType;
    const channel = interaction.options.getChannel('channel', true);

    if (channel.type !== ChannelType.GuildText) {
        await interaction.reply({
            content: '❌ Please select a text channel.',
            ephemeral: true,
        });
        return;
    }

    try {
        await setConfig(`event_channel_${eventType}`, channel.id);

        const eventLabels: Record<MemberEventType, string> = {
            member_join: '👋 New Patron Joins',
            member_leave: '🚪 Patron Departures',
            pledge_upgrade: '⬆️ Tier Upgrades',
            pledge_downgrade: '⬇️ Tier Downgrades',
            pledge_create: '💳 New Pledges',
            pledge_delete: '❌ Pledge Cancellations',
        };

        const embed = new EmbedBuilder()
            .setTitle('✅ Event Channel Updated')
            .setColor(0x00ff00)
            .setDescription(`**${eventLabels[eventType]}** events will now be sent to <#${channel.id}>`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        logger.info(`🔧 [EVENT ROUTING] ${eventType} → #${channel.id}`);

    } catch (error) {
        await interaction.reply({
            content: '❌ Failed to set event channel. Check the logs.',
            ephemeral: true,
        });
        throw error;
    }
}
