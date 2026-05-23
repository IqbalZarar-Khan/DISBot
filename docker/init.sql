-- DISBot — Database Initialization
-- This script runs automatically on first start via docker-compose.
-- It creates all tables required by the bot.

-- ══════════════════════════════════════════════════════════════════
-- tracked_posts — stores posts the bot has seen for waterfall logic
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tracked_posts (
    post_id TEXT PRIMARY KEY,
    last_tier_access TEXT NOT NULL,
    title TEXT,
    updated_at BIGINT
);

-- ══════════════════════════════════════════════════════════════════
-- tier_mappings — maps Patreon tiers to Discord channels
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tier_mappings (
    tier_id TEXT PRIMARY KEY,
    tier_name TEXT NOT NULL,
    tier_rank INTEGER NOT NULL DEFAULT 0,
    channel_id TEXT NOT NULL
);

-- ══════════════════════════════════════════════════════════════════
-- tracked_members — tracks Patreon patrons for member events
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tracked_members (
    member_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    current_tier_id TEXT,
    email TEXT,
    joined_at BIGINT,
    updated_at BIGINT
);

-- ══════════════════════════════════════════════════════════════════
-- bot_config — general key-value config store
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bot_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ══════════════════════════════════════════════════════════════════
-- custom_messages — customizable message templates
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS custom_messages (
    type TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default message templates
INSERT INTO custom_messages (type, content) VALUES
    ('welcome',        'Welcome {user}! Thank you for pledging to the {tier} tier! 🎉'),
    ('post_new',       '📢 New {tier} post: **{title}**\n{url}'),
    ('post_waterfall', '🌊 This post is now available to {tier}! **{title}**\n{url}')
ON CONFLICT (type) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- role_mappings — maps Patreon tiers to Discord roles (auto-sync)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS role_mappings (
    tier_id TEXT PRIMARY KEY,
    tier_name TEXT NOT NULL,
    discord_role_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- discord_links — links Discord users to Patreon members (role sync)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS discord_links (
    discord_user_id TEXT PRIMARY KEY,
    patreon_member_id TEXT NOT NULL UNIQUE,
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
