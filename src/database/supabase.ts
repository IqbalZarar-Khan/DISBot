import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let supabase: SupabaseClient | null = null;

/**
 * Initialize Supabase client
 */
export function initSupabase(): SupabaseClient {
    if (!supabase) {
        supabase = createClient(config.supabaseUrl, config.supabaseKey);
        console.log('✅ Supabase client initialized');
    }
    return supabase;
}

/**
 * Get Supabase client instance
 */
export function getSupabase(): SupabaseClient {
    if (!supabase) {
        throw new Error('Supabase not initialized. Call initSupabase() first.');
    }
    return supabase;
}
