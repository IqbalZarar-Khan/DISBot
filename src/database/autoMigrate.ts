import { getSupabase } from './supabase';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Auto-migration system.
 *
 * On startup, reads all .sql files from supabase/migrations/ (sorted),
 * tracks which have been applied in a _migrations table, and runs
 * any unapplied ones automatically.
 */
export async function runAutoMigrations(): Promise<void> {
    const supabase = getSupabase();

    console.log('📦 [MIGRATE] Checking database migrations...');

    // ── 1. Ensure _migrations tracking table exists ───────────────────
    const { error: createErr } = await supabase.rpc('exec_sql', {
        sql: `
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                filename TEXT UNIQUE NOT NULL,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            );
        `
    });

    // If the exec_sql RPC doesn't exist, we can't auto-migrate
    if (createErr && createErr.message.includes('exec_sql')) {
        console.warn('⚠️ [MIGRATE] Auto-migrations require a one-time bootstrap.');
        console.warn('   Run the contents of supabase/migrations/000_exec_sql_bootstrap.sql');
        console.warn('   in the Supabase SQL Editor. After that, all future migrations will auto-apply.');
        return;
    }

    // ── 2. Get list of already-applied migrations ─────────────────────
    const { data: applied } = await supabase
        .from('_migrations')
        .select('filename')
        .order('filename', { ascending: true });

    const appliedSet = new Set((applied || []).map(r => r.filename));

    // ── 3. Read migration files from disk ─────────────────────────────
    // In production (Docker/Railway), migrations are at /app/supabase/migrations/
    // In development, they're relative to the project root
    const possiblePaths = [
        path.join(process.cwd(), 'supabase', 'migrations'),
        path.join(__dirname, '..', '..', 'supabase', 'migrations'),
    ];

    let migrationsDir = '';
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            migrationsDir = p;
            break;
        }
    }

    if (!migrationsDir) {
        console.log('📦 [MIGRATE] No migrations directory found — skipping.');
        return;
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort(); // Lexicographic sort ensures correct order (001_, 002_, etc.)

    // ── 4. Apply pending migrations ───────────────────────────────────
    let applied_count = 0;

    for (const file of files) {
        if (appliedSet.has(file)) {
            continue; // Already applied
        }

        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        console.log(`📦 [MIGRATE] Applying: ${file}...`);

        // Try to execute via RPC first, then fall back
        const { error: execErr } = await supabase.rpc('exec_sql', { sql });

        if (execErr) {
            // If RPC doesn't exist, log instruction for manual application
            console.warn(`⚠️ [MIGRATE] Could not auto-apply ${file}: ${execErr.message}`);
            console.warn(`   → Please run this migration manually in the Supabase SQL Editor.`);
            continue;
        }

        // Record the migration
        await supabase.from('_migrations').insert({ filename: file });
        applied_count++;
        console.log(`✅ [MIGRATE] Applied: ${file}`);
    }

    if (applied_count === 0) {
        console.log('📦 [MIGRATE] All migrations up to date.');
    } else {
        console.log(`📦 [MIGRATE] Applied ${applied_count} new migration(s).`);
    }

    // ── 5. Post-migration schema verification ──────────────────────────
    try {
        // Verify webhook_log structure
        const { error: whErr } = await supabase
            .from('webhook_log')
            .select('id, event_type, member_name, discord_user_id')
            .limit(1);

        if (whErr) {
            console.warn(`⚠️ [MIGRATE] webhook_log schema warning: ${whErr.message}`);
        }

        // Verify tracked_members structure
        const { error: tmErr } = await supabase
            .from('tracked_members')
            .select('member_id, is_active')
            .limit(1);

        if (tmErr) {
            console.warn(`⚠️ [MIGRATE] tracked_members schema warning: ${tmErr.message}`);
        }
    } catch {
        // Verification is best-effort
    }
}
