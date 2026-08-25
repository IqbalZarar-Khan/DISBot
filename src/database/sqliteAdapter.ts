/**
 * SQLite Database Adapter
 *
 * Zero-config embedded database for creators who don't want to set up Supabase.
 * If SUPABASE_URL is blank/missing, the bot automatically uses a local .sqlite file.
 *
 * Supabase is still recommended for production deployments.
 * SQLite is ideal for single-server setups and local development.
 */

import * as path from 'path';

// Lazy-loaded better-sqlite3 (optional dependency)
let db: any = null;

export function initSqlite(): void {
    try {
        const Database = require('better-sqlite3');
        const dbPath = path.join(process.cwd(), 'data', 'disbot.sqlite');

        // Ensure data directory exists
        const fs = require('fs');
        fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });

        db = new Database(dbPath);
        db.pragma('journal_mode = WAL'); // Better performance

        // Create tables
        db.exec(`
            CREATE TABLE IF NOT EXISTS tracked_posts (
                post_id TEXT PRIMARY KEY,
                last_tier_access TEXT,
                post_title TEXT DEFAULT 'Untitled',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS tier_mappings (
                tier_name TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                tier_id TEXT,
                rank INTEGER DEFAULT 0,
                cents INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS bot_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS tracked_members (
                member_id TEXT PRIMARY KEY,
                patron_name TEXT,
                discord_id TEXT,
                tier_name TEXT,
                pledge_amount_cents INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                is_active INTEGER DEFAULT 1,
                first_pledge_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS webhook_log (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type       TEXT NOT NULL,
                member_id        TEXT,
                member_name      TEXT,
                discord_user_id  TEXT,
                payload          TEXT NOT NULL,
                received_at      TEXT DEFAULT (datetime('now')),
                processed        INTEGER DEFAULT 0,
                announced        INTEGER DEFAULT 0,
                notes            TEXT
            );
            CREATE INDEX IF NOT EXISTS webhook_log_event_type_idx ON webhook_log (event_type);
            CREATE INDEX IF NOT EXISTS webhook_log_member_id_idx  ON webhook_log (member_id);
            CREATE INDEX IF NOT EXISTS webhook_log_received_at_idx ON webhook_log (received_at DESC);
        `);

        // Upgrade existing databases with missing columns
        const upgrades = [
            { table: 'webhook_log', column: 'member_name', type: 'TEXT' },
            { table: 'webhook_log', column: 'discord_user_id', type: 'TEXT' },
            { table: 'tracked_members', column: 'is_active', type: 'INTEGER DEFAULT 1' },
        ];
        for (const { table, column, type } of upgrades) {
            try {
                const cols = db.pragma(`table_info(${table})`);
                const hasColumn = cols.some((c: any) => c.name === column);
                if (!hasColumn) {
                    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
                    console.log(`  ↑ Added column ${table}.${column}`);
                }
            } catch {
                // Column might already exist — safe to ignore
            }
        }

        console.log(`✅ SQLite database initialized at ${dbPath}`);
    } catch (err: any) {
        if (err.code === 'MODULE_NOT_FOUND') {
            console.error('❌ SQLite mode requires better-sqlite3. Install it with:');
            console.error('   npm install better-sqlite3');
            process.exit(1);
        }
        throw err;
    }
}

export function getSqliteDb(): any {
    return db;
}

// ── Tracked Posts ────────────────────────────────────────────────────

export function sqliteGetTrackedPost(postId: string) {
    return db.prepare('SELECT * FROM tracked_posts WHERE post_id = ?').get(postId) || null;
}

export function sqliteUpsertTrackedPost(post: { post_id: string; last_tier_access: string; post_title?: string }) {
    db.prepare(`
        INSERT INTO tracked_posts (post_id, last_tier_access, post_title, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(post_id) DO UPDATE SET last_tier_access=?, post_title=?, updated_at=datetime('now')
    `).run(post.post_id, post.last_tier_access, post.post_title || 'Untitled',
        post.last_tier_access, post.post_title || 'Untitled');
}

export function sqliteDeleteTrackedPost(postId: string) {
    db.prepare('DELETE FROM tracked_posts WHERE post_id = ?').run(postId);
}

export function sqliteGetAllTrackedPosts() {
    return db.prepare('SELECT * FROM tracked_posts').all();
}

// ── Bot Config ──────────────────────────────────────────────────────

export function sqliteGetConfig(key: string): string | null {
    const row = db.prepare('SELECT value FROM bot_config WHERE key = ?').get(key);
    return row ? row.value : null;
}

export function sqliteSetConfig(key: string, value: string) {
    db.prepare(`
        INSERT INTO bot_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=?, updated_at=datetime('now')
    `).run(key, value, value);
}

