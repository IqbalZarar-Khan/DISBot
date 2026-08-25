-- Migration 014: Add discord_user_id to webhook_log
-- Preserves Discord user ID separately from PII-scrubbed payload
-- so event replays can still target the correct user for DMs.

ALTER TABLE webhook_log ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

CREATE INDEX IF NOT EXISTS webhook_log_discord_user_id_idx ON webhook_log (discord_user_id);
