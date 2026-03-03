-- Bootstrap: Create exec_sql helper function for auto-migrations
-- This MUST be run once manually in the Supabase SQL Editor.
-- After this, all future migrations will apply automatically on bot startup.

CREATE OR REPLACE FUNCTION public.exec_sql(sql TEXT) 
RETURNS VOID AS $$
BEGIN
    EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create migrations tracking table
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mark this bootstrap and all existing base migrations as applied
INSERT INTO _migrations (filename) VALUES
    ('000_exec_sql_bootstrap.sql'),
    ('001_initial_schema.sql'),
    ('002_tier_mappings.sql'),
    ('003_tracked_members.sql')
ON CONFLICT (filename) DO NOTHING;
