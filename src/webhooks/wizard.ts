import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

const ENV_PATH = path.join(process.cwd(), '.env');

export function getExistingEnv(): Record<string, string> {
    if (fs.existsSync(ENV_PATH)) {
        return dotenv.parse(fs.readFileSync(ENV_PATH));
    }
    return {};
}

export function writeEnv(vars: Record<string, string>): void {
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

/**
 * Fastify plugin for the DISBot Setup Wizard.
 * Migrated from Express Router — all routes and HTML/JS remain identical.
 */
// One-time setup token for cloud deploys where DISCORD_TOKEN isn't set yet
let generatedSetupToken: string | null = null;

function getSetupToken(): string {
    if (!generatedSetupToken) {
        generatedSetupToken = crypto.randomBytes(32).toString('hex');
        console.log('\n🔐 ════════════════════════════════════════════════════════');
        console.log('🔐 SETUP WIZARD ACCESS TOKEN (one-time, required for /setup):');
        console.log(`🔐   ${generatedSetupToken}`);
        console.log('🔐 ════════════════════════════════════════════════════════\n');
    }
    return generatedSetupToken;
}

export const setupWizardPlugin: FastifyPluginAsync = async (fastify, _opts) => {
    // Middleware: secure the cloud setup route
    fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        const query = request.query as Record<string, string>;

        // In local mode, bypass auth
        if (query.mode === 'local' || process.env.SKIP_WIZARD_AUTH === 'true') {
            return;
        }

        const token = query.token || (request.headers['authorization']?.split(' ')[1]);

        // If DISCORD_TOKEN is set, use it as the auth gate (existing behavior)
        if (process.env.DISCORD_TOKEN) {
            if (token !== process.env.DISCORD_TOKEN) {
                return reply.code(401).type('text/html').send(`
                    <html><body style="background:#0f0c29;color:#fff;text-align:center;padding:4rem;font-family:system-ui">
                    <h2>🔒 Setup Wizard is Locked</h2>
                    <p>Please provide your Discord Bot Token to access the setup wizard.</p>
                    <form method="GET" style="margin-top:2rem;">
                        <input type="password" name="token" placeholder="Bot Token" style="padding:0.6rem;border-radius:6px;border:none;width:300px"/>
                        <button type="submit" style="padding:0.6rem 1rem;background:#5865F2;border:none;border-radius:6px;color:#fff;cursor:pointer">Unlock</button>
                    </form>
                    </body></html>
                `);
            }
        } else {
            // DISCORD_TOKEN not set (setup mode) — require generated token
            // This prevents unauthenticated hijacking of fresh deploys
            const setupToken = getSetupToken();
            if (token !== setupToken) {
                return reply.code(401).type('text/html').send(`
                    <html><body style="background:#0f0c29;color:#fff;text-align:center;padding:4rem;font-family:system-ui">
                    <h2>🔒 Setup Wizard is Locked</h2>
                    <p>A one-time setup token was printed to the server console on startup.</p>
                    <p style="color:#888">Check your hosting platform's logs for the token.</p>
                    <form method="GET" style="margin-top:2rem;">
                        <input type="password" name="token" placeholder="Setup Token" style="padding:0.6rem;border-radius:6px;border:none;width:300px"/>
                        <button type="submit" style="padding:0.6rem 1rem;background:#5865F2;border:none;border-radius:6px;color:#fff;cursor:pointer">Unlock</button>
                    </form>
                    </body></html>
                `);
            }
        }
    });

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
        .placeholder-tag { display:inline-block; padding:0.3rem 0.6rem; background:rgba(88,101,242,0.3); border:1px solid #5865F2; border-radius:6px; cursor:grab; font-family:monospace; font-size:0.85rem; }
        .placeholder-tag:active { cursor:grabbing; }
        .tier-card { display:flex; align-items:center; gap:0.8rem; padding:0.8rem; margin-bottom:0.5rem; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; cursor:grab; }
        .tier-card:active { cursor:grabbing; background:rgba(88,101,242,0.2); }
        .tier-card .handle { font-size:1.2rem; color:#666; }
        .tier-card .rank { background:#5865F2; color:#fff; padding:0.2rem 0.5rem; border-radius:4px; font-size:0.8rem; font-weight:600; min-width:2rem; text-align:center; }
    </style>
</head>
<body>
<div class="container">
    <h1>🤖 DISBot Setup Wizard</h1>
    <p class="subtitle" id="wizardSubtitle">Configure your bot step-by-step.</p>
    <div id="cloudModeBanner" style="display:none; background:rgba(250, 166, 26, 0.2); border:1px solid #faa61a; padding:1rem; border-radius:8px; margin-bottom:1.5rem; color:#faa61a;">
        <strong>☁️ Cloud Deployment Detected:</strong> When you click Save, you will be given a block of environment variables to copy and paste into your Railway (or VPS) settings.
    </div>

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

    <!-- Step 4: Template Editor -->
    <div class="card">
        <h2>📝 Message Template Editor</h2>
        <p style="margin-bottom:1rem;color:#aaa">Drag placeholders into the template, then preview how it looks as a Discord embed.</p>
        <label>Template Type</label>
        <select id="templateType" onchange="loadTemplate()">
            <option value="post_new">New Post Alert</option>
            <option value="post_waterfall">Waterfall Release</option>
            <option value="welcome">Welcome Message</option>
        </select>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:1rem">
            <span class="placeholder-tag" draggable="true" ondragstart="dragPlaceholder(event,'{title}')">{title}</span>
            <span class="placeholder-tag" draggable="true" ondragstart="dragPlaceholder(event,'{url}')">{url}</span>
            <span class="placeholder-tag" draggable="true" ondragstart="dragPlaceholder(event,'{tier}')">{tier}</span>
            <span class="placeholder-tag" draggable="true" ondragstart="dragPlaceholder(event,'{post_snippet}')">{post_snippet}</span>
            <span class="placeholder-tag" draggable="true" ondragstart="dragPlaceholder(event,'{author}')">{author}</span>
            <span class="placeholder-tag" draggable="true" ondragstart="dragPlaceholder(event,'{date}')">{date}</span>
        </div>
        <textarea id="templateContent" rows="4" style="width:100%;padding:0.6rem;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-family:monospace;resize:vertical" ondrop="dropPlaceholder(event)" ondragover="event.preventDefault()" oninput="updatePreview()">🎉 New {tier} exclusive: **{title}**\\n\\n{post_snippet}\\n\\n🔗 [Read on Patreon]({url})</textarea>
        <div style="margin-top:1rem;padding:1rem;background:rgba(88,101,242,0.15);border-left:3px solid #5865F2;border-radius:8px">
            <div style="font-size:0.75rem;color:#5865F2;margin-bottom:0.5rem">PREVIEW</div>
            <div id="templatePreview" style="color:#ddd"></div>
        </div>
        <button class="btn-primary" style="margin-top:1rem" onclick="saveTemplate()">💾 Save Template</button>
        <div id="templateStatus"></div>
    </div>

    <!-- Step 5: Tier Ranker -->
    <div class="card">
        <h2>🎯 Tier Priority Ranker</h2>
        <p style="margin-bottom:1rem;color:#aaa">Drag tiers to set priority order. Highest tier at top. Click "Load from .env" to start.</p>
        <button class="btn-primary" onclick="loadTiers()">📥 Load from .env</button>
        <div id="tierList" style="margin-top:1rem"></div>
        <button class="btn-success" style="margin-top:1rem;display:none" id="saveTiersBtn" onclick="saveTiers()">💾 Save Tier Order</button>
        <div id="tierStatus"></div>
    </div>

    <!-- Step 6: Save -->
    <div class="card">
        <h2>6️⃣ Save Configuration</h2>
        <p style="margin-bottom:1rem;color:#aaa">Save your settings to finalize setup.</p>
        <button class="btn-success" onclick="saveAll()">💾 Save Configuration</button>
        <div id="saveStatus"></div>
        <textarea id="rawEnvOutput" rows="10" style="display:none; width:100%; margin-top:1rem; padding:1rem; font-family:monospace; background:#000; color:#43b581; border:1px solid #43b581; border-radius:8px;" readonly></textarea>
        <div id="redeployInstructions" style="display:none; margin-top:1rem; padding:1rem; background:rgba(88,101,242,0.15); border-left:3px solid #5865F2; border-radius:8px;">
            <strong>🚀 Next Step:</strong> Copy the text above and paste it into your Railway project's <strong>Variables</strong> tab using "Raw Editor" mode. Railway will automatically redeploy the bot and apply the settings!
        </div>
    </div>
</div>
<script>
let isCloudMode = false;
let dbMode = 'supabase';

// Check mode on load
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') !== 'local') {
        isCloudMode = true;
        document.getElementById('cloudModeBanner').style.display = 'block';
    }
};

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
    // Permissions: Send Messages, Embed Links, Slash Commands, Create Threads, Send in Threads, Attach Files, Read Messages, Manage Roles
    const permissions = 326417853440;
    const scopes = 'bot%20applications.commands';
    const url = 'https://discord.com/oauth2/authorize?client_id=' + clientId + '&permissions=' + permissions + '&scope=' + scopes;
    const el = document.getElementById('inviteStatus');
    el.className = 'status ok';
    el.innerHTML = '✅ <a href="' + url + '" target="_blank" style="color:#43b581;font-weight:bold">Click here to invite the bot →</a>';
}

