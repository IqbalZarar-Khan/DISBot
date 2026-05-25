import { SlashCommandBuilder } from 'discord.js';

/**
 * Returns the slash command definitions as JSON-serializable objects.
 * Shared by both deploy-commands.ts (standalone CLI) and index.ts (auto-deploy on startup).
 */
export function getCommandData() {
    return [
        new SlashCommandBuilder()
            .setName('admin')
            .setDescription('Admin commands for bot management')
            .setDefaultMemberPermissions(0)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set-owner')
                    .setDescription('Transfer bot control to a new user')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('The new owner')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('status')
                    .setDescription('Display bot status and configuration')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('sync-tiers')
                    .setDescription('Fetch tiers from Patreon and sync to database (no restart needed)')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('setup')
                    .setDescription('Interactive tier-to-channel mapping with dropdown menus')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('stats')
                    .setDescription('View patron analytics: growth, tier distribution, and activity')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set-event-channel')
                    .setDescription('Route member events (joins, departures, upgrades) to specific channels')
                    .addStringOption(option =>
                        option
                            .setName('event')
                            .setDescription('The event type to route')
                            .setRequired(true)
                            .addChoices(
                                { name: '👋 New Patron Joins', value: 'member_join' },
                                { name: '🚪 Patron Departures', value: 'member_leave' },
                                { name: '⬆️ Tier Upgrades', value: 'pledge_upgrade' },
                                { name: '⬇️ Tier Downgrades', value: 'pledge_downgrade' },
                                { name: '💳 New Pledges', value: 'pledge_create' },
                                { name: '❌ Pledge Cancellations', value: 'pledge_delete' }
                            )
                    )
                    .addChannelOption(option =>
                        option
                            .setName('channel')
                            .setDescription('The Discord channel for this event type')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set-channel')
                    .setDescription('Map a Patreon tier to a Discord channel')
                    .addStringOption(option =>
                        option
                            .setName('tier_name')
                            .setDescription('Tier name (must match your TIER_CONFIG or synced tiers)')
                            .setRequired(true)
                    )
                    .addChannelOption(option =>
                        option
                            .setName('channel')
                            .setDescription('The Discord channel for this tier')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('test-alert')
                    .setDescription('Send a test alert to a tier channel')
                    .addStringOption(option =>
                        option
                            .setName('tier_name')
                            .setDescription('Tier name to test')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option
                            .setName('template_type')
                            .setDescription('Preview a specific custom template')
                            .setRequired(false)
                            .addChoices(
                                { name: '📢 New Post', value: 'post_new' },
                                { name: '🌊 Waterfall', value: 'post_waterfall' },
                                { name: '👋 Welcome', value: 'welcome' }
                            )
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('debug-logs')
                    .setDescription('View the last 50 X-Ray debug log entries (ephemeral)')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('export-data')
                    .setDescription('Export patron data as CSV files to your DMs (Root Admin only)')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('bulk-map')
                    .setDescription('Map all unmapped tiers to channels in a guided wizard')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set-message')
                    .setDescription('Customize automated bot messages')
                    .addStringOption(option =>
                        option
                            .setName('type')
                            .setDescription('Which message to customize')
                            .setRequired(true)
                            .addChoices(
                                { name: 'New Post', value: 'post_new' },
                                { name: 'Waterfall Update', value: 'post_waterfall' },
                                { name: 'Welcome Message', value: 'welcome' },
                                { name: '💌 Win-Back DM', value: 'win_back' },
                                { name: '🎂 Anniversary', value: 'anniversary' }
                            )
                    )
                    .addStringOption(option =>
                        option
                            .setName('content')
                            .setDescription('Use {tier} {title} {url} {user} {pledge_amount} {post_snippet} {patron_count}')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('poller')
                    .setDescription('Start, stop, or check the Patreon post poller')
                    .addStringOption(option =>
                        option
                            .setName('action')
                            .setDescription('What to do with the poller')
                            .setRequired(true)
                            .addChoices(
                                { name: '▶️ Start', value: 'start' },
                                { name: '⏸️ Stop', value: 'stop' },
                                { name: '📊 Status', value: 'status' }
                            )
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('server-stats')
                    .setDescription('View live server CPU, memory, uptime, and PM2 stats')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('role-map')
                    .setDescription('Manage Discord role sync: toggle on/off or map tiers to roles')
                    .addStringOption(option =>
                        option
                            .setName('action')
                            .setDescription('What to do')
                            .setRequired(true)
                            .addChoices(
                                { name: '🟢 Enable Role Sync', value: 'on' },
                                { name: '🔴 Disable Role Sync', value: 'off' },
                                { name: '📊 Show Status', value: 'status' },
                                { name: '🔗 Map Tier → Role', value: 'map' }
                            )
                    )
                    .addStringOption(option =>
                        option
                            .setName('tier_name')
                            .setDescription('Tier name (required for "map" action)')
                            .setRequired(false)
                    )
                    .addRoleOption(option =>
                        option
                            .setName('role')
                            .setDescription('Discord role (required for "map" action)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('dashboard')
                    .setDescription('Generate a secure link to the web analytics dashboard')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('error-log')
                    .setDescription('View logged errors with explanations, or clear the error log')
                    .addStringOption(option =>
                        option
                            .setName('action')
                            .setDescription('What to do')
                            .setRequired(false)
                            .addChoices(
                                { name: '📋 View errors (default)', value: 'view' },
                                { name: '🗑️ Clear error log', value: 'clear' }
                            )
                    )
                    .addStringOption(option =>
                        option
                            .setName('severity')
                            .setDescription('Filter by severity level (default: all)')
                            .setRequired(false)
                            .addChoices(
                                { name: '💀 Critical only', value: 'critical' },
                                { name: '🔴 High only', value: 'high' },
                                { name: '🟠 Medium only', value: 'medium' },
                                { name: '🟡 Low only', value: 'low' }
                            )
                    )
                    .addIntegerOption(option =>
                        option
                            .setName('count')
                            .setDescription('Number of recent errors to show (1-25, default 10)')
                            .setRequired(false)
                            .setMinValue(1)
                            .setMaxValue(25)
                    )
            ),
        new SlashCommandBuilder()
            .setName('link')
            .setDescription('Link your Discord account to your Patreon membership for role sync')
            .addStringOption(option =>
                option
                    .setName('identifier')
                    .setDescription('Your Patreon email, display name, or member ID')
                    .setRequired(true)
            ),
    ].map(command => command.toJSON());
}
