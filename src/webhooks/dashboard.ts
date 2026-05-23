import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getSupabase } from '../database/supabase';

/**
 * Verify dashboard JWT token.
 * Returns the payload if valid, null otherwise.
 */
function verifyDashboardToken(token: string): any {
    try {
        const secret = config.webhookSecret;
        if (!secret) return null;
        const payload = jwt.verify(token, secret) as any;
        if (payload.type !== 'dashboard') return null;
        return payload;
    } catch {
        return null;
    }
}

/**
 * Dashboard Fastify plugin.
 * Serves a Chart.js analytics SPA gated by JWT.
 */
export const dashboardPlugin: FastifyPluginAsync = async (fastify, _opts) => {

    // Auth hook for all dashboard routes
    fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        const query = request.query as Record<string, string>;
        const token = query.token;

        if (!token || !verifyDashboardToken(token)) {
            return reply.code(401).type('text/html').send(`
                <html><body style="background:#0d1117;color:#c9d1d9;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
                <div style="text-align:center">
                    <h1 style="color:#f85149">🔒 Access Denied</h1>
                    <p style="color:#8b949e">This dashboard link is invalid or expired.</p>
                    <p style="color:#8b949e;font-size:0.9rem">Use <code>/admin dashboard</code> in Discord to generate a new link.</p>
                </div></body></html>
            `);
        }
    });

    // ── API Endpoints ──────────────────────────────────────

    fastify.get('/api/overview', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const supabase = getSupabase();

            const { count: totalMembers } = await supabase
                .from('tracked_members')
                .select('*', { count: 'exact', head: true });

            const { count: totalPosts } = await supabase
                .from('tracked_posts')
                .select('*', { count: 'exact', head: true });

            const { count: activeTiers } = await supabase
                .from('tier_mappings')
                .select('*', { count: 'exact', head: true });

            const { count: roleMappings } = await supabase
                .from('role_mappings')
                .select('*', { count: 'exact', head: true });

            return reply.send({
                totalMembers: totalMembers || 0,
                totalPosts: totalPosts || 0,
                activeTiers: activeTiers || 0,
                roleMappings: roleMappings || 0,
            });
        } catch (err: any) {
            return reply.code(500).send({ error: err.message });
        }
    });

    fastify.get('/api/tiers', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const supabase = getSupabase();

            // Count members per tier
            const { data: members } = await supabase
                .from('tracked_members')
                .select('current_tier_id');

            const tierCounts: Record<string, number> = {};
            for (const m of (members || [])) {
                const tid = m.current_tier_id || 'free';
                tierCounts[tid] = (tierCounts[tid] || 0) + 1;
            }

            // Get tier names from mappings
            const { data: mappings } = await supabase
                .from('tier_mappings')
                .select('tier_id, tier_name');

            const nameMap: Record<string, string> = { free: 'Free' };
            for (const m of (mappings || [])) {
                nameMap[m.tier_id] = m.tier_name;
            }

            const result = Object.entries(tierCounts).map(([id, count]) => ({
                tierId: id,
                tierName: nameMap[id] || id,
                count,
            })).sort((a, b) => b.count - a.count);

            return reply.send(result);
        } catch (err: any) {
            return reply.code(500).send({ error: err.message });
        }
    });

    fastify.get('/api/growth', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const supabase = getSupabase();

            const { data: members } = await supabase
                .from('tracked_members')
                .select('joined_at, updated_at')
                .order('joined_at', { ascending: true });

            if (!members || members.length === 0) {
                return reply.send({ labels: [], data: [] });
            }

            // Group by day (last 30 days)
            const now = Date.now();
            const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
            const dailyCounts: Record<string, number> = {};

            for (let d = thirtyDaysAgo; d <= now; d += 24 * 60 * 60 * 1000) {
                const key = new Date(d).toISOString().split('T')[0];
                dailyCounts[key] = 0;
            }

            for (const m of members) {
                const ts = typeof m.joined_at === 'number' ? m.joined_at : Date.parse(m.joined_at);
                if (ts >= thirtyDaysAgo) {
                    const key = new Date(ts).toISOString().split('T')[0];
                    if (dailyCounts[key] !== undefined) {
                        dailyCounts[key]++;
                    }
                }
            }

            const labels = Object.keys(dailyCounts);
            const data = Object.values(dailyCounts);

            // Cumulative sum
            const cumulative: number[] = [];
            let total = members.filter(m => {
                const ts = typeof m.joined_at === 'number' ? m.joined_at : Date.parse(m.joined_at);
                return ts < thirtyDaysAgo;
            }).length;
            for (const d of data) {
                total += d;
                cumulative.push(total);
            }

            return reply.send({ labels, newPerDay: data, cumulative });
        } catch (err: any) {
            return reply.code(500).send({ error: err.message });
        }
    });

    fastify.get('/api/recent', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const supabase = getSupabase();

            const { data: members } = await supabase
                .from('tracked_members')
                .select('*')
                .order('updated_at', { ascending: false })
                .limit(20);

            return reply.send(members || []);
        } catch (err: any) {
            return reply.code(500).send({ error: err.message });
        }
    });

    // ── SPA HTML ────────────────────────────────────────────────

    fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
        const query = request.query as Record<string, string>;
        const token = query.token;

        return reply.type('text/html').send(getDashboardHTML(token));
    });
};

