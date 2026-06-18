import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import formbody from '@fastify/formbody';
import { setupWizardPlugin } from '../src/webhooks/wizard';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Force load env for local tool
const ENV_PATH = path.join(process.cwd(), '.env');
if (fs.existsSync(ENV_PATH)) {
    dotenv.config({ path: ENV_PATH });
}

const PORT = 3456;
const fastify = Fastify();

fastify.register(formbody);

// For local mode, inject ?mode=local so it bypasses Discord token auth
fastify.addHook('onRequest', async (req: FastifyRequest, _reply: FastifyReply) => {
    if (req.method === 'GET' && req.url.startsWith('/wizard')) {
        const query = req.query as Record<string, string>;
        if (!query.mode) {
            query.mode = 'local';
        }
    }
});

fastify.register(setupWizardPlugin, { prefix: '/wizard' });

const start = async () => {
    console.log(`\n🧙 Starting Setup Wizard on a public tunnel...`);
    
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        
        try {
            const localtunnel = require('localtunnel');
            const tunnel = await localtunnel({ port: PORT });
            
            console.log(`\n✅ Setup Wizard is live!`);
            console.log(`   🌍 Open this URL in your browser to begin:`);
            console.log(`   ▶️  ${tunnel.url}/wizard?mode=local\n`);
            console.log(`   (This public URL allows Patreon to securely link your account)`);
            
            tunnel.on('close', () => {
                console.log('\n🚇 Tunnel closed.');
            });
            
        } catch (e: any) {
            console.error(`\n❌ Failed to create public tunnel: ${e.message}`);
            console.error(`⚠️  Please ensure 'localtunnel' is installed by running: npm install --save-dev localtunnel`);
            process.exit(1);
        }

        console.log(`\n   Press Ctrl+C to stop the wizard.\n`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

start();
