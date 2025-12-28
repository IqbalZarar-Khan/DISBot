#!/usr/bin/env node

/**
 * Manual test script for webhook handlers
 * Run with: ts-node src/tests/manual-webhook-test.ts
 */

import { config, validateConfig } from '../config';
import { initDatabase } from '../database/db';
import { mockWebhookPayloads, testWebhookEndpoint } from '../utils/testHelpers';

async function runTests() {
    console.log('🧪 Starting Manual Webhook Tests\n');

    try {
        // Validate configuration
        console.log('1️⃣ Validating configuration...');
        validateConfig();
        console.log('✅ Configuration valid\n');

        // Initialize Supabase and database
        console.log('2️⃣ Initializing database...');
        const { initSupabase } = await import('../database/supabase');
        initSupabase();
        await initDatabase();
        console.log('✅ Database initialized\n');

        // Test webhook endpoint
        const webhookUrl = `http://localhost:${config.webhookPort}/webhooks/patreon`;
        console.log(`3️⃣ Testing webhook endpoint: ${webhookUrl}\n`);

        // Test 1: Members Create
        console.log('📝 Test 1: members:create');
        const test1 = await testWebhookEndpoint(
            webhookUrl,
            'members:create',
            mockWebhookPayloads.membersCreate,
            config.webhookSecret
        );
        console.log(test1 ? '✅ PASSED' : '❌ FAILED');
        console.log('');

        // Test 2: Posts Publish
        console.log('📝 Test 2: posts:publish');
        const test2 = await testWebhookEndpoint(
            webhookUrl,
            'posts:publish',
            mockWebhookPayloads.postsPublish,
            config.webhookSecret
        );
        console.log(test2 ? '✅ PASSED' : '❌ FAILED');
        console.log('');

        // Test 3: Posts Update (Waterfall)
        console.log('📝 Test 3: posts:update (waterfall: Diamond → Gold)');
        const test3 = await testWebhookEndpoint(
            webhookUrl,
            'posts:update',
            mockWebhookPayloads.postsUpdateWaterfall,
            config.webhookSecret
        );
        console.log(test3 ? '✅ PASSED' : '❌ FAILED');
        console.log('');

        // Test 4: Posts Update (No Change)
        console.log('📝 Test 4: posts:update (no tier change)');
        const test4 = await testWebhookEndpoint(
            webhookUrl,
            'posts:update',
            mockWebhookPayloads.postsUpdateNoChange,
            config.webhookSecret
        );
        console.log(test4 ? '✅ PASSED' : '❌ FAILED');
        console.log('');

        // Test 5: Members Update (Upgrade)
        console.log('📝 Test 5: members:update (upgrade)');
        const test5 = await testWebhookEndpoint(
            webhookUrl,
            'members:update',
            mockWebhookPayloads.membersUpdateUpgrade,
            config.webhookSecret
        );
        console.log(test5 ? '✅ PASSED' : '❌ FAILED');
        console.log('');

        // Summary
        const results = [test1, test2, test3, test4, test5];
        const passed = results.filter(r => r).length;
        const total = results.length;

        console.log('═══════════════════════════════════');
        console.log(`📊 Test Summary: ${passed}/${total} passed`);
        console.log('═══════════════════════════════════\n');

        if (passed === total) {
            console.log('🎉 All tests passed!');
            process.exit(0);
        } else {
            console.log('⚠️ Some tests failed. Check the logs above.');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    }
}

// Run tests
runTests();
