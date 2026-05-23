-- 008: Drop stale permissive "Allow all operations" policies
-- Fixes lint: RLS Policy Always True on public.bot_config (and potentially others)
--
-- Migration 006 dropped policies named "Allow all operations on <table>",
-- but the original policies (from 001-003) were likely named just
-- "Allow all operations" without the table suffix. This migration cleans
-- up any surviving permissive policies across all tables.

-- bot_config
DROP POLICY IF EXISTS "Allow all operations" ON bot_config;

-- tracked_posts
DROP POLICY IF EXISTS "Allow all operations" ON tracked_posts;

-- tracked_members
DROP POLICY IF EXISTS "Allow all operations" ON tracked_members;

-- tier_mappings
DROP POLICY IF EXISTS "Allow all operations" ON tier_mappings;

-- custom_messages
DROP POLICY IF EXISTS "Allow all operations" ON custom_messages;
