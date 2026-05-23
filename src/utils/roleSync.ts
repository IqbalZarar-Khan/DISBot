import { Guild, GuildMember } from 'discord.js';
import { getSupabase } from '../database/supabase';
import { RoleMapping, DiscordLink } from '../database/schema';
import { getAllTrackedMembers, getConfig, setConfig } from '../database/db';
import { logger } from './logger';

/**
 * Discord Role Sync Engine
 *
 * Manages Discord roles based on Patreon tier memberships.
 * When a patron pledges to "Gold", DISBot grants them the Gold role.
 * When they downgrade or leave, the old role is removed.
 *
 * Toggle: Controlled via `/admin role-map action:on|off`.
 * Default: OFF (safe to deploy alongside Patreon Bot).
 */

// ===== RUNTIME TOGGLE =====

/**
 * Check if role sync is enabled at runtime.
 * Priority: DB key `role_sync_enabled` > env var `DISCORD_ROLE_SYNC_ENABLED` > default false.
 */
export async function isRoleSyncEnabled(): Promise<boolean> {
    try {
        const dbValue = await getConfig('role_sync_enabled');
        if (dbValue !== null) {
            return dbValue === 'true';
        }
    } catch {
        // DB not reachable — fall through to env
    }
    return (process.env.DISCORD_ROLE_SYNC_ENABLED || 'false').toLowerCase() === 'true';
}

/**
 * Persist the role sync toggle to the database.
 */
export async function setRoleSyncEnabled(enabled: boolean): Promise<void> {
    await setConfig('role_sync_enabled', enabled ? 'true' : 'false');
    logger.info(`🔄 [ROLE SYNC] ${enabled ? 'ENABLED' : 'DISABLED'} via admin command`);
}

// ===== ROLE MAPPING DB OPS =====

export async function getRoleMappings(): Promise<RoleMapping[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('role_mappings')
        .select('*');
    if (error) throw error;
    return (data as RoleMapping[]) || [];
}

export async function getRoleMappingByTierId(tierId: string): Promise<RoleMapping | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('role_mappings')
        .select('*')
        .eq('tier_id', tierId)
        .single();
    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data as RoleMapping;
}

export async function setRoleMapping(tierId: string, tierName: string, roleId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('role_mappings')
        .upsert({ tier_id: tierId, tier_name: tierName, discord_role_id: roleId }, { onConflict: 'tier_id' });
    if (error) throw error;
}

// ===== DISCORD LINK DB OPS =====

export async function getDiscordLink(patreonMemberId: string): Promise<DiscordLink | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('discord_links')
        .select('*')
        .eq('patreon_member_id', patreonMemberId)
        .single();
    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data as DiscordLink;
}

export async function setDiscordLink(discordUserId: string, patreonMemberId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('discord_links')
        .upsert({
            discord_user_id: discordUserId,
            patreon_member_id: patreonMemberId,
            linked_at: new Date().toISOString(),
        }, { onConflict: 'discord_user_id' });
    if (error) throw error;
}

// ===== SYNC ENGINE =====

/**
 * Sync a single member's Discord role after a tier change.
 * Looks up the Discord user via discord_links, then adds/removes roles.
 *
 * @param guildId - Discord guild ID
 * @param patreonMemberId - Patreon member ID
 * @param newTierId - New tier ID (or 'free')
 * @param oldTierId - Previous tier ID (or 'free')
 */
export async function syncMemberRole(
    guildId: string,
    patreonMemberId: string,
    newTierId: string,
    oldTierId?: string
): Promise<void> {
    // Find the Discord user linked to this Patreon member
    const link = await getDiscordLink(patreonMemberId);
    if (!link) {
        logger.info(`🔄 [ROLE SYNC] No Discord link for Patreon member ${patreonMemberId} — skipping`);
        return;
    }

    const { client } = await import('../index');
    let guild: Guild;
    try {
        guild = await client.guilds.fetch(guildId);
    } catch {
        logger.warn(`🔄 [ROLE SYNC] Could not fetch guild ${guildId}`);
        return;
    }

    let member: GuildMember;
    try {
        member = await guild.members.fetch(link.discord_user_id);
    } catch {
        logger.warn(`🔄 [ROLE SYNC] Discord user ${link.discord_user_id} not in guild — skipping`);
        return;
    }

    // Remove old tier role
    if (oldTierId && oldTierId !== 'free') {
        const oldMapping = await getRoleMappingByTierId(oldTierId);
        if (oldMapping) {
            try {
                await member.roles.remove(oldMapping.discord_role_id,
                    'DISBot: Patreon tier changed');
                logger.info(`🔄 [ROLE SYNC] Removed role ${oldMapping.tier_name} from ${member.displayName}`);
            } catch (err) {
                logger.warn(`🔄 [ROLE SYNC] Could not remove role: ${(err as Error).message}`);
            }
        }
    }

    // Add new tier role
    if (newTierId && newTierId !== 'free') {
        const newMapping = await getRoleMappingByTierId(newTierId);
        if (newMapping) {
            try {
                await member.roles.add(newMapping.discord_role_id,
                    'DISBot: Patreon tier assigned');
                logger.info(`🔄 [ROLE SYNC] Added role ${newMapping.tier_name} to ${member.displayName}`);
            } catch (err) {
                logger.warn(`🔄 [ROLE SYNC] Could not add role: ${(err as Error).message}`);
            }
        }
    }
}

/**
 * Full guild-wide reconciliation.
 * Runs once on startup to catch any drift that occurred while the bot was offline.
 * Compares tracked members against actual Discord roles and fixes mismatches.
 */
export async function reconcileAllRoles(guild: Guild): Promise<void> {
    const members = await getAllTrackedMembers();
    const roleMappings = await getRoleMappings();

    if (roleMappings.length === 0) {
        logger.info('🔄 [ROLE SYNC] No role mappings configured — skipping reconciliation');
        return;
    }

    // Build a lookup: tierId → roleId
    const tierToRole = new Map<string, string>();
    for (const rm of roleMappings) {
        tierToRole.set(rm.tier_id, rm.discord_role_id);
    }

    // All mapped role IDs (for removing stale roles)
    const allMappedRoleIds = new Set(roleMappings.map(rm => rm.discord_role_id));

    let fixed = 0;
    let skipped = 0;

    for (const trackedMember of members) {
        const link = await getDiscordLink(trackedMember.member_id);
        if (!link) {
            skipped++;
            continue;
        }

        let discordMember: GuildMember;
        try {
            discordMember = await guild.members.fetch(link.discord_user_id);
        } catch {
            skipped++;
            continue;
        }

        const expectedRoleId = tierToRole.get(trackedMember.current_tier_id);
        const currentRoles = discordMember.roles.cache;

        // Remove any patron roles they shouldn't have
        for (const roleId of allMappedRoleIds) {
            if (roleId !== expectedRoleId && currentRoles.has(roleId)) {
                try {
                    await discordMember.roles.remove(roleId, 'DISBot: Startup reconciliation');
                    fixed++;
                } catch {
                    // Permission issue — skip
                }
            }
        }

        // Add the role they should have
        if (expectedRoleId && !currentRoles.has(expectedRoleId)) {
            try {
                await discordMember.roles.add(expectedRoleId, 'DISBot: Startup reconciliation');
                fixed++;
            } catch {
                // Permission issue — skip
            }
        }
    }

    logger.info(`🔄 [ROLE SYNC] Reconciliation complete: ${fixed} role(s) fixed, ${skipped} member(s) skipped (no Discord link)`);
}
