import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

const PORT = 3456;
const ENV_PATH = path.join(process.cwd(), '.env');

/**
 * Setup Wizard: a local HTML dashboard for first-time bot configuration.
 * Run with: npm run setup:wizard
 *
 * Provides:
 * - Discord setup checklist with auto-generated invite URL
 * - "Connect Patreon" button (OAuth flow)
 * - "Create Webhook" button (auto-creates via Patreon API)
 * - "Test Supabase" or choose SQLite mode
 * - Auto-generates WEBHOOK_SECRET
 * - Writes/updates .env file
 */

function getExistingEnv(): Record<string, string> {
    if (fs.existsSync(ENV_PATH)) {
        const result = dotenv.parse(fs.readFileSync(ENV_PATH));
        return result;
    }
    return {};
}

function writeEnv(vars: Record<string, string>): void {
    const existing = getExistingEnv();
    const merged = { ...existing, ...vars };
    const content = Object.entries(merged)
        .map(([k, v]) => {
            if (v.includes(' ') || v.includes('{') || v.includes('[')) {
                return `${k}='${v}'`;
            }
            return `${k}=${v}`;
        })
        .join('\n');
    fs.writeFileSync(ENV_PATH, content + '\n');
}

const HTML = `<!DOCTYPE html>
<html>
<head>
    <title>DISBot Setup Wizard</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            color: #e0e0e0; min-height: 100vh; padding: 2rem;
        }
        .container { max-width: 750px; margin: 0 auto; }
        h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #fff; }
        .subtitle { color: #aaa; margin-bottom: 2rem; }
        .card {
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;
            backdrop-filter: blur(10px);
        }
        .card h2 { font-size: 1.2rem; margin-bottom: 1rem; color: #fff; }
        label { display: block; margin-bottom: 0.3rem; font-size: 0.9rem; color: #bbb; }
        input, select {
            width: 100%; padding: 0.6rem; border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px; background: rgba(0,0,0,0.3); color: #fff;
            font-size: 0.9rem; margin-bottom: 1rem;
        }
        button {
            padding: 0.7rem 1.5rem; border: none; border-radius: 8px;
            font-size: 1rem; cursor: pointer; font-weight: 600;
            transition: all 0.2s; margin-right: 0.5rem; margin-bottom: 0.5rem;
        }
        .btn-primary { background: #5865F2; color: #fff; }
        .btn-primary:hover { background: #4752C4; }
        .btn-success { background: #43b581; color: #fff; }
        .btn-success:hover { background: #3aa06e; }
        .btn-warn { background: #faa61a; color: #000; }
        .btn-warn:hover { background: #e09516; }
        .btn-danger { background: #f04747; color: #fff; }
        .btn-danger:hover { background: #d43b3b; }
        .status { padding: 0.8rem; border-radius: 8px; margin-top: 1rem; font-size: 0.9rem; }
        .status.ok { background: rgba(67,181,129,0.2); border: 1px solid #43b581; }
        .status.err { background: rgba(240,71,71,0.2); border: 1px solid #f04747; }
        .status.info { background: rgba(88,101,242,0.2); border: 1px solid #5865F2; }
        .group { display: flex; gap: 1rem; }
        .group > * { flex: 1; }
        .checklist { list-style: none; padding: 0; }
        .checklist li { padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 0.5rem; }
        .checklist li:last-child { border-bottom: none; }
        .check { color: #43b581; font-size: 1.2rem; }
        .hint { color: #888; font-size: 0.8rem; display: block; margin-top: 0.2rem; }
        a { color: #5865F2; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .toggle-group { display: flex; gap: 1rem; margin-bottom: 1rem; }
        .toggle-btn { flex: 1; padding: 0.8rem; text-align: center; border: 2px solid rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: all 0.2s; }
        .toggle-btn.active { border-color: #5865F2; background: rgba(88,101,242,0.2); }
    </style>
</head>
<body>
<div class="container">
    <h1>🤖 DISBot Setup Wizard</h1>
    <p class="subtitle">Configure your bot step-by-step. No terminal needed.</p>

    <!-- Step 1: Discord -->
    <div class="card">
        <h2>1️⃣ Discord Bot Setup</h2>
        <ul class="checklist">
            <li><span class="check">📋</span> <a href="https://discord.com/developers/applications" target="_blank">Create an app</a> in Discord Developer Portal</li>
            <li><span class="check">🔑</span> Go to Bot tab → Reset Token → paste below</li>
            <li><span class="check">✅</span> Enable <strong>Server Members Intent</strong> (Bot → Privileged Gateway Intents)</li>
            <li><span class="check">📨</span> Enable <strong>Message Content Intent</strong> (optional, for keyword detection)</li>
        </ul>
        <label style="margin-top:1rem">Discord Bot Token</label>
        <input id="discordToken" type="password" placeholder="Paste your bot token" />
        <div class="group">
            <div><label>Guild (Server) ID</label><input id="guildId" placeholder="Right-click server → Copy ID" /></div>
            <div><label>Your Discord User ID</label><input id="adminId" placeholder="Right-click your name → Copy ID" /></div>
        </div>
        <label>Discord Client ID (Application ID)</label>
        <input id="discordClientId" placeholder="Found on General Information page" />
        <button class="btn-primary" onclick="generateInvite()">🔗 Generate Invite URL</button>
        <div id="inviteStatus"></div>
    </div>

    <!-- Step 2: Patreon -->
    <div class="card">
        <h2>2️⃣ Patreon OAuth</h2>
        <div class="group">
            <div><label>Client ID</label><input id="patreonClientId" /></div>
            <div><label>Client Secret</label><input id="patreonClientSecret" type="password" /></div>
        </div>
        <button class="btn-primary" onclick="startOAuth()">🔗 Connect to Patreon</button>
        <div id="oauthStatus"></div>
    </div>

    <!-- Step 2.5: Create Webhook -->
    <div class="card">
        <h2>📡 Create Patreon Webhook</h2>
        <p style="margin-bottom:1rem;color:#aaa">After connecting Patreon, auto-create the webhook with all 9 triggers configured.</p>
        <label>Your Production URL (e.g., https://your-app.up.railway.app)</label>
        <input id="webhookUrl" placeholder="https://your-domain.com" />
        <button class="btn-warn" onclick="createWebhook()">⚡ Create Webhook Automatically</button>
        <div id="webhookStatus"></div>
    </div>

    <!-- Step 3: Database -->
    <div class="card">
        <h2>3️⃣ Database</h2>
        <p style="margin-bottom:1rem;color:#aaa">Choose your storage backend:</p>
        <div class="toggle-group">
            <div class="toggle-btn active" id="dbSupabase" onclick="setDbMode('supabase')">☁️ Supabase<span class="hint">Recommended</span></div>
            <div class="toggle-btn" id="dbSqlite" onclick="setDbMode('sqlite')">💾 SQLite<span class="hint">Zero-config local</span></div>
        </div>
        <div id="supabaseFields">
            <label>Supabase URL</label>
            <input id="supabaseUrl" placeholder="https://xxxx.supabase.co" />
            <label>Supabase Service Role Key</label>
            <input id="supabaseKey" type="password" placeholder="eyJ..." />
            <button class="btn-warn" onclick="testSupabase()">🧪 Test Connection</button>
        </div>
        <div id="sqliteFields" style="display:none">
            <div class="status info">SQLite will store data in <code>./data/disbot.sqlite</code>. No external service needed. Leave Supabase fields blank to enable.</div>
        </div>
        <div id="supabaseStatus"></div>
    </div>

    <!-- Step 4: Save -->
    <div class="card">
        <h2>4️⃣ Save Configuration</h2>
        <p style="margin-bottom:1rem;color:#aaa">Writes settings to .env. WEBHOOK_SECRET is auto-generated if missing.</p>
        <button class="btn-success" onclick="saveAll()">💾 Save to .env</button>
        <div id="saveStatus"></div>
    </div>
</div>
<script>
let dbMode = 'supabase';

function setDbMode(mode) {
    dbMode = mode;
    document.getElementById('dbSupabase').className = 'toggle-btn' + (mode === 'supabase' ? ' active' : '');
    document.getElementById('dbSqlite').className = 'toggle-btn' + (mode === 'sqlite' ? ' active' : '');
    document.getElementById('supabaseFields').style.display = mode === 'supabase' ? 'block' : 'none';
    document.getElementById('sqliteFields').style.display = mode === 'sqlite' ? 'block' : 'none';
}

function generateInvite() {
    const clientId = document.getElementById('discordClientId').value;
    if (!clientId) { alert('Enter your Discord Client ID (Application ID) first'); return; }
    // Permissions: Send Messages, Embed Links, Slash Commands, Create Threads, Send in Threads, Attach Files, Read Messages
    const permissions = 326417591296;
    const scopes = 'bot%20applications.commands';
    const url = 'https://discord.com/oauth2/authorize?client_id=' + clientId + '&permissions=' + permissions + '&scope=' + scopes;
    const el = document.getElementById('inviteStatus');
    el.className = 'status ok';
    el.innerHTML = '✅ <a href="' + url + '" target="_blank" style="color:#43b581;font-weight:bold">Click here to invite the bot →</a>';
}

function startOAuth() {
    const clientId = document.getElementById('patreonClientId').value;
    if (!clientId) { alert('Enter your Patreon Client ID first'); return; }
    const redirect = 'http://localhost:${PORT}/wizard/oauth/callback';
    const scopes = 'campaigns campaigns.members campaigns.posts w:campaigns.webhook';
    window.open('https://www.patreon.com/oauth2/authorize?response_type=code&client_id='+clientId+'&redirect_uri='+encodeURIComponent(redirect)+'&scope='+encodeURIComponent(scopes), '_blank');
}

async function createWebhook() {
    const url = document.getElementById('webhookUrl').value;
    const el = document.getElementById('webhookStatus');
    if (!url) { alert('Enter your production URL first'); return; }
    el.className = 'status info'; el.textContent = '⏳ Creating webhook...';
    try {
        const res = await fetch('/wizard/create-webhook', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ webhookBaseUrl: url })
        });
        const data = await res.json();
        el.className = 'status ' + (data.ok ? 'ok' : 'err');
        el.textContent = data.message;
    } catch(e) { el.className='status err'; el.textContent='Request failed'; }
}

async function testSupabase() {
    const url = document.getElementById('supabaseUrl').value;
    const key = document.getElementById('supabaseKey').value;
    const el = document.getElementById('supabaseStatus');
    try {
        const res = await fetch('/wizard/test-supabase', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url,key}) });
        const data = await res.json();
        el.className = 'status ' + (data.ok ? 'ok' : 'err');
        el.textContent = data.message;
    } catch(e) { el.className='status err'; el.textContent='Request failed'; }
}

async function saveAll() {
    const vars = {
        DISCORD_TOKEN: document.getElementById('discordToken').value,
        GUILD_ID: document.getElementById('guildId').value,
        ROOT_ADMIN_ID: document.getElementById('adminId').value,
        PATREON_CLIENT_ID: document.getElementById('patreonClientId').value,
        PATREON_CLIENT_SECRET: document.getElementById('patreonClientSecret').value,
        SUPABASE_URL: dbMode === 'supabase' ? document.getElementById('supabaseUrl').value : '',
        SUPABASE_KEY: dbMode === 'supabase' ? document.getElementById('supabaseKey').value : '',
        DB_MODE: dbMode,
    };
    const el = document.getElementById('saveStatus');
    try {
        const res = await fetch('/wizard/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(vars) });
        const data = await res.json();
        el.className = 'status ' + (data.ok ? 'ok' : 'err');
        el.textContent = data.message;
    } catch(e) { el.className='status err'; el.textContent='Save failed'; }
}
</script>
</body>
</html>`;

