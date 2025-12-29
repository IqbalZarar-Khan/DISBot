-- Fix RLS permissions for tracked_posts table
-- This is critical for the "Edit and Republish" workflow to work

-- Option 1: Disable RLS (Simplest for a bot-only table)
ALTER TABLE tracked_posts DISABLE ROW LEVEL SECURITY;

-- Option 2: Allow all operations (If you prefer to keep RLS enabled)
-- ALTER TABLE tracked_posts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all operations on tracked_posts"
--   ON tracked_posts
--   FOR ALL
--   USING (true)
--   WITH CHECK (true);

-- Ensure the table structure is correct
-- Note: We use 'post_id' instead of 'id' and 'last_tier_access' instead of 'tier' in our schema
-- This matches the TrackedPost interface in src/database/schema.ts

/*
CREATE TABLE IF NOT EXISTS tracked_posts (
  post_id TEXT PRIMARY KEY,
  last_tier_access TEXT NOT NULL,
  title TEXT,
  updated_at BIGINT
);
*/
