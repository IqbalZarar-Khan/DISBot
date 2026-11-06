#!/usr/bin/env ts-node

/**
 * Auto-Cloudflare Tunnel Webhook Updater
 *
 * Creates or detects a Cloudflare Tunnel, extracts the public HTTPS URL,
 * and pushes it to Patreon's webhook configuration — providing a reliable,
 * free, and portable webhook endpoint without requiring ngrok.
 *
 * Usage:
 *   npm run dev:cloudflare
 *
 * Prerequisites:
 *   - 'cloudflared' installed locally (or CLOUDFLARE_TUNNEL_URL set in .env)
 *   - .env with PATREON_ACCESS_TOKEN, PATREON_CAMPAIGN_ID (optional for auto-update)
 *
 * How it works:
 *   1. Starts or connects to a Cloudflare Tunnel (Quick Tunnel or Named Tunnel)
 *   2. Extracts the public HTTPS URL (e.g. https://xxx.trycloudflare.com)
 *   3. Lists and auto-updates the Patreon webhook URI for your campaign
 *   4. Starts the bot in development mode
 */

import * as dotenv from 'dotenv';
import axios from 'axios';
import { spawn, ChildProcess, execSync } from 'child_process';

dotenv.config();

const PORT = parseInt(process.env.WEBHOOK_PORT || process.env.BOT_PORT || '3000', 10);
const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';
const WEBHOOK_PATH = '/webhooks/patreon';

let cloudflaredProcess: ChildProcess | null = null;

/**
 * Check if the cloudflared binary is installed and executable in PATH
 */
function isCloudflaredInstalled(): boolean {
    try {
        const cmd = process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared';
        execSync(cmd, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Start a Cloudflare Quick Tunnel (or run with TUNNEL_TOKEN) and parse the public URL
 */
async function startCloudflareTunnel(): Promise<string> {
    const tunnelToken = process.env.TUNNEL_TOKEN || process.env.CLOUDFLARE_TUNNEL_TOKEN;

    return new Promise((resolve, reject) => {
        const args = tunnelToken
            ? ['tunnel', '--no-autoupdate', 'run', '--token', tunnelToken]
            : ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'];

        console.log(`🚇 Starting Cloudflare Tunnel (pointing to http://localhost:${PORT})...`);
        const proc = spawn('cloudflared', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        cloudflaredProcess = proc;

        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                proc.kill();
                reject(new Error('Timed out waiting for Cloudflare Tunnel URL (30s)'));
            }
        }, 30000);

        const checkOutput = (data: Buffer) => {
            const text = data.toString();
            // Cloudflare Quick Tunnels output URLs ending in .trycloudflare.com
            const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match && !resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(match[0]);
            }
        };

        proc.stdout?.on('data', checkOutput);
        proc.stderr?.on('data', checkOutput);

        proc.on('error', (err) => {
            if (!resolved) {
                clearTimeout(timeout);
                reject(err);
            }
        });

        proc.on('exit', (code) => {
            if (!resolved) {
                clearTimeout(timeout);
                reject(new Error(`cloudflared exited prematurely with code ${code}`));
            }
        });
    });
}

/**
 * Resolve Cloudflare Tunnel URL via config, active tunnel, or spawning cloudflared
 */
