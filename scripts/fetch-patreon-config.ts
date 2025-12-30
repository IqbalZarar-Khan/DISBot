// scripts/fetch-patreon-config.ts
import * as dotenv from 'dotenv';
dotenv.config();

const PATREON_ACCESS_TOKEN = process.env.PATREON_ACCESS_TOKEN;

if (!PATREON_ACCESS_TOKEN) {
    console.error('❌ Error: PATREON_ACCESS_TOKEN is missing from your .env file.');
    process.exit(1);
}

async function fetchPatreonConfig() {
    console.log('🔄 Connecting to Patreon API...');

    try {
        // 1. Fetch Campaign and Tier Data
        // We request the campaign and include the 'tiers' resource with specific fields
        const response = await fetch(
            'https://www.patreon.com/api/oauth2/v2/campaigns?include=tiers&fields[tier]=title,amount_cents',
            {
                headers: {
                    'Authorization': `Bearer ${PATREON_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.data || data.data.length === 0) {
            console.error('❌ No campaign found for this access token.');
            return;
        }

        // 2. Extract Campaign ID
        const campaign = data.data[0]; // Assuming the user has one main campaign
        const campaignId = campaign.id;

        // 3. Extract and Format Tiers
        // Patreon V2 API returns included resources in a separate 'included' array
        const tiers = data.included
            ? data.included.filter((item: any) => item.type === 'tier')
            : [];

        // Map to the format required by TIER_CONFIG
        const tierConfig = tiers.map((tier: any, index: number) => ({
            name: tier.attributes.title,
            id: tier.id,
            rank: 0, // Placeholder: User must define priority
            cents: tier.attributes.amount_cents
        })).sort((a: any, b: any) => b.cents - a.cents); // Sort by price (high to low)

        // 4. Output the Results
        console.log('\n✅ SUCCESS! Here is your configuration data:\n');
        console.log('================================================');
        console.log('# Add this to your .env file:');
        console.log('================================================');
        console.log(`PATREON_CAMPAIGN_ID=${campaignId}`);
        console.log('\n================================================');
        console.log('# Copy this into your TIER_CONFIG variable:');
        console.log('================================================');
        console.log(`TIER_CONFIG='${JSON.stringify(tierConfig)}'`);
        console.log('\n================================================');
        console.log('⚠️  IMPORTANT: Update the "rank" values!');
        console.log('================================================');
        console.log('The "rank" for all tiers is currently set to 0.');
        console.log('Please manually update the "rank" in the JSON:');
        console.log('  - Higher rank = Higher tier (e.g., 100 for Diamond)');
        console.log('  - Lower rank = Lower tier (e.g., 25 for Bronze)');
        console.log('  - Free tier = 0');
        console.log('\nExample:');
        console.log('  Diamond: rank 100');
        console.log('  Gold: rank 75');
        console.log('  Silver: rank 50');
        console.log('  Bronze: rank 25');
        console.log('================================================\n');

        // 5. Display tier details for reference
        console.log('📊 Tier Details (sorted by price):');
        console.log('================================================');
        tierConfig.forEach((tier: any, index: number) => {
            const dollars = (tier.cents / 100).toFixed(2);
            console.log(`${index + 1}. ${tier.name}`);
            console.log(`   ID: ${tier.id}`);
            console.log(`   Price: $${dollars}/month (${tier.cents} cents)`);
            console.log(`   Rank: ${tier.rank} ⚠️ UPDATE THIS!`);
            console.log('');
        });
        console.log('================================================\n');

    } catch (error) {
        console.error('❌ Failed to fetch data:', error);
        console.error('\nTroubleshooting:');
        console.error('1. Verify your PATREON_ACCESS_TOKEN is valid');
        console.error('2. Ensure the token has "campaigns" and "campaigns.members" scopes');
        console.error('3. Check your internet connection');
    }
}

fetchPatreonConfig();
