import { getSupabase } from './supabase';
import { TrackedPost, TierMapping, TrackedMember } from './schema';

/**
 * Initialize the database (Supabase connection)
 */
export async function initDatabase(): Promise<void> {
    try {
        const supabase = getSupabase();

        // Test connection by querying a table
        const { error } = await supabase.from('bot_config').select('key').limit(1);

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned, which is fine
            throw error;
        }

        console.log('✅ Database connected (Supabase)');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}

// ===== TRACKED POSTS OPERATIONS =====

export async function getTrackedPost(postId: string): Promise<TrackedPost | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('tracked_posts')
        .select('*')
        .eq('post_id', postId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows found
        throw error;
    }

    return data as TrackedPost;
}

export async function upsertTrackedPost(post: TrackedPost): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('tracked_posts')
        .upsert(post, { onConflict: 'post_id' });

    if (error) throw error;
}

export async function deleteTrackedPost(postId: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('tracked_posts')
        .delete()
        .eq('post_id', postId);

    if (error) throw error;
}

// ===== BOT CONFIG OPERATIONS =====

export async function getConfig(key: string): Promise<string | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('bot_config')
        .select('value')
        .eq('key', key)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows found
        throw error;
    }

    return data.value;
}

export async function setConfig(key: string, value: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('bot_config')
        .upsert({ key, value }, { onConflict: 'key' });

    if (error) throw error;
}

// ===== TIER MAPPINGS OPERATIONS =====

export async function getTierMapping(tierId: string): Promise<TierMapping | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('tier_mappings')
        .select('*')
        .eq('tier_id', tierId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows found
        throw error;
    }

    return data as TierMapping;
}

export async function getTierMappingByName(tierName: string): Promise<TierMapping | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('tier_mappings')
        .select('*')
        .eq('tier_name', tierName)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows found
        throw error;
    }

    return data as TierMapping;
}

export async function getAllTierMappings(): Promise<TierMapping[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('tier_mappings')
        .select('*')
        .order('tier_rank', { ascending: false });

    if (error) throw error;

    return (data as TierMapping[]) || [];
}

export async function upsertTierMapping(mapping: TierMapping): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('tier_mappings')
        .upsert(mapping, { onConflict: 'tier_id' });

    if (error) throw error;
}

// ===== TRACKED MEMBERS OPERATIONS =====

export async function getTrackedMember(memberId: string): Promise<TrackedMember | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('tracked_members')
        .select('*')
        .eq('member_id', memberId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows found
        throw error;
    }

    return data as TrackedMember;
}

export async function upsertTrackedMember(member: TrackedMember): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('tracked_members')
        .upsert(member, { onConflict: 'member_id' });

    if (error) throw error;
}

export async function getAllTrackedMembers(): Promise<TrackedMember[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('tracked_members')
        .select('*')
        .order('updated_at', { ascending: false });

    if (error) throw error;

    return (data as TrackedMember[]) || [];
}

// ===== CUSTOM MESSAGES OPERATIONS =====

/**
 * Save a custom message template
 */
export async function setCustomMessage(type: string, content: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
        .from('custom_messages')
        .upsert({ type, content }, { onConflict: 'type' });

    if (error) throw error;
}

/**
 * Retrieve a custom message template
 */
export async function getCustomMessage(type: string): Promise<string | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('custom_messages')
        .select('content')
        .eq('type', type)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows found
        throw error;
    }

    return data.content;
}

// ===== UNIFIED DATABASE INTERFACE =====

/**
 * Unified database interface for cleaner API
 * Ensures correct mapping to database schema (last_tier_access, post_id, etc.)
 */
export const db = {
    /**
     * Save a post to the database
     * @param postId - Patreon post ID
     * @param tierName - Tier name (e.g., "Diamond", "Gold")
     * @param postTitle - Post title
     */
    addPost: async (postId: string, tierName: string, postTitle: string = 'Untitled'): Promise<void> => {
        const payload: TrackedPost = {
            post_id: postId,
            last_tier_access: tierName, // ✅ Correct mapping to database column
            title: postTitle,
            updated_at: Date.now() // ✅ Current Unix timestamp
        };

        await upsertTrackedPost(payload);
        console.log(`✅ 💾 Saved to tracked_posts: ${postId} -> ${tierName}`);
    },

    /**
     * Get a post from the database
     * @param postId - Patreon post ID
     * @returns TrackedPost object or null if not found
     */
    getPost: async (postId: string): Promise<TrackedPost | null> => {
        return await getTrackedPost(postId);
    },

    /**
     * Save a custom message template
     */
    setCustomMessage: setCustomMessage,

    /**
     * Retrieve a custom message template
     */
    getCustomMessage: getCustomMessage
};
