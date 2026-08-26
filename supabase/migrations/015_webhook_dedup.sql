-- Migration 015: Add dedup_hash to webhook_log
-- Provides database-backed cross-instance deduplication for clusters running without Redis.

ALTER TABLE webhook_log ADD COLUMN IF NOT EXISTS dedup_hash TEXT;

CREATE INDEX IF NOT EXISTS webhook_log_dedup_hash_idx ON webhook_log (dedup_hash);
