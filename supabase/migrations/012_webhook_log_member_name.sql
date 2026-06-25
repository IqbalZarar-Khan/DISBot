-- Migration: Add member_name column to webhook_log
-- DISBot: Stores the extracted member name at insert time so weekly
-- digest queries can avoid fetching the full JSONB payload.

ALTER TABLE webhook_log
    ADD COLUMN IF NOT EXISTS member_name TEXT;

-- Backfill existing rows from the stored payload (best-effort).
-- This extracts the name from the JSONB using the same paths the
-- old extractMemberName() function used.
UPDATE webhook_log
SET member_name = COALESCE(
    payload -> 'data' -> 'attributes' ->> 'full_name',
    (
        SELECT u.val -> 'attributes' ->> 'full_name'
        FROM jsonb_array_elements(payload -> 'included') AS u(val)
        WHERE u.val ->> 'type' = 'user'
        LIMIT 1
    ),
    'Unknown'
)
WHERE member_name IS NULL;
