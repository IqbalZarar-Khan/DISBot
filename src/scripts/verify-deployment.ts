#!/usr/bin/env node

/**
 * Deployment verification script
 * Checks all prerequisites before deployment
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { config } from '../config';

interface CheckResult {
    name: string;
    passed: boolean;
    message: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, message: string) {
    results.push({ name, passed, message });
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${name}: ${message}`);
}

async function runChecks() {
    console.log('🔍 Running Deployment Verification Checks\n');
    console.log('═══════════════════════════════════════════\n');

    // 1. Check .env file exists
    const envExists = fs.existsSync('.env');
    check(
        'Environment File',
        envExists,
        envExists ? '.env file found' : '.env file missing - copy from .env.example'
    );

    // 2. Check required environment variables
    const requiredVars = [
        'DISCORD_TOKEN',
        'GUILD_ID',
        'ROOT_ADMIN_ID',
        'PATREON_CLIENT_ID',
        'PATREON_CLIENT_SECRET',
        'PATREON_ACCESS_TOKEN',
        'PATREON_CAMPAIGN_ID',
        'WEBHOOK_SECRET'
    ];

    const missingVars = requiredVars.filter(v => !process.env[v]);
    check(
        'Environment Variables',
        missingVars.length === 0,
        missingVars.length === 0
            ? 'All required variables set'
            : `Missing: ${missingVars.join(', ')}`
    );

    // 3. Check TypeScript compilation
    try {
        const { execSync } = require('child_process');
        execSync('tsc --noEmit', { stdio: 'pipe' });
        check('TypeScript Compilation', true, 'No compilation errors');
    } catch (error) {
        check('TypeScript Compilation', false, 'Compilation errors detected');
    }

    // 4. Check database directory
    const dbPath = config.databasePath || './data/bot.db';
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    check(
        'Database Directory',
        fs.existsSync(dbDir),
        `Directory exists: ${dbDir}`
    );

    // 5. Check Discord token format
    const discordTokenValid = Boolean(config.discordToken && config.discordToken.length > 50);
    check(
        'Discord Token',
        discordTokenValid,
        discordTokenValid ? 'Token format looks valid' : 'Token appears invalid or missing'
    );

    // 6. Check Patreon API connection (if token provided)
    if (config.patreonAccessToken && config.patreonCampaignId) {
        try {
            const response = await axios.get(
                `https://www.patreon.com/api/oauth2/v2/campaigns/${config.patreonCampaignId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${config.patreonAccessToken}`
                    },
                    timeout: 5000
                }
            );

            check(
                'Patreon API Connection',
                response.status === 200,
                'Successfully connected to Patreon API'
            );
        } catch (error: any) {
            check(
                'Patreon API Connection',
                false,
                `Failed: ${error.response?.status || error.message}`
            );
        }
    } else {
        check(
            'Patreon API Connection',
            false,
            'Skipped - access token or campaign ID missing'
        );
    }

    // 7. Check webhook port availability
    const portAvailable = await checkPort(config.webhookPort);
    check(
        'Webhook Port',
        portAvailable,
        portAvailable
            ? `Port ${config.webhookPort} is available`
            : `Port ${config.webhookPort} is in use`
    );

    // 8. Check node_modules
    const nodeModulesExists = fs.existsSync('node_modules');
    check(
        'Dependencies',
        nodeModulesExists,
        nodeModulesExists ? 'node_modules found' : 'Run npm install'
    );

    // Summary
    console.log('\n═══════════════════════════════════════════');
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.log(`\n📊 Results: ${passed}/${total} checks passed\n`);

    if (passed === total) {
        console.log('🎉 All checks passed! Ready for deployment.\n');
        console.log('Next steps:');
        console.log('1. npm run deploy-commands');
        console.log('2. npm run dev (or npm start for production)\n');
        return 0;
    } else {
        console.log('⚠️ Some checks failed. Please fix the issues above.\n');
        return 1;
    }
}

async function checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();

        server.once('error', () => {
            resolve(false);
        });

        server.once('listening', () => {
            server.close();
            resolve(true);
        });

        server.listen(port);
    });
}

// Run checks
runChecks()
    .then(code => process.exit(code))
    .catch(error => {
        console.error('❌ Verification failed:', error);
        process.exit(1);
    });
