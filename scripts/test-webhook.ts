#!/usr/bin/env ts-node

/**
 * HMAC Webhook Test Script
 *
 * Generates a mock Patreon webhook payload, signs it with WEBHOOK_SECRET,
 * and sends it to your live webhook endpoint for end-to-end testing.
 *
 * Usage:
 *   npm run test:webhook
 *   npm run test:webhook -- --url https://your-domain.com/webhooks/patreon
 *   npm run test:webhook -- --event posts:publish
 */

import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import axios from 'axios';

dotenv.config();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.WEBHOOK_PORT || 3000}`;

// Parse CLI arguments
const args = process.argv.slice(2);
let targetUrl = `${PUBLIC_URL}/webhooks/patreon`;
let eventType = 'posts:publish';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) targetUrl = args[++i];
    if (args[i] === '--event' && args[i + 1]) eventType = args[++i];
}

// Mock payloads for different event types
const mockPayloads: Record<string, any> = {
    'posts:publish': {
        data: {
            id: 'test-post-' + Date.now(),
            type: 'post',
            attributes: {
                title: 'Test Post from HMAC Script',
                content: '<p>This is a test post sent by the HMAC webhook test script.</p>',
                is_paid: true,
                is_public: false,
                published_at: new Date().toISOString(),
                url: 'https://www.patreon.com/posts/test',
                min_cents_pledged_to_view: 500,
                teaser_text: 'Test post teaser text',
            },
            relationships: {
                campaign: { data: { id: process.env.PATREON_CAMPAIGN_ID || 'test-campaign', type: 'campaign' } },
            },
        },
        included: [],
        links: {},
    },
    'posts:update': {
        data: {
            id: 'test-post-update-' + Date.now(),
            type: 'post',
            attributes: {
                title: 'Updated Test Post',
                content: '<p>This is an updated test post.</p>',
                is_paid: true,
                is_public: false,
                published_at: new Date().toISOString(),
                url: 'https://www.patreon.com/posts/test',
                min_cents_pledged_to_view: 500,
            },
            relationships: {
                campaign: { data: { id: process.env.PATREON_CAMPAIGN_ID || 'test-campaign', type: 'campaign' } },
            },
        },
        included: [],
        links: {},
    },
    'members:create': {
        data: {
            id: 'test-member-' + Date.now(),
            type: 'member',
            attributes: {
                full_name: 'Test Patron',
                email: 'test@example.com',
                patron_status: 'active_patron',
                currently_entitled_amount_cents: 500,
                pledge_relationship_start: new Date().toISOString(),
            },
            relationships: {
                campaign: { data: { id: process.env.PATREON_CAMPAIGN_ID || 'test-campaign', type: 'campaign' } },
                currently_entitled_tiers: { data: [] },
                user: { data: { id: 'test-user-id', type: 'user' } },
            },
        },
        included: [],
        links: {},
    },
    'members:delete': {
        data: {
            id: 'test-member-delete-' + Date.now(),
            type: 'member',
            attributes: {
                full_name: 'Departing Patron',
                patron_status: 'declined_patron',
                currently_entitled_amount_cents: 0,
            },
            relationships: {
                campaign: { data: { id: process.env.PATREON_CAMPAIGN_ID || 'test-campaign', type: 'campaign' } },
                currently_entitled_tiers: { data: [] },
                user: { data: { id: 'test-user-departing', type: 'user' } },
            },
        },
        included: [],
        links: {},
    },
};

async function main(): Promise<void> {
    if (!WEBHOOK_SECRET) {
        console.error('❌ WEBHOOK_SECRET not set in .env');
        process.exit(1);
    }

    const payload = mockPayloads[eventType];
    if (!payload) {
        console.error(`❌ Unknown event type: ${eventType}`);
        console.error(`   Available: ${Object.keys(mockPayloads).join(', ')}`);
        process.exit(1);
    }

    const body = JSON.stringify(payload);
    const signature = crypto
        .createHmac('md5', WEBHOOK_SECRET)
        .update(body)
        .digest('hex');

    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  🧪 HMAC Webhook Test Script');
    console.log('═══════════════════════════════════════════════');
    console.log('');
    console.log(`  Target:    ${targetUrl}`);
    console.log(`  Event:     ${eventType}`);
    console.log(`  Signature: ${signature.substring(0, 16)}...`);
    console.log(`  Payload:   ${body.length} bytes`);
    console.log('');

    try {
        const res = await axios.post(targetUrl, body, {
            headers: {
                'Content-Type': 'application/json',
                'X-Patreon-Event': eventType,
                'X-Patreon-Signature': signature,
            },
            timeout: 10000,
            validateStatus: () => true, // Don't throw on non-2xx so we can see the response
        });

        const statusEmoji = res.status >= 200 && res.status < 300 ? '✅' : '⚠️';
        console.log(`  ${statusEmoji} Response: ${res.status} ${res.statusText}`);

        if (res.data) {
            console.log(`  Body: ${JSON.stringify(res.data).substring(0, 200)}`);
        }
    } catch (err: any) {
        if (err.code === 'ECONNREFUSED') {
            console.error('  ❌ Connection refused — is the bot running?');
            console.error(`     Make sure the bot is listening on ${targetUrl}`);
        } else {
            console.error(`  ❌ Request failed: ${err.message}`);
        }
    }

    console.log('');
}

main();
