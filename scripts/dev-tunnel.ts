#!/usr/bin/env ts-node

/**
 * Zero-Auth Local Tunnel
 *
 * Creates a secure HTTPS tunnel to your local bot without
 * requiring any account sign-ups (unlike ngrok).
 *
 * Uses 'localtunnel' — zero configuration, zero authentication.
 *
 * Usage:
 *   npm run dev:tunnel
 *
 * The tunnel URL is printed and can be used as your Patreon webhook URL.
 */

import * as dotenv from 'dotenv';
dotenv.config();

const PORT = parseInt(process.env.BOT_PORT || '3000', 10);

async function main() {
    console.log('\n🚇 Starting zero-auth local tunnel...\n');

    let localtunnel: any;
    try {
        localtunnel = require('localtunnel');
    } catch {
        console.error('❌ localtunnel not installed. Run:');
        console.error('   npm install --save-dev localtunnel');
        process.exit(1);
    }

    try {
        const tunnel = await localtunnel({ port: PORT });

        console.log('✅ Tunnel is live!\n');
        console.log(`   🌐 Public URL:  ${tunnel.url}`);
        console.log(`   📡 Webhook URL: ${tunnel.url}/webhooks/patreon`);
        console.log(`   🔌 Local port:  ${PORT}\n`);
        console.log('   Set this as your Patreon webhook URL.');
        console.log('   Press Ctrl+C to close the tunnel.\n');

        tunnel.on('close', () => {
            console.log('\n🚇 Tunnel closed.');
            process.exit(0);
        });

        tunnel.on('error', (err: Error) => {
            console.error(`❌ Tunnel error: ${err.message}`);
        });

        // Keep alive
        process.on('SIGINT', () => {
            tunnel.close();
        });

    } catch (err: any) {
        console.error(`❌ Failed to create tunnel: ${err.message}`);
        process.exit(1);
    }
}

main();