// ── Server ─────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get('/wizard', (_req, res) => {
    res.type('html').send(HTML);
});

app.get('/wizard/oauth/callback', async (req, res) => {
    const code = req.query.code as string;
    if (!code) { res.send('Missing code'); return; }

    const env = getExistingEnv();
    try {
        const axios = (await import('axios')).default;
        const tokenRes = await axios.post('https://www.patreon.com/api/oauth2/token', null, {
            params: {
                code,
                grant_type: 'authorization_code',
                client_id: env.PATREON_CLIENT_ID || '',
                client_secret: env.PATREON_CLIENT_SECRET || '',
                redirect_uri: `http://localhost:${PORT}/wizard/oauth/callback`,
            },
        });

        writeEnv({
            PATREON_ACCESS_TOKEN: tokenRes.data.access_token,
            PATREON_REFRESH_TOKEN: tokenRes.data.refresh_token || '',
        });

        res.send('<html><body style="background:#0f0c29;color:#fff;text-align:center;padding:4rem;font-family:system-ui"><h1 style="color:#43b581">✅ Patreon Connected!</h1><p>Tokens saved to .env. You can close this tab.</p></body></html>');
    } catch (err: any) {
        res.send(`<html><body style="background:#0f0c29;color:#fff;text-align:center;padding:4rem;font-family:system-ui"><h1 style="color:#f04747">❌ OAuth Failed</h1><p>${err.response?.data?.error || err.message}</p></body></html>`);
    }
});

