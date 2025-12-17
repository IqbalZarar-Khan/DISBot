import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { TrackedPost, BotConfig, TierMapping, TrackedMember } from './schema';

let db: Database | null = null;

/**
 * Initialize the SQLite database
 */
export async function initDatabase(dbPath: string): Promise<void> {
    const SQL = await initSqlJs();

    // Check if database file exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
        console.log('✅ Database loaded from file');
    } else {
        db = new SQL.Database();
        console.log('✅ New database created');
    }

    // Create tables
    createTables();

    // Save database to file
    saveDatabase(dbPath);
}

/**
 * Create database tables if they don't exist
 */
function createTables(): void {
    if (!db) throw new Error('Database not initialized');

    // Tracked posts table
    db.run(`
    CREATE TABLE IF NOT EXISTS tracked_posts (
      post_id TEXT PRIMARY KEY,
      last_tier_access TEXT NOT NULL,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

    // Bot configuration table
    db.run(`
    CREATE TABLE IF NOT EXISTS bot_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

    // Tier mappings table
    db.run(`
    CREATE TABLE IF NOT EXISTS tier_mappings (
      tier_id TEXT PRIMARY KEY,
      tier_name TEXT NOT NULL,
      tier_rank INTEGER NOT NULL,
      channel_id TEXT NOT NULL
    )
  `);

    // Tracked members table
    db.run(`
    CREATE TABLE IF NOT EXISTS tracked_members (
      member_id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      current_tier_id TEXT NOT NULL,
      email TEXT,
      joined_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

    console.log('✅ Database tables created');
}

/**
 * Save database to file
 */
export function saveDatabase(dbPath: string): void {
    if (!db) throw new Error('Database not initialized');

    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

/**
 * Get database instance
 */
export function getDatabase(): Database {
    if (!db) throw new Error('Database not initialized');
    return db;
}

// ===== TRACKED POSTS OPERATIONS =====

export function getTrackedPost(postId: string): TrackedPost | null {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT * FROM tracked_posts WHERE post_id = ?');
    stmt.bind([postId]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        return {
            post_id: row.post_id,
            last_tier_access: row.last_tier_access,
            title: row.title,
            updated_at: row.updated_at
        };
    }

    stmt.free();
    return null;
}

export function upsertTrackedPost(post: TrackedPost, dbPath: string): void {
    if (!db) throw new Error('Database not initialized');

    db.run(`
    INSERT OR REPLACE INTO tracked_posts (post_id, last_tier_access, title, updated_at)
    VALUES (?, ?, ?, ?)
  `, [post.post_id, post.last_tier_access, post.title, post.updated_at]);

    saveDatabase(dbPath);
}

// ===== BOT CONFIG OPERATIONS =====

export function getConfig(key: string): string | null {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT value FROM bot_config WHERE key = ?');
    stmt.bind([key]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        return row.value;
    }

    stmt.free();
    return null;
}

export function setConfig(key: string, value: string, dbPath: string): void {
    if (!db) throw new Error('Database not initialized');

    db.run(`
    INSERT OR REPLACE INTO bot_config (key, value)
    VALUES (?, ?)
  `, [key, value]);

    saveDatabase(dbPath);
}

// ===== TIER MAPPINGS OPERATIONS =====

export function getTierMapping(tierId: string): TierMapping | null {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT * FROM tier_mappings WHERE tier_id = ?');
    stmt.bind([tierId]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        return {
            tier_id: row.tier_id,
            tier_name: row.tier_name,
            tier_rank: row.tier_rank,
            channel_id: row.channel_id
        };
    }

    stmt.free();
    return null;
}

export function getTierMappingByName(tierName: string): TierMapping | null {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT * FROM tier_mappings WHERE tier_name = ?');
    stmt.bind([tierName]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        return {
            tier_id: row.tier_id,
            tier_name: row.tier_name,
            tier_rank: row.tier_rank,
            channel_id: row.channel_id
        };
    }

    stmt.free();
    return null;
}

export function getAllTierMappings(): TierMapping[] {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT * FROM tier_mappings ORDER BY tier_rank DESC');
    const mappings: TierMapping[] = [];

    while (stmt.step()) {
        const row = stmt.getAsObject() as any;
        mappings.push({
            tier_id: row.tier_id,
            tier_name: row.tier_name,
            tier_rank: row.tier_rank,
            channel_id: row.channel_id
        });
    }

    stmt.free();
    return mappings;
}

export function upsertTierMapping(mapping: TierMapping, dbPath: string): void {
    if (!db) throw new Error('Database not initialized');

    db.run(`
    INSERT OR REPLACE INTO tier_mappings (tier_id, tier_name, tier_rank, channel_id)
    VALUES (?, ?, ?, ?)
  `, [mapping.tier_id, mapping.tier_name, mapping.tier_rank, mapping.channel_id]);

    saveDatabase(dbPath);
}

// ===== TRACKED MEMBERS OPERATIONS =====

export function getTrackedMember(memberId: string): TrackedMember | null {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT * FROM tracked_members WHERE member_id = ?');
    stmt.bind([memberId]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        return {
            member_id: row.member_id,
            full_name: row.full_name,
            current_tier_id: row.current_tier_id,
            email: row.email,
            joined_at: row.joined_at,
            updated_at: row.updated_at
        };
    }

    stmt.free();
    return null;
}

export function upsertTrackedMember(member: TrackedMember, dbPath: string): void {
    if (!db) throw new Error('Database not initialized');

    db.run(`
    INSERT OR REPLACE INTO tracked_members (member_id, full_name, current_tier_id, email, joined_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [member.member_id, member.full_name, member.current_tier_id, member.email, member.joined_at, member.updated_at]);

    saveDatabase(dbPath);
}

export function getAllTrackedMembers(): TrackedMember[] {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT * FROM tracked_members ORDER BY updated_at DESC');
    const members: TrackedMember[] = [];

    while (stmt.step()) {
        const row = stmt.getAsObject() as any;
        members.push({
            member_id: row.member_id,
            full_name: row.full_name,
            current_tier_id: row.current_tier_id,
            email: row.email,
            joined_at: row.joined_at,
            updated_at: row.updated_at
        });
    }

    stmt.free();
    return members;
}
