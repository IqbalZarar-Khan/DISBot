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

export const EVENT_LABELS: Record<MemberEventType, string> = {
    member_join: '👋 New Patron Joins',
    member_leave: '🚪 Patron Departures',
    pledge_upgrade: '⬆️ Tier Upgrades',
    pledge_downgrade: '⬇️ Tier Downgrades',
    pledge_create: '💳 New Pledges',
    pledge_delete: '❌ Pledge Cancellations',
};

// In-memory runtime persistence layer (100% immune to Redis outages and transient network failures)
const inMemoryEventRoutes = new Map<MemberEventType, string>();

/**
 * Get the channel ID configured for a specific member event.
 * Multi-layer persistence hierarchy:
 *  1. In-memory cache (instant lookup)
 *  2. Process environment variables (EVENT_CHANNEL_<TYPE>, WELCOME_CHANNEL_ID)
 *  3. Persistent database (bot_config table)
 *  4. Global LOG_CHANNEL_ID / member_join channel fallbacks
 */
export async function getEventChannel(eventType: MemberEventType): Promise<string | null> {
    // 1. Check in-memory route cache (fastest & persists through Redis/network outages)
    if (inMemoryEventRoutes.has(eventType)) {
        return inMemoryEventRoutes.get(eventType)!;
    }

    // 2. Check process environment variables (crash-proof across all cloud container restarts)
    const envKey = `EVENT_CHANNEL_${eventType.toUpperCase()}`;
    if (process.env[envKey]) {
        inMemoryEventRoutes.set(eventType, process.env[envKey]!);
        return process.env[envKey]!;
    }

    // Common alias for member_join
    if (eventType === 'member_join' && process.env.WELCOME_CHANNEL_ID) {
        inMemoryEventRoutes.set(eventType, process.env.WELCOME_CHANNEL_ID);
        return process.env.WELCOME_CHANNEL_ID;
    }

    // 3. Check persistent database (bot_config table in Postgres / SQLite)
    try {
        const channelId = await getConfig(`event_channel_${eventType}`);
        if (channelId) {
            inMemoryEventRoutes.set(eventType, channelId);
            return channelId;
        }
    } catch {
        // Non-critical DB lookup error
    }

    // 4. Fallback to the global log channel
    const logChannel = process.env.LOG_CHANNEL_ID;
    if (logChannel) return logChannel;

    // 5. Final fallback: the welcome channel
    if (eventType !== 'member_join') {
        const joinChannel = await getEventChannel('member_join');
        if (joinChannel) return joinChannel;
    }

    return null;
}

/**
 * Load and synchronize all event routes on startup from environment variables and database.
 * Ensures routes survive container restarts even if Redis or external services restart.
 */
export async function loadPersistedEventRoutes(): Promise<Record<MemberEventType, string>> {
    const routes: Partial<Record<MemberEventType, string>> = {};

    for (const eventType of MEMBER_EVENT_TYPES) {
        // Check env vars first
        const envKey = `EVENT_CHANNEL_${eventType.toUpperCase()}`;
        let channelId = process.env[envKey] || null;

        if (!channelId && eventType === 'member_join' && process.env.WELCOME_CHANNEL_ID) {
            channelId = process.env.WELCOME_CHANNEL_ID;
        }

        // If not in env, check database
        if (!channelId) {
            try {
                channelId = await getConfig(`event_channel_${eventType}`);
            } catch {
                // DB not ready or error
            }
        } else {
            // Seed env var to DB for consistency
            try {
                await setConfig(`event_channel_${eventType}`, channelId);
            } catch {
                // Non-critical seeding
            }
        }

        if (channelId) {
            inMemoryEventRoutes.set(eventType, channelId);
            routes[eventType] = channelId;
        }
    }

    const loadedCount = Object.keys(routes).length;
    if (loadedCount > 0) {
        const summary = Object.entries(routes).map(([k, v]) => `${k} → #${v}`).join(', ');
        logger.info(`🔧 [EVENT ROUTING] Loaded ${loadedCount} persistent route(s): ${summary}`);
    } else {
        logger.info('🔧 [EVENT ROUTING] No specific event channels configured (using defaults)');
    }

    return routes as Record<MemberEventType, string>;
}

/**
 * Get all currently active event routes for /admin status or diagnostics.
 */
export async function getAllEventRoutes(): Promise<Record<MemberEventType, string | null>> {
    const result: Partial<Record<MemberEventType, string | null>> = {};
    for (const eventType of MEMBER_EVENT_TYPES) {
        result[eventType] = await getEventChannel(eventType);
    }
    return result as Record<MemberEventType, string | null>;
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
        // 1. Update in-memory route cache immediately
        inMemoryEventRoutes.set(eventType, channel.id);

        // 2. Persist to database (bot_config table)
        await setConfig(`event_channel_${eventType}`, channel.id);

        // 3. Invalidate multi-node cache
        try {
            const { invalidateCache } = await import('../../database/dbCache');
            await invalidateCache();
        } catch {
            // Non-critical
        }

        const embed = new EmbedBuilder()
            .setTitle('✅ Event Channel Updated')
            .setColor(0x00ff00)
            .setDescription(`**${EVENT_LABELS[eventType]}** events will now be sent to <#${channel.id}>`)
            .setFooter({ text: 'Route saved to persistent database & in-memory cache' })
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
