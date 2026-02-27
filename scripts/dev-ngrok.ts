#!/usr/bin/env ts-node

/**
 * Auto-Ngrok Webhook Updater
 *
 * Detects the current ngrok tunnel URL and pushes it to Patreon's
 * webhook configuration, eliminating manual portal updates.
 *
 * Usage:
 *   1. Start ngrok:   ngrok http 3000
 *   2. Run this:      npm run dev:ngrok
 *
 * Prerequisites:
 *   - ngrok running locally (http://127.0.0.1:4040)
 *   - .env with PATREON_ACCESS_TOKEN, PATREON_CAMPAIGN_ID
 *
 * How it works:
 *   1. Polls ngrok's local API for the public HTTPS URL
 *   2. Lists Patreon webhooks for your campaign
 *   3. PATCHes the webhook URI to point to your new ngrok URL
 *   4. Then starts the bot in dev mode
 */

import * as dotenv from 'dotenv';
import axios from 'axios';
import { execSync } from 'child_process';

dotenv.config();

const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';
const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';
const WEBHOOK_PATH = '/webhooks/patreon';

async function getNgrokUrl(retries = 5): Promise<string> {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await axios.get(NGROK_API, { timeout: 2000 });
            const tunnels = res.data.tunnels || [];

            // Prefer HTTPS tunnel
            const https = tunnels.find((t: any) => t.proto === 'https');
            if (https) return https.public_url;

            // Fall back to any tunnel
            if (tunnels.length > 0) return tunnels[0].public_url;
        } catch {
            // ngrok might not be ready yet
        }

        if (i < retries - 1) {
            console.log(`⏳ Waiting for ngrok... (attempt ${i + 1}/${retries})`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.error('');
    console.error('❌ Could not connect to ngrok.');
    console.error('');
    console.error('   Make sure ngrok is running:');
    console.error('     ngrok http 3000');
    console.error('');
    console.error('   Or install it: https://ngrok.com/download');
    console.error('');
    process.exit(1);
}

async function getPatreonWebhookId(token: string, campaignId: string): Promise<string | null> {
    try {
        const res = await axios.get(`${PATREON_API}/webhooks`, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                'filter[campaign_id]': campaignId,
            },
        });

        const webhooks = res.data.data || [];
        if (webhooks.length === 0) return null;

        // Return the first webhook's ID
        return webhooks[0].id;
    } catch (err: any) {
        // The webhooks list endpoint might not work with all token types.
        // Fall back to the campaign's webhook relationships
        try {
            const res = await axios.get(
                `${PATREON_API}/campaigns/${campaignId}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { 'include': 'webhooks' },
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
            }
        );
        return true;
    } catch (err: any) {
        console.error(`❌ Failed to update webhook: ${err.response?.data?.errors?.[0]?.detail || err.message}`);
        return false;
    }
}

async function main(): Promise<void> {
    const token = process.env.PATREON_ACCESS_TOKEN;
    const campaignId = process.env.PATREON_CAMPAIGN_ID;

    if (!token || !campaignId) {
        console.error('❌ PATREON_ACCESS_TOKEN and PATREON_CAMPAIGN_ID must be set in .env');
        process.exit(1);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('   🔄  Auto-Ngrok Webhook Updater');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    // ── 1. Get ngrok URL ─────────────────────────────────────────
    console.log('📡 Detecting ngrok tunnel...');
    const ngrokUrl = await getNgrokUrl();
    const webhookUrl = `${ngrokUrl}${WEBHOOK_PATH}`;
    console.log(`✅ Ngrok URL: ${ngrokUrl}`);
    console.log(`✅ Webhook URL: ${webhookUrl}`);

    // ── 2. Find Patreon webhook ID ───────────────────────────────
    console.log('');
    console.log('🔍 Looking for Patreon webhook...');
    const webhookId = await getPatreonWebhookId(token, campaignId);

    if (!webhookId) {
        console.error('');
        console.error('❌ No webhook found for your campaign.');
        console.error('');
        console.error('   You need to create a webhook first:');
        console.error('   1. Go to https://www.patreon.com/portal/registration/register-clients');
        console.error('   2. Click your app → Webhooks → Add Webhook');
        console.error(`   3. Set the URL to: ${webhookUrl}`);
        console.error('   4. Select triggers: members:create, members:update, members:delete,');
        console.error('      members:pledge:create, members:pledge:update, members:pledge:delete,');
        console.error('      posts:publish, posts:update, posts:delete');
        console.error('');
        console.error('   After creating the webhook, run this script again to auto-update it.');
        console.error('');

        // Still start the bot in dev mode
        console.log('🚀 Starting bot in dev mode anyway...');
        console.log('');
        execSync('npx nodemon --exec ts-node src/index.ts', { stdio: 'inherit' });
        return;
    }

    console.log(`✅ Found webhook ID: ${webhookId}`);

    // ── 3. Update webhook URL ────────────────────────────────────
    console.log('');
    console.log(`📤 Updating webhook URL to: ${webhookUrl}`);
    const success = await updateWebhookUrl(token, webhookId, webhookUrl);

    if (success) {
        console.log('✅ Webhook URL updated on Patreon!');
        console.log('');
        console.log('   ┌─────────────────────────────────────────┐');
        console.log(`   │  Patreon → ${webhookUrl.padEnd(29)} │`);
        console.log('   └─────────────────────────────────────────┘');
    } else {
        console.warn('⚠️  Could not auto-update. You may need to update manually in the Patreon portal.');
        console.warn(`   Set webhook URL to: ${webhookUrl}`);
    }

    // ── 4. Start the bot ─────────────────────────────────────────
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('   🚀  Starting bot in development mode...');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    execSync('npx nodemon --exec ts-node src/index.ts', { stdio: 'inherit' });
}

main().catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
});