function startOAuth() {
    const clientId = document.getElementById('patreonClientId').value;
    if (!clientId) { alert('Enter your Patreon Client ID first'); return; }
    const redirect = window.location.origin + window.location.pathname.replace(/\\/$/, '') + '/oauth/callback';
    const scopes = 'campaigns campaigns.members campaigns.posts w:campaigns.webhook';
    window.open('https://www.patreon.com/oauth2/authorize?response_type=code&client_id='+clientId+'&redirect_uri='+encodeURIComponent(redirect)+'&scope='+encodeURIComponent(scopes), '_blank');
}

async function createWebhook() {
    const url = document.getElementById('webhookUrl').value;
    const el = document.getElementById('webhookStatus');
    if (!url) { alert('Enter your production URL first'); return; }
    el.className = 'status info'; el.textContent = '⏳ Creating webhook...';
    try {
        const res = await fetch(window.location.pathname.replace(/\\/$/, '') + '/create-webhook', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ webhookBaseUrl: url, token: new URLSearchParams(window.location.search).get('token') })
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
        const res = await fetch(window.location.pathname.replace(/\\/$/, '') + '/test-supabase', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({url,key, token: new URLSearchParams(window.location.search).get('token')})
        });
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
        isCloudMode: isCloudMode,
        token: new URLSearchParams(window.location.search).get('token')
    };
    const el = document.getElementById('saveStatus');
    el.className = 'status info'; el.textContent = '⏳ Processing...';
    try {
        const res = await fetch(window.location.pathname.replace(/\\/$/, '') + '/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(vars) });
        const data = await res.json();
        el.className = 'status ' + (data.ok ? 'ok' : 'err');
        el.textContent = data.message;

        if (data.ok && isCloudMode && data.rawEnv) {
            const ta = document.getElementById('rawEnvOutput');
            ta.style.display = 'block';
            ta.value = data.rawEnv;
            document.getElementById('redeployInstructions').style.display = 'block';
        }
    } catch(e) { el.className='status err'; el.textContent='Save failed: ' + e.message; }
}