function getDashboardHTML(token: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DISBot Analytics Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            min-height: 100vh;
        }

        .header {
            background: linear-gradient(135deg, #161b22 0%, #0d1117 100%);
            border-bottom: 1px solid #21262d;
            padding: 1.5rem 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .header h1 {
            font-size: 1.5rem;
            color: #f0f6fc;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .header .badge {
            background: #238636;
            color: #fff;
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
        }

        .header .refresh-info {
            color: #8b949e;
            font-size: 0.85rem;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 12px;
            padding: 1.5rem;
            transition: border-color 0.2s;
        }

        .stat-card:hover {
            border-color: #388bfd;
        }

        .stat-card .label {
            color: #8b949e;
            font-size: 0.85rem;
            margin-bottom: 0.5rem;
        }

        .stat-card .value {
            font-size: 2rem;
            font-weight: 700;
            color: #f0f6fc;
        }

        .stat-card .icon {
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
        }

        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .chart-card {
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 12px;
            padding: 1.5rem;
        }

        .chart-card h2 {
            font-size: 1.1rem;
            color: #f0f6fc;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .chart-container {
            position: relative;
            width: 100%;
            height: 300px;
        }

        .table-card {
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 12px;
            padding: 1.5rem;
            overflow-x: auto;
        }

        .table-card h2 {
            font-size: 1.1rem;
            color: #f0f6fc;
            margin-bottom: 1rem;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th {
            text-align: left;
            padding: 0.75rem;
            color: #8b949e;
            font-size: 0.85rem;
            border-bottom: 1px solid #21262d;
        }

        td {
            padding: 0.75rem;
            border-bottom: 1px solid #21262d;
            font-size: 0.9rem;
        }

        tr:hover td {
            background: rgba(56, 139, 253, 0.05);
        }

        .tier-badge {
            display: inline-block;
            padding: 0.2rem 0.6rem;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 600;
            background: rgba(88, 101, 242, 0.2);
            color: #a5b4fc;
            border: 1px solid rgba(88, 101, 242, 0.3);
        }

        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 200px;
            color: #8b949e;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .loading-dot {
            animation: pulse 1.5s infinite;
        }

        @media (max-width: 600px) {
            .charts-grid { grid-template-columns: 1fr; }
            .container { padding: 1rem; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 DISBot Analytics <span class="badge">LIVE</span></h1>
        <span class="refresh-info" id="refreshInfo">Loading...</span>
    </div>

    <div class="container">
        <!-- Stats Cards -->
        <div class="stats-grid" id="statsGrid">
            <div class="stat-card"><div class="icon">👥</div><div class="label">Total Patrons</div><div class="value" id="totalMembers">—</div></div>
            <div class="stat-card"><div class="icon">📝</div><div class="label">Tracked Posts</div><div class="value" id="totalPosts">—</div></div>
            <div class="stat-card"><div class="icon">🎯</div><div class="label">Active Tiers</div><div class="value" id="activeTiers">—</div></div>
            <div class="stat-card"><div class="icon">🔗</div><div class="label">Role Mappings</div><div class="value" id="roleMappings">—</div></div>
        </div>

        <!-- Charts -->
        <div class="charts-grid">
            <div class="chart-card">
                <h2>🍩 Tier Distribution</h2>
                <div class="chart-container"><canvas id="tierChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h2>📈 Patron Growth (30 days)</h2>
                <div class="chart-container"><canvas id="growthChart"></canvas></div>
            </div>
        </div>

        <!-- Recent Activity Table -->
        <div class="table-card">
            <h2>🕐 Recent Activity</h2>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Tier</th>
                        <th>Last Updated</th>
                    </tr>
                </thead>
                <tbody id="recentTable">
                    <tr><td colspan="3" class="loading"><span class="loading-dot">Loading...</span></td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        const TOKEN = '${token}';
        const BASE = window.location.pathname.replace(new RegExp('/$'), '');

        let tierChartInstance = null;
        let growthChartInstance = null;

        async function fetchAPI(endpoint) {
            const res = await fetch(BASE + endpoint + '?token=' + TOKEN);
            if (!res.ok) throw new Error('API error: ' + res.status);
            return res.json();
        }

        async function loadOverview() {
            const data = await fetchAPI('/api/overview');
            document.getElementById('totalMembers').textContent = data.totalMembers.toLocaleString();
            document.getElementById('totalPosts').textContent = data.totalPosts.toLocaleString();
            document.getElementById('activeTiers').textContent = data.activeTiers.toLocaleString();
            document.getElementById('roleMappings').textContent = data.roleMappings.toLocaleString();
        }

        async function loadTierChart() {
            const data = await fetchAPI('/api/tiers');
            const ctx = document.getElementById('tierChart').getContext('2d');

            const colors = [
                '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6',
                '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899'
            ];

            if (tierChartInstance) tierChartInstance.destroy();

            tierChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: data.map(d => d.tierName + ' (' + d.count + ')'),
                    datasets: [{
                        data: data.map(d => d.count),
                        backgroundColor: colors.slice(0, data.length),
                        borderColor: '#0d1117',
                        borderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: '#8b949e', padding: 12, usePointStyle: true }
                        }
                    }
                }
            });
        }

        async function loadGrowthChart() {
            const data = await fetchAPI('/api/growth');
            const ctx = document.getElementById('growthChart').getContext('2d');

            if (growthChartInstance) growthChartInstance.destroy();

            // Format date labels
            const labels = (data.labels || []).map(l => {
                const d = new Date(l);
                return (d.getMonth() + 1) + '/' + d.getDate();
            });

            growthChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Total Patrons',
                            data: data.cumulative || [],
                            borderColor: '#8b5cf6',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 0,
                        },
                        {
                            label: 'New per Day',
                            data: data.newPerDay || [],
                            borderColor: '#22c55e',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 2,
                            yAxisID: 'y1',
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        x: {
                            ticks: { color: '#8b949e', maxTicksLimit: 10 },
                            grid: { color: 'rgba(48, 54, 61, 0.5)' }
                        },
                        y: {
                            ticks: { color: '#8b949e' },
                            grid: { color: 'rgba(48, 54, 61, 0.5)' },
                            title: { display: true, text: 'Total', color: '#8b949e' }
                        },
                        y1: {
                            position: 'right',
                            ticks: { color: '#8b949e' },
                            grid: { display: false },
                            title: { display: true, text: 'New/Day', color: '#8b949e' }
                        }
                    },
                    plugins: {
                        legend: { labels: { color: '#8b949e', usePointStyle: true } }
                    }
                }
            });
        }

        async function loadRecentTable() {
            const data = await fetchAPI('/api/recent');
            const tbody = document.getElementById('recentTable');

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="color:#8b949e;text-align:center">No recent activity</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(m => {
                const updated = new Date(typeof m.updated_at === 'number' ? m.updated_at : Date.parse(m.updated_at));
                const timeAgo = getTimeAgo(updated);
                const tierLabel = m.current_tier_id === 'free' ? 'Free' : m.current_tier_id;
                return '<tr>' +
                    '<td>' + escapeHtml(m.full_name) + '</td>' +
                    '<td><span class="tier-badge">' + escapeHtml(tierLabel) + '</span></td>' +
                    '<td title="' + updated.toISOString() + '">' + timeAgo + '</td>' +
                    '</tr>';
            }).join('');
        }

        function getTimeAgo(date) {
            const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
            if (seconds < 60) return seconds + 's ago';
            if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
            if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
            return Math.floor(seconds / 86400) + 'd ago';
        }

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        async function loadAll() {
            try {
                await Promise.all([
                    loadOverview(),
                    loadTierChart(),
                    loadGrowthChart(),
                    loadRecentTable()
                ]);
                document.getElementById('refreshInfo').textContent =
                    'Last updated: ' + new Date().toLocaleTimeString();
            } catch (err) {
                console.error('Dashboard load error:', err);
                document.getElementById('refreshInfo').textContent = 'Error loading data';
            }
        }

        // Initial load
        loadAll();

        // Auto-refresh every 60 seconds
        setInterval(loadAll, 60_000);
    </script>
</body>
</html>`;
}
