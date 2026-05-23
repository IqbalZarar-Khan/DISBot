-- Migration: Create role_mappings and discord_links tables for Discord role sync
-- DISBot v2 Phase 2: Core Expansion

-- Role mappings: Patreon tier → Discord role
CREATE TABLE IF NOT EXISTS role_mappings (
    tier_id TEXT PRIMARY KEY,
    tier_name TEXT NOT NULL,
    discord_role_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discord links: Discord user ↔ Patreon member
CREATE TABLE IF NOT EXISTS discord_links (
    discord_user_id TEXT PRIMARY KEY,
    patreon_member_id TEXT NOT NULL UNIQUE,
    linked_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies for role_mappings
ALTER TABLE role_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_mappings_service_all" ON role_mappings;
CREATE POLICY "role_mappings_service_all" ON role_mappings
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- RLS policies for discord_links
ALTER TABLE discord_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "discord_links_service_all" ON discord_links;
CREATE POLICY "discord_links_service_all" ON discord_links
    FOR ALL
    USING (true)
    WITH CHECK (true);
