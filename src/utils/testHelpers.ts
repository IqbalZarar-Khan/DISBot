/**
 * Test utilities for simulating Patreon webhook payloads
 */

export const mockWebhookPayloads = {
    /**
     * Mock members:create payload
     */
    membersCreate: {
        data: {
            id: 'member_123',
            type: 'member',
            attributes: {
                full_name: 'John Doe',
                email: 'john@example.com',
                patron_status: 'active_patron'
            },
            relationships: {
                currently_entitled_tiers: {
                    data: [
                        { id: 'tier_gold', type: 'tier' }
                    ]
                }
            }
        },
        included: [
            {
                id: 'tier_gold',
                type: 'tier',
                attributes: {
                    title: 'Gold',
                    amount_cents: 2500
                }
            }
        ]
    },

    /**
     * Mock members:update payload (upgrade)
     */
    membersUpdateUpgrade: {
        data: {
            id: 'member_123',
            type: 'member',
            attributes: {
                full_name: 'John Doe',
                email: 'john@example.com',
                patron_status: 'active_patron'
            },
            relationships: {
                currently_entitled_tiers: {
                    data: [
                        { id: 'tier_diamond', type: 'tier' }
                    ]
                }
            }
        },
        included: [
            {
                id: 'tier_diamond',
                type: 'tier',
                attributes: {
                    title: 'Diamond',
                    amount_cents: 5000
                }
            }
        ]
    },

    /**
     * Mock members:delete payload
     */
    membersDelete: {
        data: {
            id: 'member_123',
            type: 'member'
        }
    },

    /**
     * Mock posts:publish payload
     */
    postsPublish: {
        data: {
            id: 'post_456',
            type: 'post',
            attributes: {
                title: 'Chapter 55: The Awakening',
                url: 'https://www.patreon.com/posts/chapter-55-456',
                published_at: '2024-01-15T10:00:00Z',
                tags: ['fantasy', 'action']
            },
            relationships: {
                tiers: {
                    data: [
                        { id: 'tier_diamond', type: 'tier' }
                    ]
                }
            }
        },
        included: [
            {
                id: 'tier_diamond',
                type: 'tier',
                attributes: {
                    title: 'Diamond',
                    amount_cents: 5000
                }
            }
        ]
    },

    /**
     * Mock posts:update payload (waterfall: Diamond -> Gold)
     */
    postsUpdateWaterfall: {
        data: {
            id: 'post_456',
            type: 'post',
            attributes: {
                title: 'Chapter 55: The Awakening',
                url: 'https://www.patreon.com/posts/chapter-55-456',
                published_at: '2024-01-15T10:00:00Z',
                tags: ['fantasy', 'action']
            },
            relationships: {
                tiers: {
                    data: [
                        { id: 'tier_gold', type: 'tier' }
                    ]
                }
            }
        },
        included: [
            {
                id: 'tier_gold',
                type: 'tier',
                attributes: {
                    title: 'Gold',
                    amount_cents: 2500
                }
            }
        ]
    },

    /**
     * Mock posts:update payload (no tier change)
     */
    postsUpdateNoChange: {
        data: {
            id: 'post_456',
            type: 'post',
            attributes: {
                title: 'Chapter 55: The Awakening (Updated)',
                url: 'https://www.patreon.com/posts/chapter-55-456',
                published_at: '2024-01-15T10:00:00Z',
                tags: ['fantasy', 'action', 'updated']
            },
            relationships: {
                tiers: {
                    data: [
                        { id: 'tier_gold', type: 'tier' }
                    ]
                }
            }
        },
        included: [
            {
                id: 'tier_gold',
                type: 'tier',
                attributes: {
                    title: 'Gold',
                    amount_cents: 2500
                }
            }
        ]
    }
};

/**
 * Generate webhook signature for testing
 */
export function generateTestSignature(payload: string, secret: string): string {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('md5', secret);
    hmac.update(payload);
    return hmac.digest('hex');
}

/**
 * Test webhook endpoint
 */
export async function testWebhookEndpoint(
    url: string,
    eventType: string,
    payload: any,
    secret: string
): Promise<boolean> {
    const axios = require('axios');
    const payloadString = JSON.stringify(payload);
    const signature = generateTestSignature(payloadString, secret);

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Patreon-Event': eventType,
                'X-Patreon-Signature': signature
            }
        });

        return response.status === 200;
    } catch (error) {
        console.error('Webhook test failed:', error);
        return false;
    }
}
