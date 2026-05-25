import { Client, TextChannel, EmbedBuilder } from 'discord.js';

export enum LogLevel {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    error?: string;
}

// ── Dedicated error log ───────────────────────────────────────────────────────
// Separate from the general ring buffer so /admin error-log has a clean view.

export interface ErrorLogEntry {
    id: number;                 // Sequential ID for easy reference
    timestamp: string;          // ISO 8601
    message: string;            // Human-readable context (what the bot was doing)
    errorMessage: string;       // Error.message
    stack?: string;             // Full stack trace (truncated to 1500 chars)
    context?: string;           // Optional tag e.g. "members:create", "QUEUE"
    explanation: ErrorExplanation; // Friendly cause + fix
}

export interface ErrorExplanation {
    cause: string;              // Why this happened
    fix: string;                // What to do about it
    severity: 'low' | 'medium' | 'high' | 'critical';
}

const ERROR_BUFFER_SIZE = 100;
const errorBuffer: ErrorLogEntry[] = [];
let errorIdCounter = 0;

const LOG_BUFFER_SIZE = 200;
const logBuffer: LogEntry[] = [];

let discordClient: Client | null = null;
let logChannelId: string | null = null;

// ── Error explanation engine ──────────────────────────────────────────────────
/**
 * Maps an Error to a friendly explanation with cause, fix, and severity.
 * Patterns are checked in priority order — most specific first.
 */