async function getCloudflareUrl(): Promise<string> {
    // 1. Check explicit environment variable first
    const explicitUrl = process.env.CLOUDFLARE_TUNNEL_URL || process.env.CLOUDFLARE_URL;
    if (explicitUrl) {
        return explicitUrl.replace(/\/+$/, '');
    }

    // 2. Check if cloudflared is installed
    if (!isCloudflaredInstalled()) {
        console.error('\n❌ Could not find `cloudflared` command in your PATH.');
        console.error('\n   To install Cloudflare Tunnel:');
        console.error('     • Windows (winget):  winget install --id Cloudflare.cloudflared');
        console.error('     • Windows (choco):   choco install cloudflared');
        console.error('     • macOS (brew):      brew install cloudflared');
        console.error('     • Linux:             https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
        console.error('\n   Alternatively, set CLOUDFLARE_TUNNEL_URL in your .env if your tunnel runs externally:');
        console.error('     CLOUDFLARE_TUNNEL_URL=https://webhook.yourdomain.com\n');
        process.exit(1);
    }

    // 3. Spawn cloudflared quick tunnel
    try {
        return await startCloudflareTunnel();
    } catch (err: any) {
        console.error(`\n❌ Failed to start Cloudflare Tunnel: ${err.message}`);
        process.exit(1);
    }
}

async function getPatreonWebhookId(token: string, campaignId: string): Promise<string | null> {
    try {
        const res = await axios.get(`${PATREON_API}/webhooks`, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                'filter[campaign_id]': campaignId,
            },
            timeout: 5000,
        });

        const webhooks = res.data.data || [];
        if (webhooks.length === 0) return null;
        return webhooks[0].id;
    } catch {
        try {
            const res = await axios.get(
                `${PATREON_API}/campaigns/${campaignId}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { include: 'webhooks' },
                    timeout: 5000,
                }
            );

            const included = res.data.included || [];
            const webhook = included.find((item: any) => item.type === 'webhook');
            return webhook?.id || null;
        } catch {
            return null;
        }
    }
}

async function updateWebhookUrl(token: string, webhookId: string, newUrl: string): Promise<boolean> {
    try {
        await axios.patch(
            `${PATREON_API}/webhooks/${webhookId}`,
            {
                data: {
                    type: 'webhook',
                    id: webhookId,
                    attributes: {
                        uri: newUrl,
                    },
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                timeout: 5000,
            }
        );
        return true;
    } catch (err: any) {
        console.error(`❌ Failed to update webhook: ${err.response?.data?.errors?.[0]?.detail || err.message}`);
        return false;
    }
}

async function main(): Promise<void> {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('   ☁️   Auto-Cloudflare Webhook Tunnel');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    // Ensure child cloudflared process is cleaned up on exit
    const cleanup = () => {
        if (cloudflaredProcess && !cloudflaredProcess.killed) {
            console.log('\n🚇 Closing Cloudflare Tunnel...');
            try {
                cloudflaredProcess.kill();
            } catch {
                // Ignore
            }
        }
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);

    // ── 1. Obtain Cloudflare Tunnel URL ─────────────────────────
    const tunnelUrl = await getCloudflareUrl();
    const webhookUrl = `${tunnelUrl}${WEBHOOK_PATH}`;

    console.log(`✅ Cloudflare Tunnel URL: ${tunnelUrl}`);
    console.log(`✅ Webhook Endpoint:     ${webhookUrl}\n`);

    // ── 2. Optionally update Patreon Webhook via API ─────────────
    const token = process.env.PATREON_ACCESS_TOKEN;
    const campaignId = process.env.PATREON_CAMPAIGN_ID;

    if (token && campaignId) {
        console.log('🔍 Looking for Patreon webhook configuration...');
        const webhookId = await getPatreonWebhookId(token, campaignId);

        if (webhookId) {
            console.log(`✅ Found webhook ID: ${webhookId}`);
            console.log(`📤 Updating webhook URI to: ${webhookUrl}`);
            const updated = await updateWebhookUrl(token, webhookId, webhookUrl);

            if (updated) {
                console.log('✅ Webhook URL successfully updated on Patreon!\n');
                console.log('   ┌────────────────────────────────────────────────────────┐');
                console.log(`   │  Patreon → ${webhookUrl.padEnd(43)} │`);
                console.log('   └────────────────────────────────────────────────────────┘\n');
            } else {
                console.warn('⚠️  Could not auto-update Patreon webhook. Please set it manually in portal:');
                console.warn(`   ${webhookUrl}\n`);
            }
        } else {
            console.log('⚠️  No existing webhook found for this campaign.');
            console.log(`   Create one in the Patreon Developer Portal with URL:`);
            console.log(`   ▶️  ${webhookUrl}\n`);
        }
    } else {
        console.log('💡 Note: Set PATREON_ACCESS_TOKEN and PATREON_CAMPAIGN_ID in .env to enable automatic webhook updates.');
        console.log(`   Set this URL as your Patreon webhook:`);
        console.log(`   ▶️  ${webhookUrl}\n`);
    }

    // ── 3. Start the bot in development mode ─────────────────────
    console.log('═══════════════════════════════════════════════');
    console.log('   🚀  Starting bot in development mode...');
    console.log('═══════════════════════════════════════════════\n');

    execSync('npx nodemon --exec ts-node src/index.ts', { stdio: 'inherit' });
}

main().catch((err) => {
    console.error('❌ Unexpected error in Cloudflare tunnel runner:', err);
    process.exit(1);
});
