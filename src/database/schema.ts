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

// Tier ranking enum
export enum TierRank {
    Free = 0,
    Bronze = 1,
    Silver = 2,
    Gold = 3,
    Diamond = 4
}

// Webhook event types
export type WebhookEventType =
    | 'members:create'
    | 'members:update'
    | 'members:delete'
    | 'posts:publish'
    | 'posts:update'
    | 'posts:delete';

export interface WebhookPayload {
    data: any;
    included?: any[];
    links?: any;
}
