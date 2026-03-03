import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { checkAdminPermission } from '../../middleware/adminCheck';
import * as os from 'os';

/**
 * /admin server-stats
 * Display live server stats (CPU, memory, uptime).
 * Uses PM2 API if available, otherwise falls back to Node.js os module.
 */
export async function handleServerStats(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!await checkAdminPermission(interaction)) return;

    await interaction.deferReply({ ephemeral: true });

    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Format uptime
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const uptimeStr = `${days}d ${hours}h ${minutes}m`;

    // System info
    const totalMemMB = Math.round(os.totalmem() / 1024 / 1024);
    const freeMemMB = Math.round(os.freemem() / 1024 / 1024);
    const usedMemMB = totalMemMB - freeMemMB;
    const cpuLoad = os.loadavg();

    // Process-level memory
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(1);
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(1);

    let pm2Info = '';
    try {
        // pm2 is optional — only available when running under PM2
        const pm2 = require('pm2');
        await new Promise<void>((resolve, reject) => {
            pm2.connect((err: any) => {
                if (err) { reject(err); return; }
                pm2.describe('disbot', (err2: any, desc: any) => {
                    if (!err2 && desc && desc.length > 0) {
                        const proc = desc[0];
                        pm2Info = `\n\n**PM2 Process:**\n` +
                            `• Status: ${proc.pm2_env?.status || 'unknown'}\n` +
                            `• Restarts: ${proc.pm2_env?.restart_time || 0}\n` +
                            `• PID: ${proc.pid}`;
                    }
                    pm2.disconnect();
                    resolve();
                });
            });
        });
    } catch {
        // PM2 not available — that's fine, use Node.js stats only
    }

    const embed = new EmbedBuilder()
        .setTitle('🖥️ Server Statistics')
        .setColor(0x5865F2)
        .addFields(
            {
                name: '⏱️ Uptime',
                value: uptimeStr,
                inline: true,
            },
            {
                name: '🧠 Bot Memory (RSS)',
                value: `${rssMB} MB`,
                inline: true,
            },
            {
                name: '📦 Heap',
                value: `${heapUsedMB} / ${heapTotalMB} MB`,
                inline: true,
            },
            {
                name: '💻 System Memory',
                value: `${usedMemMB} / ${totalMemMB} MB (${Math.round(usedMemMB / totalMemMB * 100)}%)`,
                inline: true,
            },
            {
                name: '📊 CPU Load (1/5/15m)',
                value: cpuLoad.map(l => l.toFixed(2)).join(' / '),
                inline: true,
            },
            {
                name: '🏗️ Platform',
                value: `${os.platform()} ${os.arch()} • Node ${process.version}`,
                inline: true,
            },
        )
        .setDescription(pm2Info || '*Not running under PM2*')
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