// ── Create Patreon Webhook ─────────────────────────────────────────

app.post('/wizard/create-webhook', async (req, res) => {
    const { webhookBaseUrl } = req.body;
    const env = getExistingEnv();
    const accessToken = env.PATREON_ACCESS_TOKEN;
    const campaignId = env.PATREON_CAMPAIGN_ID;
    let webhookSecret = env.WEBHOOK_SECRET;

    if (!accessToken) {
        return res.json({ ok: false, message: '❌ Connect to Patreon first (Step 2)' });
    }

    if (!campaignId) {
        return res.json({ ok: false, message: '❌ Run "npm run setup:patreon" first to get your Campaign ID' });
    }

    if (!webhookSecret) {
        webhookSecret = crypto.randomBytes(32).toString('hex');
        writeEnv({ WEBHOOK_SECRET: webhookSecret });
    }

    const webhookUrl = `${webhookBaseUrl.replace(/\/$/, '')}/webhooks/patreon`;

    try {
        const axios = (await import('axios')).default;
        const response = await axios.post(
            `https://www.patreon.com/api/oauth2/v2/webhooks`,
            {
                data: {
                    type: 'webhook',
                    attributes: {
                        triggers: [
                            'members:create', 'members:update', 'members:delete',
                            'members:pledge:create', 'members:pledge:update', 'members:pledge:delete',
                            'posts:publish', 'posts:update', 'posts:delete'
                        ],
                        uri: webhookUrl,
                        secret: webhookSecret,
                    },
                    relationships: {
                        campaign: {
                            data: { type: 'campaign', id: campaignId }
                        }
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        res.json({
            ok: true,
            message: `✅ Webhook created! URL: ${webhookUrl} — All 9 triggers configured.`
        });
    } catch (err: any) {
        const errMsg = err.response?.data?.errors?.[0]?.detail || err.message;
        res.json({ ok: false, message: `❌ ${errMsg}` });
    }
});

app.post('/wizard/test-supabase', async (req, res) => {
    const { url, key } = req.body;
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(url, key);
        const { error } = await sb.from('bot_config').select('key').limit(1);
        if (error && error.code !== 'PGRST116') throw error;
        res.json({ ok: true, message: '✅ Supabase connected successfully!' });
    } catch (err: any) {
        res.json({ ok: false, message: `❌ ${err.message}` });
    }
});

app.post('/wizard/save', (req, res) => {
    try {
        const vars = req.body;
        const env = getExistingEnv();

        // Auto-generate WEBHOOK_SECRET if missing
        if (!env.WEBHOOK_SECRET && !vars.WEBHOOK_SECRET) {
            vars.WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');
        }

        // Only write non-empty values
        const filtered: Record<string, string> = {};
        for (const [k, v] of Object.entries(vars)) {
            if (v && typeof v === 'string' && v.trim()) filtered[k] = v as string;
        }

        writeEnv(filtered);
        res.json({ ok: true, message: `✅ Saved ${Object.keys(filtered).length} variables to .env` });
    } catch (err: any) {
        res.json({ ok: false, message: `❌ ${err.message}` });
    }
});

console.log(`\n🧙 Setup Wizard starting on http://localhost:${PORT}/wizard\n`);
app.listen(PORT, () => {
    console.log(`✅ Open your browser to: http://localhost:${PORT}/wizard`);
    console.log(`   Press Ctrl+C to stop the wizard.\n`);
});