export function explainError(message: string, error?: Error): ErrorExplanation {
    const msg = (error?.message || '').toLowerCase();
    const stack = (error?.stack || '').toLowerCase();
    const ctx = message.toLowerCase();

    // ── Discord / API errors ──────────────────────────────────────────────────
    if (msg.includes('10062') || msg.includes('unknown interaction')) {
        return {
            cause: 'The Discord interaction expired before the bot could respond. This usually happens when the bot is slow to reply (> 3 seconds) or restarted mid-interaction.',
            fix: 'Ensure `deferReply()` is called immediately at the start of any command that does async work. Check bot startup time and hosting latency.',
            severity: 'low',
        };
    }
    if (msg.includes('50013') || msg.includes('missing permissions')) {
        return {
            cause: 'The bot is missing a required Discord permission (e.g. Send Messages, Manage Roles, or Embed Links) in the target channel or guild.',
            fix: 'Go to **Server Settings → Integrations → DISBot** and grant the missing permissions. Also check per-channel permission overrides.',
            severity: 'medium',
        };
    }
    if (msg.includes('50001') || msg.includes('missing access')) {
        return {
            cause: 'The bot cannot see or access the specified channel. It may have been deleted, or the bot lacks View Channel permission.',
            fix: 'Verify the channel still exists and run `/admin set-event-channel` or `/admin set-channel` to reassign it.',
            severity: 'medium',
        };
    }
    if (msg.includes('50035') || msg.includes('invalid form body')) {
        return {
            cause: 'A Discord message or embed was malformed — likely a field that exceeds the character limit (title 256, description 4096, field value 1024).',
            fix: 'Check recent custom message templates in `/admin set-message`. Truncate long content before sending.',
            severity: 'medium',
        };
    }
    if (msg.includes('rate limit') || msg.includes('429')) {
        return {
            cause: 'The bot hit Discord\'s rate limit — too many API requests in a short window.',
            fix: 'This is usually transient and self-resolving. If recurring, reduce the frequency of bulk operations or add delays between channel sends.',
            severity: 'low',
        };
    }
    if (msg.includes('10008') || msg.includes('unknown message')) {
        return {
            cause: 'The bot tried to edit or reference a Discord message that no longer exists (deleted).',
            fix: 'Non-critical. The message was likely deleted by a moderator. No action needed.',
            severity: 'low',
        };
    }
    if (msg.includes('cannot send messages to this user') || msg.includes('50007')) {
        return {
            cause: 'The bot tried to DM a user who has DMs disabled or has blocked the bot.',
            fix: 'DM-based features (e.g., export data, win-back messages) will silently skip users with DMs off. No action needed.',
            severity: 'low',
        };
    }

    // ── Supabase / Database errors ────────────────────────────────────────────
    if (msg.includes('jwt') || msg.includes('apikey') || msg.includes('invalid api key')) {
        return {
            cause: 'The Supabase API key is invalid, expired, or missing. The bot cannot read/write to the database.',
            fix: 'Check `SUPABASE_SERVICE_KEY` in your environment variables. Regenerate the key in the Supabase dashboard under **Settings → API**.',
            severity: 'critical',
        };
    }
    if (msg.includes('supabase') && (msg.includes('connection') || msg.includes('fetch'))) {
        return {
            cause: 'The bot cannot reach Supabase — either the URL is wrong, the project is paused (Supabase pauses free tier after inactivity), or there\'s a network issue.',
            fix: 'Check `SUPABASE_URL` in env vars. Visit your Supabase dashboard and click **Restore** if the project was paused. Check hosting network egress.',
            severity: 'high',
        };
    }
    if (msg.includes('pgrst') || msg.includes('postgrest')) {
        return {
            cause: 'A Supabase PostgREST query failed — likely a missing table column, an RLS policy blocking the operation, or a malformed query.',
            fix: 'Run the latest SQL migrations from `supabase/migrations/`. Check RLS policies in the Supabase dashboard for the affected table.',
            severity: 'high',
        };
    }
    if (msg.includes('unique') || msg.includes('duplicate key')) {
        return {
            cause: 'A duplicate record was inserted into the database — the same member ID or post ID already exists.',
            fix: 'This is usually harmless if upsert logic is in place. If errors persist, check the upsert conflict target in `db.ts`.',
            severity: 'low',
        };
    }
    if (msg.includes('webhook_log') || ctx.includes('webhook cache')) {
        return {
            cause: 'The `webhook_log` table doesn\'t exist yet — migration 011 hasn\'t been applied.',
            fix: 'Run migration `011_webhook_log.sql` in the Supabase SQL Editor, or bootstrap the `exec_sql` RPC so auto-migrations work.',
            severity: 'medium',
        };
    }

    // ── Redis / BullMQ errors ─────────────────────────────────────────────────
    if (msg.includes('redis') || msg.includes('econnrefused') && ctx.includes('queue')) {
        return {
            cause: 'Redis is unreachable. The webhook queue is disabled and the bot falls back to direct processing — functionality is not lost.',
            fix: 'Check that your Redis service (e.g., Railway Redis) is running. Verify `REDIS_URL` in env vars.',
            severity: 'medium',
        };
    }
    if (msg.includes('bullmq') || ctx.includes('queue')) {
        return {
            cause: 'A BullMQ job failed — the webhook could not be queued or processed via the async queue.',
            fix: 'Check Redis connectivity. The bot automatically falls back to direct processing, so events won\'t be missed.',
            severity: 'low',
        };
    }

    // ── Patreon API errors ────────────────────────────────────────────────────
    if (msg.includes('401') && ctx.includes('patreon')) {
        return {
            cause: 'The Patreon access token has expired or is invalid.',
            fix: 'Re-authorize via `/oauth/start` in your browser, or run `npm run setup:patreon` to refresh the token.',
            severity: 'high',
        };
    }
    if (msg.includes('403') && ctx.includes('patreon')) {
        return {
            cause: 'The Patreon token is missing required OAuth scopes (`campaigns`, `campaigns.members`, `campaigns.posts`).',
            fix: 'Re-authorize via `/oauth/start` and ensure all required scopes are checked when approving.',
            severity: 'high',
        };
    }
    if ((msg.includes('patreon') || ctx.includes('patreon')) && (msg.includes('network') || msg.includes('timeout') || msg.includes('enotfound'))) {
        return {
            cause: 'The bot could not reach the Patreon API — possible network timeout or DNS failure from the hosting provider.',
            fix: 'Usually transient. If repeated, check your hosting provider\'s outbound network access and DNS settings.',
            severity: 'medium',
        };
    }

    // ── Webhook processing errors ─────────────────────────────────────────────
    if (ctx.includes('signature') || ctx.includes('verify')) {
        return {
            cause: 'A webhook signature failed verification — either `WEBHOOK_SECRET` is wrong, or an unauthorized party sent a request to the webhook endpoint.',
            fix: 'Verify `WEBHOOK_SECRET` matches exactly what\'s configured in the Patreon Webhook settings. Regenerate if necessary.',
            severity: 'high',
        };
    }
    if (ctx.includes('tier') && ctx.includes('detect')) {
        return {
            cause: 'The bot could not match this Patreon post to any configured tier. The tier ID from Patreon isn\'t in your `TIER_CONFIG` or the database.',
            fix: 'Run `/admin sync-tiers` to refresh tier IDs from Patreon, then `/admin set-channel` to map them to channels.',
            severity: 'medium',
        };
    }
    if (ctx.includes('members:create') || ctx.includes('pledge:create')) {
        return {
            cause: 'An error occurred while processing a new member or pledge webhook. The member may not have been announced in Discord.',
            fix: 'Use `/admin error-log` to view details. Run `/admin debug-logs` for the full trace. Check if the event channel is configured.',
            severity: 'high',
        };
    }
    if (ctx.includes('posts:publish') || ctx.includes('posts:update')) {
        return {
            cause: 'An error occurred while handling a Patreon post notification. The Discord announcement may not have been sent.',
            fix: 'Check tier-to-channel mappings with `/admin status`. Verify the bot has permission to post in the mapped channels.',
            severity: 'medium',
        };
    }

    // ── General Node.js / runtime errors ─────────────────────────────────────
    if (msg.includes('enotfound') || msg.includes('getaddrinfo')) {
        return {
            cause: 'A DNS lookup failed — the bot cannot resolve a hostname (Discord, Patreon, Supabase, or Redis).',
            fix: 'Check your hosting network configuration. This is often a transient issue on shared hosting.',
            severity: 'medium',
        };
    }
    if (msg.includes('econnreset') || msg.includes('socket hang up')) {
        return {
            cause: 'A network connection was forcibly closed mid-request. Common on free/shared hosting tiers with connection limits.',
            fix: 'Usually transient and auto-retried. If frequent, consider upgrading hosting or adding retry logic.',
            severity: 'low',
        };
    }
    if (msg.includes('cannot read') || msg.includes('typeerror') || stack.includes('typeerror')) {
        return {
            cause: 'The bot tried to access a property on an undefined or null value — usually means unexpected data from Patreon or an empty webhook payload.',
            fix: 'Check `/admin debug-logs` for the full payload. This may indicate Patreon sent an unexpected webhook format.',
            severity: 'medium',
        };
    }
    if (msg.includes('timeout')) {
        return {
            cause: 'An operation timed out — either a database query, Patreon API call, or Discord API response took too long.',
            fix: 'Usually transient. If frequent, check database and API latency in `/admin status`.',
            severity: 'low',
        };
    }
    if (msg.includes('heap out of memory') || msg.includes('out of memory')) {
        return {
            cause: 'The bot process ran out of memory. On low-memory hosting this can happen during large data exports or after memory leaks.',
            fix: 'Increase the memory allocation for your process, or add `--max-old-space-size=512` to your Node.js start command.',
            severity: 'critical',
        };
    }

    // ── Default fallback ──────────────────────────────────────────────────────
    return {
        cause: 'An unexpected error occurred in the bot. The error message did not match any known pattern.',
        fix: 'Check the full stack trace below. Run `/admin debug-logs` for surrounding context. If persistent, open a GitHub issue with the log.',
        severity: 'medium',
    };
}

