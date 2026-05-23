-- 009: Fix mutable search_path on exec_sql function
-- Fixes lint: Function Search Path Mutable on public.exec_sql
--
-- The exec_sql function is SECURITY DEFINER (runs as owner), so it must
-- pin its search_path to prevent schema-based privilege escalation.

CREATE OR REPLACE FUNCTION public.exec_sql(sql TEXT)
RETURNS VOID AS $$
BEGIN
    EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
