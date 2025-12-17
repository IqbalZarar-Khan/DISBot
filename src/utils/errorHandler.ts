import { Client } from 'discord.js';
import { logger } from '../utils/logger';

/**
 * Error handler wrapper for async functions
 */
export function asyncErrorHandler<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: string
): T {
    return (async (...args: any[]) => {
        try {
            return await fn(...args);
        } catch (error) {
            logger.error(`Error in ${context}`, error as Error);
            throw error;
        }
    }) as T;
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    context: string = 'operation'
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                logger.warn(`${context} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    logger.error(`${context} failed after ${maxRetries} attempts`, lastError!);
    throw lastError;
}

/**
 * Safe channel send with error handling
 */
export async function safeChannelSend(
    client: Client,
    channelId: string,
    content: any
): Promise<boolean> {
    try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || !channel.isTextBased()) {
            logger.warn(`Channel ${channelId} not found or not text-based`);
            return false;
        }

        await (channel as any).send(content);
        return true;
    } catch (error) {
        logger.error(`Failed to send message to channel ${channelId}`, error as Error);
        return false;
    }
}

/**
 * Validate environment configuration
 */
export function validateEnvironment(required: string[]): void {
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

/**
 * Parse Patreon API error
 */
export function parsePatreonError(error: any): string {
    if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        return errors.map((e: any) => e.detail || e.title || 'Unknown error').join(', ');
    }

    return error.message || 'Unknown Patreon API error';
}