// ── Core logger functions ─────────────────────────────────────────────────────

/**
 * Initialize logger with Discord client
 */
export function initLogger(client: Client, channelId?: string): void {
    discordClient = client;
    if (channelId) {
        logChannelId = channelId;
    }
}

/**
 * Log a message to console and optionally to Discord
 */
export async function log(level: LogLevel, message: string, error?: Error): Promise<void> {
    const timestamp = new Date().toISOString();
    const prefix = getLogPrefix(level);

    // Console log
    console.log(`[${timestamp}] ${prefix} ${message}`);
    if (error) {
        console.error(error);
    }

    // Store in general ring buffer
    logBuffer.push({
        timestamp,
        level,
        message,
        error: error?.message,
    });
    if (logBuffer.length > LOG_BUFFER_SIZE) {
        logBuffer.shift();
    }

    // ── Store errors in dedicated error buffer ────────────────────────────────
    if (level === LogLevel.ERROR) {
        const explanation = explainError(message, error);

        // Extract context tag from the message (e.g., "[MEMBERS:CREATE]" → "members:create")
        const contextMatch = message.match(/\[([A-Z:_\s]+)\]/);
        const context = contextMatch
            ? contextMatch[1].trim().toLowerCase()
            : undefined;

        const entry: ErrorLogEntry = {
            id: ++errorIdCounter,
            timestamp,
            message,
            errorMessage: error?.message || 'No error message',
            stack: error?.stack?.substring(0, 1500),
            context,
            explanation,
        };

        errorBuffer.push(entry);
        if (errorBuffer.length > ERROR_BUFFER_SIZE) {
            errorBuffer.shift();
        }
    }

    // Discord log (only for WARN and ERROR)
    if ((level === LogLevel.WARN || level === LogLevel.ERROR) && discordClient && logChannelId) {
        try {
            const channel = await discordClient.channels.fetch(logChannelId) as TextChannel;
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle(`${getLogEmoji(level)} ${level}`)
                    .setDescription(message)
                    .setColor(getLogColor(level))
                    .setTimestamp();

                if (error) {
                    embed.addFields({
                        name: 'Error Details',
                        value: `\`\`\`${error.message}\`\`\``
                    });

                    if (error.stack) {
                        embed.addFields({
                            name: 'Stack Trace',
                            value: `\`\`\`${error.stack.substring(0, 1000)}\`\`\``
                        });
                    }
                }

                await channel.send({ embeds: [embed] });
            }
        } catch (err) {
            console.error('Failed to send log to Discord:', err);
        }
    }
}

