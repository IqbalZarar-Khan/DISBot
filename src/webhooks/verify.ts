import * as crypto from 'crypto';

/**
 * Verify Patreon webhook signature
 * @param payload - Raw request body as string
 * @param signature - X-Patreon-Signature header value
 * @param secret - Webhook secret from Patreon
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
): boolean {
    try {
        // Patreon uses MD5 HMAC for webhook signatures
        const hmac = crypto.createHmac('md5', secret);
        hmac.update(payload);
        const expectedSignature = hmac.digest('hex');

        // Compare signatures (timing-safe comparison)
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    } catch (error) {
        console.error('Error verifying webhook signature:', error);
        return false;
    }
}
