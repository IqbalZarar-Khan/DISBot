-- 006: Tighten RLS policies — restrict to authenticated (service_role) connections only
-- Replaces the previous permissive USING(true) policies with role-based access

-- ═══════════════════════════════════════════════════════════════
-- tracked_posts — only service_role backend can read/write
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all operations on tracked_posts" ON tracked_posts;
ALTER TABLE tracked_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_tracked_posts"
  ON tracked_posts
  FOR ALL
  TO authenticated, service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- tracked_members — only service_role
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE tracked_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on tracked_members" ON tracked_members;

CREATE POLICY "service_role_only_tracked_members"
  ON tracked_members
  FOR ALL
  TO authenticated, service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- bot_config — only service_role
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on bot_config" ON bot_config;

CREATE POLICY "service_role_only_bot_config"
  ON bot_config
  FOR ALL
  TO authenticated, service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- tier_mappings — only service_role
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE tier_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on tier_mappings" ON tier_mappings;

CREATE POLICY "service_role_only_tier_mappings"
  ON tier_mappings
  FOR ALL
  TO authenticated, service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- custom_messages — only service_role
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE custom_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on custom_messages" ON custom_messages;

CREATE POLICY "service_role_only_custom_messages"
  ON custom_messages
  FOR ALL
  TO authenticated, service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