/**
 * Convenience methods
 */
export const logger = {
    info: (message: string) => log(LogLevel.INFO, message),
    warn: (message: string, error?: Error) => log(LogLevel.WARN, message, error),
    error: (message: string, error?: Error) => log(LogLevel.ERROR, message, error)
};

/**
 * Get recent log entries from the in-memory ring buffer.
 * @param count - Number of recent entries to return (default 50)
 */
export function getRecentLogs(count: number = 50): LogEntry[] {
    return logBuffer.slice(-count);
}

/**
 * Get recent error-only entries with explanations.
 * @param count - Max entries (default 25)
 * @param severity - Optional filter: 'low' | 'medium' | 'high' | 'critical'
 */
export function getRecentErrors(
    count: number = 25,
    severity?: ErrorExplanation['severity']
): ErrorLogEntry[] {
    let entries = errorBuffer.slice();
    if (severity) {
        entries = entries.filter(e => e.explanation.severity === severity);
    }
    return entries.slice(-count).reverse(); // newest first
}

/**
 * Get error count breakdown by severity.
 */
export function getErrorSummary(): Record<ErrorExplanation['severity'], number> {
    const summary = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const e of errorBuffer) {
        summary[e.explanation.severity]++;
    }
    return summary;
}

/**
 * Clear all error log entries (useful for testing or after incident resolution).
 */
export function clearErrorLog(): void {
    errorBuffer.length = 0;
}

function getLogPrefix(level: LogLevel): string {
    switch (level) {
        case LogLevel.INFO:
            return '✅';
        case LogLevel.WARN:
            return '⚠️';
        case LogLevel.ERROR:
            return '❌';
    }
}

function getLogEmoji(level: LogLevel): string {
    switch (level) {
        case LogLevel.INFO:
            return '✅';
        case LogLevel.WARN:
            return '⚠️';
        case LogLevel.ERROR:
            return '🚨';
    }
}

function getLogColor(level: LogLevel): number {
    switch (level) {
        case LogLevel.INFO:
            return 0x00ff00; // Green
        case LogLevel.WARN:
            return 0xffaa00; // Orange
        case LogLevel.ERROR:
            return 0xff0000; // Red
    }
}