// Template Editor
function dragPlaceholder(e, text) { e.dataTransfer.setData('text/plain', text); }
function dropPlaceholder(e) {
    e.preventDefault();
    const ta = document.getElementById('templateContent');
    const pos = ta.selectionStart;
    const txt = e.dataTransfer.getData('text/plain');
    ta.value = ta.value.slice(0, pos) + txt + ta.value.slice(pos);
    updatePreview();
}
function updatePreview() {
    const content = document.getElementById('templateContent').value;
    const preview = content
        .replace(/{title}/g, 'My Awesome New Chapter')
        .replace(/{url}/g, 'https://patreon.com/posts/12345')
        .replace(/{tier}/g, 'Diamond')
        .replace(/{post_snippet}/g, 'The adventure continues as our hero faces...')
        .replace(/{author}/g, 'Iqbal Khan')
        .replace(/{date}/g, new Date().toLocaleDateString())
        .replace(/\\\\n/g, '<br>')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\[(.+?)\\]\\((.+?)\\)/g, '<a href="$2" style="color:#5865F2">$1</a>');
    document.getElementById('templatePreview').innerHTML = preview;
}
async function loadTemplate() {
    const type = document.getElementById('templateType').value;
    try {
        const res = await fetch(window.location.pathname.replace(/\\/$/, '') + '/template?type=' + type + '&token=' + new URLSearchParams(window.location.search).get('token'));
        const data = await res.json();
        if (data.content) document.getElementById('templateContent').value = data.content;
        updatePreview();
    } catch(e) {}
}
async function saveTemplate() {
    const type = document.getElementById('templateType').value;
    const content = document.getElementById('templateContent').value;
    const el = document.getElementById('templateStatus');
    try {
        const res = await fetch(window.location.pathname.replace(/\\/$/, '') + '/template', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({type, content, token: new URLSearchParams(window.location.search).get('token')})
        });
        const data = await res.json();
        el.className = 'status ' + (data.ok ? 'ok' : 'err');
        el.textContent = data.message;
    } catch(e) { el.className='status err'; el.textContent='Failed'; }
}