// ── Tier Mappings ───────────────────────────────────────────────────

export function sqliteGetTierMappingByName(tierName: string) {
    return db.prepare('SELECT * FROM tier_mappings WHERE LOWER(tier_name) = LOWER(?)').get(tierName) || null;
}

export function sqliteGetAllTierMappings() {
    return db.prepare('SELECT * FROM tier_mappings').all();
}

export function sqliteUpsertTierMapping(mapping: { tier_name: string; channel_id: string; tier_id?: string; rank?: number; cents?: number }) {
    db.prepare(`
        INSERT INTO tier_mappings (tier_name, channel_id, tier_id, rank, cents, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(tier_name) DO UPDATE SET channel_id=?, tier_id=?, rank=?, cents=?, updated_at=datetime('now')
    `).run(mapping.tier_name, mapping.channel_id, mapping.tier_id || '', mapping.rank || 0, mapping.cents || 0,
        mapping.channel_id, mapping.tier_id || '', mapping.rank || 0, mapping.cents || 0);
}

// ── Tracked Members ─────────────────────────────────────────────────

export function sqliteGetTrackedMember(memberId: string) {
    return db.prepare('SELECT * FROM tracked_members WHERE member_id = ?').get(memberId) || null;
}

export function sqliteUpsertTrackedMember(member: {
    member_id: string; patron_name?: string; discord_id?: string;
    tier_name?: string; pledge_amount_cents?: number; status?: string;
}) {
    db.prepare(`
        INSERT INTO tracked_members (member_id, patron_name, discord_id, tier_name, pledge_amount_cents, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(member_id) DO UPDATE SET patron_name=?, discord_id=?, tier_name=?, pledge_amount_cents=?, status=?, updated_at=datetime('now')
    `).run(member.member_id, member.patron_name || '', member.discord_id || '', member.tier_name || '',
        member.pledge_amount_cents || 0, member.status || 'active',
        member.patron_name || '', member.discord_id || '', member.tier_name || '',
        member.pledge_amount_cents || 0, member.status || 'active');
}

export function sqliteGetAllTrackedMembers() {
    return db.prepare('SELECT * FROM tracked_members').all();
}

// ── Webhook Log ─────────────────────────────────────────────────────

/**
 * Insert a new row into webhook_log and return its ROWID.
 */
export function sqliteLogWebhookReceived(
    eventType: string,
    payload: any
): number | null {
    try {
        const memberId: string | null = payload?.data?.id ?? null;
        const result = db.prepare(`
            INSERT INTO webhook_log (event_type, member_id, payload, processed, announced)
            VALUES (?, ?, ?, 0, 0)
        `).run(eventType, memberId, JSON.stringify(payload));
        return result.lastInsertRowid as number;
    } catch {
        return null;
    }
}

/**
 * Mark a webhook_log row as processed.
 */
export function sqliteMarkWebhookProcessed(
    logId: number | null,
    announced: boolean,
    notes?: string
): void {
    if (logId === null) return;
    db.prepare(`
        UPDATE webhook_log
        SET processed = 1, announced = ?, notes = ?
        WHERE id = ?
    `).run(announced ? 1 : 0, notes ?? null, logId);
}

/**
 * Fetch recent webhook_log rows that were processed but not announced.
 */
export function sqliteGetMissedAnnouncements(limitHours = 24): any[] {
    const since = new Date(Date.now() - limitHours * 60 * 60 * 1000)
        .toISOString().replace('T', ' ').slice(0, 19);
    return db.prepare(`
        SELECT id, event_type, member_id, received_at, processed, announced, notes
        FROM webhook_log
        WHERE processed = 1 AND announced = 0
          AND received_at >= datetime(?)
        ORDER BY received_at DESC
    `).all(since);
}

/**
 * Fetch the most recent webhook_log rows (all, for audit).
 */
export function sqliteGetRecentWebhookLogs(limit = 50): any[] {
    return db.prepare(`
        SELECT id, event_type, member_id, received_at, processed, announced, notes
        FROM webhook_log
        ORDER BY received_at DESC
        LIMIT ?
    `).all(limit);
}

// ── Custom Messages ─────────────────────────────────────────────────

export function sqliteSetCustomMessage(type: string, content: string) {
    sqliteSetConfig(`message_template_${type}`, content);
}

export function sqliteGetCustomMessage(type: string): string | null {
    return sqliteGetConfig(`message_template_${type}`);
}

export function sqliteGetMessageTemplate(type: string): string | null {
    return sqliteGetConfig(`message_template_${type}`);
}

export function sqliteSetMessageTemplate(type: string, content: string): boolean {
    try {
        sqliteSetConfig(`message_template_${type}`, content);
        return true;
    } catch { return false; }
}
