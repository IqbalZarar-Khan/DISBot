import express from 'express';
import { setupWizardRouter } from '../src/webhooks/wizard';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Force load env for local tool
const ENV_PATH = path.join(process.cwd(), '.env');
if (fs.existsSync(ENV_PATH)) {
    dotenv.config({ path: ENV_PATH });
}

const PORT = 3456;
const app = express();

app.use(express.json());

// For local mode, inject ?mode=local so it bypasses Discord token auth
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.query.mode) {
        req.query.mode = 'local';
    }
    next();
});

app.use('/wizard', setupWizardRouter);

console.log(`\n🧙 Setup Wizard starting on http://localhost:${PORT}/wizard?mode=local\n`);
app.listen(PORT, () => {
    console.log(`✅ Open your browser to: http://localhost:${PORT}/wizard?mode=local`);
    console.log(`   Press Ctrl+C to stop the wizard.\n`);
});
