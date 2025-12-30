import { WebhookPayload } from '../../database/schema';
import { db } from '../../database/db'; // Only importing DB logic - NO Discord imports

/**
 * Handle posts:delete webhook event (SILENT - No Discord Notifications)
 * Triggered when a post is deleted from Patreon
 * 
 * This handler ONLY removes the post from the database.
 * It does NOT send any notifications to Discord channels.
 */
export async function handlePostsDelete(payload: WebhookPayload): Promise<void> {
    try {
        // 1. Extract the Post ID from the webhook payload
        const post = payload.data;

        // Safety check: ensure ID exists
        if (!post || !post.id) {
            console.warn('⚠️ [WEBHOOK] Received posts:delete but no ID was found.');
            return;
        }

        const postId = post.id;
        const title = post.attributes?.title || 'Untitled Post';

        console.log(`🗑️ [WEBHOOK] Processing silent delete for Post ID: ${postId}`);
        console.log(`🗑️ [WEBHOOK] Post Title: "${title}"`);

        // 2. Perform Database Cleanup (Silent)
        // We await the result just for logging, but we do not trigger any alerts.
        const success = await db.deletePost(postId);

        if (success) {
            console.log(`✅ [CLEANUP] Post ${postId} wiped from database.`);
            console.log(`✅ [CLEANUP] No Discord notifications sent (silent mode).`);
        } else {
            console.warn(`⚠️ [CLEANUP] Database delete operation for ${postId} reported failure (or item not found).`);
        }

    } catch (error) {
        console.error('❌ [WEBHOOK ERROR] Error processing posts:delete:', error);
        throw error;
    }
}
