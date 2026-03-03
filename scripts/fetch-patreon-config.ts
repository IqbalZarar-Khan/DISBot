#!/usr/bin/env ts-node

/**
 * Patreon Setup Script
 *
 * Fetches your Campaign ID and Tier configuration from the Patreon API
 * using your Creator Access Token, and writes them directly to Supabase.
 *
 * Usage:
 *   npm run setup:patreon
 *
 * Prerequisites:
 *   Set these in your .env file:
 *     - PATREON_ACCESS_TOKEN (from Patreon Developer Portal)
 *     - SUPABASE_URL (your Supabase project URL)
 *     - SUPABASE_KEY (your Supabase service role key)
 */

import * as dotenv from 'dotenv';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

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
    console.log('   🔧  Patreon Setup — Fetch & Sync Tiers');
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
    const step = tiers.length > 1 ? Math.floor(100 / (tiers.length - 1)) : 0;

    const tierConfig = tiers.map((tier: any, i: number) => ({
        name: tier.attributes.title.trim().replace(/\.+$/, ''),
        id: tier.id,
        rank: tiers.length === 1 ? 100 : Math.max(100 - i * step, 0),
        cents: tier.attributes.amount_cents,
    }));

    const json = JSON.stringify(tierConfig);

    // ── 4. Write to Supabase (if configured) ─────────────────────────
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (supabaseUrl && supabaseKey) {
        console.log('');
        console.log('📦 Writing tier config to Supabase...');

        try {
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Save TIER_CONFIG and CAMPAIGN_ID to bot_config
            await supabase.from('bot_config').upsert([
                { key: 'TIER_CONFIG', value: json },
                { key: 'PATREON_CAMPAIGN_ID', value: campaignId },
            ], { onConflict: 'key' });

            // Save each tier to tier_mappings (preserve existing channel_id)
            for (const tier of tierConfig) {
                const { data: existing } = await supabase
                    .from('tier_mappings')
                    .select('channel_id')
                    .eq('tier_id', tier.id)
                    .single();

                await supabase.from('tier_mappings').upsert({
                    tier_id: tier.id,
                    tier_name: tier.name,
                    tier_rank: tier.rank,
                    channel_id: existing?.channel_id || '',
                }, { onConflict: 'tier_id' });
            }

            console.log(`✅ Wrote ${tierConfig.length} tier(s) to Supabase tier_mappings table`);
            console.log(`✅ Saved TIER_CONFIG and CAMPAIGN_ID to bot_config table`);
            console.log('');
            console.log('   🎉 Database is fully configured — no .env edits needed for tiers!');
            console.log('   💡 Use /admin sync-tiers in Discord to refresh tiers later.');

        } catch (err: any) {
            console.error(`⚠️  Failed to write to Supabase: ${err.message}`);
            console.error('   Falling back to manual .env output below.');
        }
    } else {
        console.log('');
        console.log('⚠️  SUPABASE_URL / SUPABASE_KEY not set — skipping database write.');
        console.log('   Set them in .env to auto-sync tiers to Supabase.');
    }

    // ── 5. Auto-write to .env file ──────────────────────────────────
    const fs = await import('fs');
    const path = await import('path');
    const crypto = await import('crypto');
    const envPath = path.join(process.cwd(), '.env');

    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('   📝  Auto-Writing to .env');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    // Read existing .env
    let existingEnv: Record<string, string> = {};
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        for (const line of envContent.split('\n')) {
            const match = line.match(/^([^#=]+)=(.*)$/);
            if (match) existingEnv[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
        }
    }

    // Set values
    existingEnv['PATREON_CAMPAIGN_ID'] = campaignId;
    existingEnv['TIER_CONFIG'] = json;

    // Auto-generate WEBHOOK_SECRET if missing
    if (!existingEnv['WEBHOOK_SECRET']) {
        existingEnv['WEBHOOK_SECRET'] = crypto.randomBytes(32).toString('hex');
        console.log('🔑 Auto-generated WEBHOOK_SECRET');
    }

    // Write .env
    const newEnv = Object.entries(existingEnv)
        .map(([k, v]) => {
            if (v.includes(' ') || v.includes('{') || v.includes('[')) {
                return `${k}='${v}'`;
            }
            return `${k}=${v}`;
        })
        .join('\n');
    fs.writeFileSync(envPath, newEnv + '\n');

    console.log(`✅ Written PATREON_CAMPAIGN_ID=${campaignId} to .env`);
    console.log(`✅ Written TIER_CONFIG with ${tierConfig.length} tier(s) to .env`);
    console.log('');
    console.log('   Auto-assigned ranks (highest price = 100):');
    tierConfig.forEach((t: any) => {
        console.log(`     ${t.name}: rank ${t.rank}  ($${(t.cents / 100).toFixed(2)})`);
    });
    console.log('');
}

main().catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
});
