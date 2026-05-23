-- 007: Enable RLS on the _migrations tracking table
-- Fixes Supabase warning: "rls_disabled_in_public" on _migrations table
-- This table is only accessed by the service_role backend during auto-migrations

ALTER TABLE _migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_migrations"
  ON _migrations
  FOR ALL
  TO authenticated, service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
