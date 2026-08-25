-- Migration: Add is_active column to tracked_members
-- DISBot: Departed members are kept for history (win-back DMs, anniversary
-- checks), which made it impossible to tell a *returning* member from a
-- currently-active one. Without that distinction, a member who rejoined as a
-- paid patron got no welcome announcement: members:create saw "already in
-- DB" and stayed silent, and members:pledge:create treated them as an
-- existing member (silent when the tier matched their old one).
--
-- is_active = false marks a member who left the campaign (members:delete);
-- create/pledge events flip it back to true and trigger a welcome-back.

ALTER TABLE tracked_members
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
