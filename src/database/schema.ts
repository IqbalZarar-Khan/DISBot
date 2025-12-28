// Database schema interfaces

export interface TrackedPost {
    post_id: string;
    last_tier_access: string;
    title: string;
    updated_at: number;
}

export interface BotConfig {
    key: string;
    value: string;
}

export interface TierMapping {
    tier_id: string;
    tier_name: string;
    tier_rank: number;
    channel_id: string;
}

export interface TrackedMember {
    member_id: string;
    full_name: string;
    current_tier_id: string;
    email: string | null;
    joined_at: number;
    updated_at: number;
}

// Tier ranking enum (higher number = higher tier)
export enum TierRank {
    Free = 0,      // Lowest Priority - Public access
    Bronze = 25,   // Entry tier
    Silver = 50,   // Mid tier
    Gold = 75,     // Premium tier
    Diamond = 100  // Highest Priority - Top tier
}

// Webhook event types
export type WebhookEventType =
    | 'members:create'
    | 'members:update'
    | 'members:delete'
    | 'members:pledge:create'
    | 'members:pledge:update'
    | 'members:pledge:delete'
    | 'posts:publish'
    | 'posts:update'
    | 'posts:delete';

export interface WebhookPayload {
    data: any;
    included?: any[];
    links?: any;
}