// Tier Ranker
let tierData = [];
function loadTiers() {
    fetch(window.location.pathname.replace(/\\/$/, '') + '/tiers?token=' + new URLSearchParams(window.location.search).get('token'))
    .then(r=>r.json()).then(data => {
        tierData = data.tiers || [];
        renderTiers();
        document.getElementById('saveTiersBtn').style.display = 'inline-block';
    });
}
function renderTiers() {
    const el = document.getElementById('tierList');
    el.innerHTML = tierData.map((t, i) =>
        '<div class="tier-card" draggable="true" data-idx="'+i+'" ondragstart="tierDragStart(event)" ondragover="tierDragOver(event)" ondrop="tierDrop(event)">'+
        '<span class="handle">☰</span>'+
        '<span class="rank">#'+(i+1)+'</span>'+
        '<strong>'+t.name+'</strong>'+
        '<span style="color:#888;margin-left:auto">$'+(t.cents/100).toFixed(2)+'/mo</span>'+
        '</div>'
    ).join('');
}
let dragIdx = null;
function tierDragStart(e) { dragIdx = parseInt(e.target.closest('.tier-card').dataset.idx); }
function tierDragOver(e) { e.preventDefault(); }
function tierDrop(e) {
    e.preventDefault();
    const dropIdx = parseInt(e.target.closest('.tier-card').dataset.idx);
    if (dragIdx !== null && dragIdx !== dropIdx) {
        const item = tierData.splice(dragIdx, 1)[0];
        tierData.splice(dropIdx, 0, item);
        renderTiers();
    }
}
async function saveTiers() {
    const ranked = tierData.map((t, i) => ({...t, rank: (tierData.length - i) * 10}));
    const el = document.getElementById('tierStatus');
    try {
        const res = await fetch(window.location.pathname.replace(/\\/$/, '') + '/tiers', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({tiers: ranked, token: new URLSearchParams(window.location.search).get('token')})
        });
        const data = await res.json();
        el.className = 'status ' + (data.ok ? 'ok' : 'err');
        el.textContent = data.message;
    } catch(e) { el.className='status err'; el.textContent='Failed'; }
}
updatePreview();
</script>
</body>
</html>`;

    // ── Route Endpoints ───────────────────────────────────────────────

    fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.type('text/html').send(HTML);
    });

    fastify.get('/oauth/callback', async (request: FastifyRequest, reply: FastifyReply) => {
        const query = request.query as Record<string, string>;
        const code = query.code;
        if (!code) { return reply.send('Missing code'); }

        const env = getExistingEnv();
        const redirectUrl = `${request.protocol}://${request.hostname}${request.url.split('?')[0]}`;

        try {
            const axios = (await import('axios')).default;
            const tokenRes = await axios.post('https://www.patreon.com/api/oauth2/token', null, {
                params: {
                    code,
                    grant_type: 'authorization_code',
                    client_id: env.PATREON_CLIENT_ID || '',
                    client_secret: env.PATREON_CLIENT_SECRET || '',
                    redirect_uri: redirectUrl,
                },
            });

            writeEnv({
                PATREON_ACCESS_TOKEN: tokenRes.data.access_token,
                PATREON_REFRESH_TOKEN: tokenRes.data.refresh_token || '',
            });

            return reply.type('text/html').send('<html><body style="background:#0f0c29;color:#fff;text-align:center;padding:4rem;font-family:system-ui"><h1 style="color:#43b581">✅ Patreon Connected!</h1><p>Tokens saved to .env. You can close this tab.</p></body></html>');
        } catch (err: any) {
            return reply.type('text/html').send(`<html><body style="background:#0f0c29;color:#fff;text-align:center;padding:4rem;font-family:system-ui"><h1 style="color:#f04747">❌ OAuth Failed</h1><p>${err.response?.data?.error || err.message}</p></body></html>`);
        }
    });

    // ── Create Patreon Webhook ─────────────────────────────────────────

    fastify.post('/create-webhook', async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;
        const { webhookBaseUrl } = body;
        const env = getExistingEnv();
        const accessToken = env.PATREON_ACCESS_TOKEN;
        const campaignId = env.PATREON_CAMPAIGN_ID;
        let webhookSecret = env.WEBHOOK_SECRET;

        if (!accessToken) {
            return reply.send({ ok: false, message: '❌ Connect to Patreon first (Step 2)' });
        }

        if (!campaignId) {
            return reply.send({ ok: false, message: '❌ Run "npm run setup:patreon" first to get your Campaign ID' });
        }

        if (!webhookSecret) {
            webhookSecret = crypto.randomBytes(32).toString('hex');
            writeEnv({ WEBHOOK_SECRET: webhookSecret });
        }

        const webhookUrl = `${webhookBaseUrl.replace(/\/$/, '')}/webhooks/patreon`;

        try {
            const axios = (await import('axios')).default;
            await axios.post(
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

            return reply.send({
                ok: true,
                message: `✅ Webhook created! URL: ${webhookUrl} — All 9 triggers configured.`
            });
        } catch (err: any) {
            const errMsg = err.response?.data?.errors?.[0]?.detail || err.message;
            return reply.send({ ok: false, message: `❌ ${errMsg}` });
        }
    });

    fastify.post('/test-supabase', async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;
        const { url, key } = body;
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const sb = createClient(url, key);
            const { error } = await sb.from('bot_config').select('key').limit(1);
            if (error && error.code !== 'PGRST116') throw error;
            return reply.send({ ok: true, message: '✅ Supabase connected successfully!' });
        } catch (err: any) {
            return reply.send({ ok: false, message: `❌ ${err.message}` });
        }
    });

    fastify.post('/save', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const vars = request.body as any;
            const isCloudSave = vars.isCloudMode;
            delete vars.isCloudMode;
            delete vars.token;

            const env = getExistingEnv();

            if (!env.WEBHOOK_SECRET && !vars.WEBHOOK_SECRET) {
                vars.WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');
            }

            const filtered: Record<string, string> = {};
            for (const [k, v] of Object.entries(vars)) {
                if (v && typeof v === 'string' && v.trim()) filtered[k] = v as string;
            }

            if (isCloudSave) {
                // Check for Patreon Token to fetch campaign ID and tiers automatically
                if (filtered.PATREON_ACCESS_TOKEN || env.PATREON_ACCESS_TOKEN) {
                    const patreonToken = filtered.PATREON_ACCESS_TOKEN || env.PATREON_ACCESS_TOKEN;
                    try {
                        const axios = (await import('axios')).default;
                        const cRes = await axios.get('https://www.patreon.com/api/oauth2/api/current_user/campaigns', {
                            headers: { Authorization: `Bearer ${patreonToken}` }
                        });
                        if (cRes.data?.data?.[0]?.id) {
                            filtered.PATREON_CAMPAIGN_ID = cRes.data.data[0].id;

                            // Auto-fetch and rank tiers
                            const included = cRes.data.included || [];
                            const tiers = included.filter((item: any) => item.type === 'reward');
                            tiers.sort((a: any, b: any) => (b.attributes.amount_cents || 0) - (a.attributes.amount_cents || 0));
                            const step = tiers.length > 1 ? Math.floor(100 / (tiers.length - 1)) : 100;
                            const formattedTiers = tiers.map((t: any, i: number) => ({
                                name: t.attributes.title,
                                id: t.id,
                                rank: tiers.length === 1 ? 100 : 100 - (i * step),
                                cents: t.attributes.amount_cents || 0
                            }));
                            filtered.TIER_CONFIG = JSON.stringify(formattedTiers);
                        }
                    } catch (e: any) {
                        console.warn("Could not auto-fetch campaigns/tiers for cloud save:", e.message);
                    }
                }

                // Format raw string for output
                let rawStr = '';
                for (const [k, v] of Object.entries({ ...env, ...filtered })) {
                    if (typeof v === 'string' && (v.includes(' ') || v.includes('{') || v.includes('['))) {
                        rawStr += `${k}='${v}'\n`;
                    } else {
                        rawStr += `${k}=${v}\n`;
                    }
                }

                return reply.send({ ok: true, message: '✅ Variables processed.', rawEnv: rawStr });
            } else {
                writeEnv(filtered);
                return reply.send({ ok: true, message: `✅ Saved ${Object.keys(filtered).length} variables to .env` });
            }
        } catch (err: any) {
            return reply.send({ ok: false, message: `❌ ${err.message}` });
        }
    });

    // ── Template Editor ───────────────────────────────────────────────

    fastify.get('/template', (request: FastifyRequest, reply: FastifyReply) => {
        const query = request.query as Record<string, string>;
        const type = query.type || 'post_new';
        const env = getExistingEnv();
        const key = `MESSAGE_TEMPLATE_${type.toUpperCase()}`;
        return reply.send({ content: env[key] || '' });
    });

    fastify.post('/template', (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;
        const { type, content } = body;
        const key = `MESSAGE_TEMPLATE_${type.toUpperCase()}`;
        try {
            writeEnv({ [key]: content });
            return reply.send({ ok: true, message: `✅ Template "${type}" saved!` });
        } catch (err: any) {
            return reply.send({ ok: false, message: `❌ ${err.message}` });
        }
    });

    // ── Tier Ranker ───────────────────────────────────────────────────

    fastify.get('/tiers', (_request: FastifyRequest, reply: FastifyReply) => {
        const env = getExistingEnv();
        try {
            const tierConfig = env.TIER_CONFIG ? JSON.parse(env.TIER_CONFIG.replace(/^'|'$/g, '')) : [];
            const tiers = tierConfig.map((t: any) => ({
                name: t.name,
                id: t.id || '',
                rank: t.rank || 0,
                cents: t.cents || 0,
            })).sort((a: any, b: any) => b.rank - a.rank);
            return reply.send({ tiers });
        } catch {
            return reply.send({ tiers: [] });
        }
    });

    fastify.post('/tiers', (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;
        const tiers = body.tiers;
        try {
            const tierConfig = JSON.stringify(tiers);
            writeEnv({ TIER_CONFIG: tierConfig });
            return reply.send({ ok: true, message: `✅ Saved ${tiers.length} tiers with updated ranks!` });
        } catch (err: any) {
            return reply.send({ ok: false, message: `❌ ${err.message}` });
        }
    });
};
