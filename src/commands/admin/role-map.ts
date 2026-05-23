import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import { setRoleMapping, getRoleMappings, isRoleSyncEnabled, setRoleSyncEnabled } from '../../utils/roleSync';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * /admin role-map action:<on|off|status|map> [tier_name:] [role:]
 *
 * Manages the Discord role sync system:
 *  - on/off: Toggle role sync (default: OFF, so it's safe alongside Patreon Bot)
 *  - status: Show current state + all mappings
 *  - map: Map a Patreon tier to a Discord role
 */
export async function handleRoleMap(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    const action = interaction.options.getString('action', true);
    await interaction.deferReply({ ephemeral: true });

    try {
        switch (action) {
            case 'on': {
                await setRoleSyncEnabled(true);
                const mappings = await getRoleMappings();
                const embed = new EmbedBuilder()
                    .setTitle('🟢 Role Sync Enabled')
                    .setDescription(
                        'DISBot will now automatically manage Discord roles based on Patreon tiers.\n\n' +
                        (mappings.length === 0
                            ? '⚠️ **No tier→role mappings configured yet!**\nUse `/admin role-map action:map` to set them up.'
                            : `**${mappings.length} mapping(s) active** — roles will sync on next webhook event.`)
                    )
                    .setColor(0x43b581)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case 'off': {
                await setRoleSyncEnabled(false);
                const embed = new EmbedBuilder()
                    .setTitle('🔴 Role Sync Disabled')
                    .setDescription(
                        'Role sync is now **OFF**. DISBot will not modify any Discord roles.\n' +
                        'Your existing role mappings are preserved — you can re-enable anytime.'
                    )
                    .setColor(0xed4245)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case 'status': {
                const enabled = await isRoleSyncEnabled();
                const mappings = await getRoleMappings();
                const mappingLines = mappings.map(m =>
                    `• **${m.tier_name}** → <@&${m.discord_role_id}>`
                );

                const embed = new EmbedBuilder()
                    .setTitle('📊 Role Sync Status')
                    .addFields(
                        {
                            name: 'Status',
                            value: enabled
                                ? '🟢 **ENABLED** — roles sync automatically'
                                : '🔴 **DISABLED** — no role changes being made',
                            inline: false,
                        },
                        {
                            name: `Tier → Role Mappings (${mappings.length})`,
                            value: mappingLines.length > 0 ? mappingLines.join('\n') : 'No mappings configured',
                            inline: false,
                        }
                    )
                    .setColor(enabled ? 0x43b581 : 0xed4245)
                    .setFooter({ text: 'Use /admin role-map action:on|off to toggle • action:map to add mappings' })
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case 'map': {
                const tierName = interaction.options.getString('tier_name');
                const role = interaction.options.getRole('role');

                if (!tierName || !role) {
                    await interaction.editReply({
                        content: '❌ The **map** action requires both `tier_name` and `role` options.\n\n' +
                            'Example: `/admin role-map action:map tier_name:Gold role:@Gold Patron`'
                    });
                    return;
                }

                // Find the tier ID from config
                const tier = config.tierConfig.find(t =>
                    t.name.toLowerCase() === tierName.toLowerCase()
                );

                if (!tier) {
                    const available = config.tierConfig.map(t => t.name).join(', ');
                    await interaction.editReply({
                        content: `❌ Tier "${tierName}" not found.\n\nAvailable tiers: ${available}`
                    });
                    return;
                }

                // Save the mapping
                await setRoleMapping(tier.id, tier.name, role.id);

                // Show all current mappings
                const allMappings = await getRoleMappings();
                const mappingLines = allMappings.map(m =>
                    `• **${m.tier_name}** → <@&${m.discord_role_id}>`
                );

                const enabled = await isRoleSyncEnabled();

                const embed = new EmbedBuilder()
                    .setTitle('🔗 Role Mapping Updated')
                    .setDescription(`**${tier.name}** tier → <@&${role.id}>`)
                    .addFields(
                        {
                            name: 'All Role Mappings',
                            value: mappingLines.join('\n'),
                        },
                        {
                            name: 'Sync Status',
                            value: enabled
                                ? '🟢 Enabled — this mapping is live'
                                : '🔴 Disabled — mapping saved but not active.\nUse `/admin role-map action:on` to enable.',
                        }
                    )
                    .setColor(0x5865f2)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                logger.info(`🔗 [ROLE MAP] ${tier.name} (${tier.id}) → ${role.name} (${role.id})`);
                break;
            }

            default:
                await interaction.editReply({ content: '❌ Unknown action.' });
        }

    } catch (error: any) {
        await interaction.editReply({ content: `❌ Failed: ${error.message}` });
        logger.error('Error in /admin role-map', error as Error);
    }
}
