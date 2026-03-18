-- 007: Create tier_snapshots table for Piggyback Diff Engine
-- Stores arrays of post IDs per tier so the diff engine can detect
-- silent drops to Free that Patreon doesn't send webhooks for.

CREATE TABLE IF NOT EXISTS tier_snapshots (
    tier_name VARCHAR PRIMARY KEY,
    post_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Match DISBot's zero-trust RLS model (service_role only)
ALTER TABLE tier_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_tier_snapshots"
    ON tier_snapshots
    FOR ALL
    TO authenticated, service_role
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
