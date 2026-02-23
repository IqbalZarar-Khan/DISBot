#!/usr/bin/env ts-node

/**
 * Patreon Setup Script
 *
 * Fetches your Campaign ID and Tier configuration from the Patreon API
 * using your Creator Access Token.
 *
 * Usage:
 *   npm run setup:patreon
 *
 * Prerequisites:
 *   Set PATREON_ACCESS_TOKEN in your .env file.
 *
 *   How to get it:
 *     1. Go to https://www.patreon.com/portal/registration/register-clients
 *     2. Click on your existing client (or create one first)
 *     3. Copy the "Creator's Access Token" value
 *     4. Paste it into your .env: PATREON_ACCESS_TOKEN=<your_token>
 */

import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';

async function main(): Promise<void> {
    const token = process.env.PATREON_ACCESS_TOKEN;

    if (!token) {
        console.error('');
        console.error('❌ PATREON_ACCESS_TOKEN is not set in your .env file.');
        console.error('');
        console.error('   How to get it:');
        console.error('   1. Go to https://www.patreon.com/portal/registration/register-clients');
        console.error('   2. Click on your client (or create one)');
        console.error('   3. Copy the "Creator\'s Access Token"');
        console.error('   4. Add to .env:  PATREON_ACCESS_TOKEN=your_token_here');
        console.error('');
        process.exit(1);
    }

    const headers = { Authorization: `Bearer ${token}` };

    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('   🔧  Patreon Setup — Fetch Tier Config');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    // ── 1. Fetch campaign + tiers in one call ────────────────────────
    console.log('📡 Connecting to Patreon API...');

    let campaignId: string;
    let campaignName: string;
    let tiers: any[];

    try {
        const res = await axios.get(`${PATREON_API}/campaigns`, {
            headers,
            params: {
                'include': 'tiers',
                'fields[campaign]': 'creation_name,patron_count',
                'fields[tier]': 'title,amount_cents,published,patron_count',
            },
        });

        const campaigns = res.data.data;
        if (!campaigns || campaigns.length === 0) {
            console.error('❌ No campaigns found. Make sure you are using a Creator Access Token.');
            process.exit(1);
        }

        campaignId = campaigns[0].id;
        campaignName = campaigns[0].attributes?.creation_name || 'Unnamed';
        const patronCount = campaigns[0].attributes?.patron_count ?? 0;

        console.log(`✅ Campaign: "${campaignName}" (ID: ${campaignId}, ${patronCount} patrons)`);

        // Extract tiers from the included array
        tiers = (res.data.included || [])
            .filter((item: any) => item.type === 'tier' && item.attributes?.published !== false)
            .sort((a: any, b: any) => b.attributes.amount_cents - a.attributes.amount_cents);

        if (tiers.length === 0) {
            console.error('❌ No published tiers found for this campaign.');
            process.exit(1);
        }

        console.log(`✅ Found ${tiers.length} published tier(s)`);

    } catch (err: any) {
        if (err.response?.status === 401) {
            console.error('❌ 401 Unauthorized — your token is invalid or expired.');
            console.error('   Get a fresh Creator Access Token from:');
            console.error('   https://www.patreon.com/portal/registration/register-clients');
        } else if (err.response?.status === 403) {
            console.error('❌ 403 Forbidden — token lacks required permissions.');
        } else {
            console.error(`❌ API request failed: ${err.message}`);
        }
        process.exit(1);
    }

    // ── 2. Display tier table ────────────────────────────────────────
    console.log('');
    console.log('   ┌───┬──────────────────────┬──────────┬─────────┬────────────────┐');
    console.log('   │ # │ Tier Name            │ Price    │ Patrons │ Patreon ID     │');
    console.log('   ├───┼──────────────────────┼──────────┼─────────┼────────────────┤');

    tiers.forEach((tier: any, i: number) => {
        const name = (tier.attributes.title || 'Untitled').padEnd(20).slice(0, 20);
        const price = `$${(tier.attributes.amount_cents / 100).toFixed(2)}`.padEnd(8);
        const patrons = String(tier.attributes.patron_count ?? 0).padEnd(7);
        const id = tier.id.padEnd(14);
        console.log(`   │ ${i + 1} │ ${name} │ ${price} │ ${patrons} │ ${id} │`);
    });

    console.log('   └───┴──────────────────────┴──────────┴─────────┴────────────────┘');

    // ── 3. Generate TIER_CONFIG with auto-assigned ranks ─────────────
    // Highest-priced tier = rank 100, then evenly spaced down
    const step = tiers.length > 1 ? Math.floor(100 / (tiers.length - 1)) : 0;

    const tierConfig = tiers.map((tier: any, i: number) => ({
        name: tier.attributes.title.trim().replace(/\.+$/, ''),
        id: tier.id,
        rank: tiers.length === 1 ? 100 : Math.max(100 - i * step, 0),
        cents: tier.attributes.amount_cents,
    }));

    const json = JSON.stringify(tierConfig);

    // ── 4. Output ready-to-copy .env values ──────────────────────────
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('   📋  Copy these into your .env file:');
    console.log('═══════════════════════════════════════════════');
    console.log('');
    console.log(`PATREON_CAMPAIGN_ID=${campaignId}`);
    console.log('');
    console.log(`TIER_CONFIG='${json}'`);
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('');
    console.log('   Auto-assigned ranks (highest price = 100):');
    tierConfig.forEach((t: any) => {
        console.log(`     ${t.name}: rank ${t.rank}  ($${(t.cents / 100).toFixed(2)})`);
    });
    console.log('');
    console.log('   💡 Adjust ranks in .env if the order isn\'t right.');
    console.log('   💡 After updating .env, restart the bot.');
    console.log('');
}

main().catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
});
