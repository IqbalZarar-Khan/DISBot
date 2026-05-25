-- Migration: Create webhook_log table for incoming webhook cache
-- DISBot: Stores every inbound Patreon webhook so the bot can audit
-- missed events (e.g. member join with no announcement).

CREATE TABLE IF NOT EXISTS webhook_log (
    id              BIGSERIAL PRIMARY KEY,
    event_type      TEXT NOT NULL,              -- e.g. members:create
    member_id       TEXT,                       -- data.id when available
    payload         JSONB NOT NULL,             -- full raw payload
    received_at     TIMESTAMPTZ DEFAULT NOW(),  -- wall-clock time of receipt
    processed       BOOLEAN DEFAULT FALSE,      -- set true once handler succeeds
    announced       BOOLEAN DEFAULT FALSE,      -- set true if Discord message was sent
    notes           TEXT                        -- optional debug notes
);

-- Index for quick look-up by event type or member
CREATE INDEX IF NOT EXISTS webhook_log_event_type_idx ON webhook_log (event_type);
CREATE INDEX IF NOT EXISTS webhook_log_member_id_idx  ON webhook_log (member_id);
CREATE INDEX IF NOT EXISTS webhook_log_received_at_idx ON webhook_log (received_at DESC);

-- RLS: service role has full access
ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhook_log_service_all" ON webhook_log;
CREATE POLICY "webhook_log_service_all" ON webhook_log
    FOR ALL
    USING (true)
    WITH CHECK (true);
