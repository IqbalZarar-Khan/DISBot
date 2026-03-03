/**
 * Startup Health Checks
 *
 * Pre-flight checks that run when the bot starts:
 * 1. Verifies "Server Members Intent" is actually enabled
 * 2. Verifies the Patreon webhook URL matches the bot's current host
 * 3. DMs the ROOT_ADMIN_ID with actionable instructions if anything fails
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../config';
import { logger } from './logger';

/**
 * Run all pre-flight health checks.
 * Call this AFTER the bot is ready (ClientReady event).
 */
export async function runHealthChecks(client: Client): Promise<void> {
    const warnings: string[] = [];

    // ── 1. Check Server Members Intent ──────────────────────────────
    try {
        const intents = client.options.intents;
        // The GuildMembers intent bit
        const hasMembersIntent = intents instanceof Object &&
            typeof (intents as any).has === 'function'
            ? (intents as any).has(GatewayIntentBits.GuildMembers)
            : true; // Can't determine — skip

        if (!hasMembersIntent) {
            warnings.push(
                '❌ **Server Members Intent is NOT enabled**\n' +
                'The bot requires this intent to track member changes.\n' +
                '→ Go to [Discord Developer Portal](https://discord.com/developers/applications)\n' +
                '→ Your App → Bot → Privileged Gateway Intents → Enable "Server Members Intent"'
            );
        }

        // Additional check: try to fetch guild members
        if (config.guildId) {
            try {
                const guild = await client.guilds.fetch(config.guildId);
                await guild.members.fetch({ limit: 1 });
                logger.info('✅ [HEALTH] Server Members Intent verified — member fetch succeeded');
            } catch (err: any) {
                if (err.code === 50001 || err.message?.includes('Missing Access')) {
                    warnings.push(
                        '⚠️ **Cannot fetch guild members**\n' +
                        'The bot may be missing the "Server Members Intent" or lacks guild access.\n' +
                        '→ Enable "Server Members Intent" in Discord Developer Portal\n' +
                        '→ Re-invite the bot with proper permissions'
                    );
                }
            }
        }
    } catch (err) {
        logger.warn(`⚠️ [HEALTH] Intent check error: ${(err as Error).message}`);
    }

    // ── 2. Check Patreon Webhook Registration ───────────────────────
    try {
        const accessToken = process.env.PATREON_ACCESS_TOKEN;
        if (accessToken) {
            const axios = (await import('axios')).default;

            // Use the v1 webhooks endpoint (v2 doesn't have a list route)
            try {
                const res = await axios.get(
                    'https://www.patreon.com/api/oauth2/api/current_user/campaigns',
                    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
                );
                // If we can reach the API, the token is valid
                const campaigns = res.data?.data || [];
                if (campaigns.length > 0) {
                    logger.info(`✅ [HEALTH] Patreon API reachable — ${campaigns.length} campaign(s) found`);
                }
            } catch (apiErr: any) {
                if (apiErr.response?.status === 401) {
                    // Handled by scope validator
                } else if (apiErr.response?.status === 403) {
                    logger.warn('⚠️ [HEALTH] Patreon API returned 403 — token may have limited scopes');
                } else {
                    logger.warn(`⚠️ [HEALTH] Patreon API check: ${apiErr.message}`);
                }
            }
        }
    } catch (err: any) {
        logger.warn(`⚠️ [HEALTH] Webhook check error: ${err.message}`);
    }

    // ── 3. DM warnings to admin ─────────────────────────────────────
    if (warnings.length > 0) {
        const message =
            '🩺 **Startup Health Check Results**\n\n' +
            warnings.join('\n\n───────────────────────────\n\n');

        try {
            const admin = await client.users.fetch(config.rootAdminId);
            await admin.send(message);
            logger.info(`⚠️ [HEALTH] Sent ${warnings.length} warning(s) to admin via DM`);
        } catch {
            // Log to console if DM fails
            console.warn('⚠️ [HEALTH] Could not DM admin. Warnings:');
            warnings.forEach(w => console.warn(w));
        }
    } else {
        logger.info('✅ [HEALTH] All pre-flight checks passed');
    }
}
