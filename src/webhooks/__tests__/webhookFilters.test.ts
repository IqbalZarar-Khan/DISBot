/**
 * Unit tests for the inbound webhook filters (dedup guard + ghost filter).
 */
import { isDuplicate, isGhostWebhook, clearFilterState } from '../webhookFilters';

beforeEach(() => {
    clearFilterState();
});

// ── Dedup guard ───────────────────────────────────────────────────────────────

describe('isDuplicate', () => {
    const body = JSON.stringify({ data: { id: '123' } });

    it('flags an identical body+event retried within the TTL', () => {
        expect(isDuplicate(body, 'members:create')).toBe(false); // first sighting
        expect(isDuplicate(body, 'members:create')).toBe(true);  // Patreon retry
        expect(isDuplicate(body, 'members:create')).toBe(true);  // and again
    });

    it('treats different event types as distinct', () => {
        isDuplicate(body, 'members:create');
        expect(isDuplicate(body, 'members:update')).toBe(false);
    });

    it('treats different bodies as distinct', () => {
        isDuplicate(body, 'members:create');
        expect(isDuplicate(JSON.stringify({ data: { id: '456' } }), 'members:create')).toBe(false);
    });

    it('forgets entries after the 60s TTL expires', () => {
        jest.useFakeTimers();
        jest.setSystemTime(1_700_000_000_000);

        expect(isDuplicate(body, 'members:create')).toBe(false);
        expect(isDuplicate(body, 'members:create')).toBe(true);

        jest.setSystemTime(1_700_000_000_000 + 61_000); // past the TTL
        expect(isDuplicate(body, 'members:create')).toBe(false);

        jest.useRealTimers();
    });
});

// ── Ghost webhook filter ──────────────────────────────────────────────────────

describe('isGhostWebhook', () => {
    const memberUpdate = {
        data: {
            id: 'member-1',
            attributes: {
                patron_status: 'active_patron',
                currently_entitled_amount_cents: 1500,
            },
            relationships: {
                currently_entitled_tiers: { data: [{ id: 'tier-a', type: 'tier' }] },
            },
        },
    };

    const postUpdate = (title: string, minCents = 500) => ({
        data: {
            id: 'post-1',
            attributes: {
                title,
                min_cents_pledged_to_view: minCents,
                current_user_can_view: true,
            },
            relationships: {
                access_rules: { data: [{ id: 'rule-1', type: 'access-rule' }] },
            },
        },
    });

    it('never filters create/delete events, even with identical payloads', () => {
        expect(isGhostWebhook(memberUpdate, 'members:create')).toBe(false);
        expect(isGhostWebhook(memberUpdate, 'members:create')).toBe(false);
        expect(isGhostWebhook(memberUpdate, 'members:delete')).toBe(false);
        expect(isGhostWebhook(postUpdate('Same'), 'posts:publish')).toBe(false);
    });

    it('discards a members:update with unchanged meaningful state', () => {
        expect(isGhostWebhook(memberUpdate, 'members:update')).toBe(false); // first sighting records state
        expect(isGhostWebhook(memberUpdate, 'members:update')).toBe(true);  // same state → ghost
    });

    it('lets a members:update through when the pledge amount changed', () => {
        isGhostWebhook(memberUpdate, 'members:update');
        const changed = {
            data: {
                ...memberUpdate.data,
                attributes: { ...memberUpdate.data.attributes, currently_entitled_amount_cents: 2500 },
            },
        };
        expect(isGhostWebhook(changed, 'members:update')).toBe(false);
    });

    it('lets a members:update through when the entitled tier changed', () => {
        isGhostWebhook(memberUpdate, 'members:update');
        const changed = JSON.parse(JSON.stringify(memberUpdate));
        changed.data.relationships.currently_entitled_tiers.data[0].id = 'tier-b';
        expect(isGhostWebhook(changed, 'members:update')).toBe(false);
    });

    it('lets a members:update through when patron_status changed', () => {
        isGhostWebhook(memberUpdate, 'members:update');
        const declined = JSON.parse(JSON.stringify(memberUpdate));
        declined.data.attributes.patron_status = 'declined_patron';
        expect(isGhostWebhook(declined, 'members:update')).toBe(false);
    });

    it('discards a posts:update with unchanged title/tiers/cents', () => {
        expect(isGhostWebhook(postUpdate('Chapter 1'), 'posts:update')).toBe(false);
        expect(isGhostWebhook(postUpdate('Chapter 1'), 'posts:update')).toBe(true);
    });

    it('lets a posts:update through when the title changed', () => {
        isGhostWebhook(postUpdate('Chapter 1'), 'posts:update');
        expect(isGhostWebhook(postUpdate('Chapter 1 (edited)'), 'posts:update')).toBe(false);
    });

    it('lets a posts:update through when the access tier set changed', () => {
        isGhostWebhook(postUpdate('Chapter 1'), 'posts:update');
        const widened = {
            data: {
                ...postUpdate('Chapter 1').data,
                relationships: {
                    access_rules: {
                        data: [
                            { id: 'rule-1', type: 'access-rule' },
                            { id: 'rule-2', type: 'access-rule' },
                        ],
                    },
                },
            },
        };
        expect(isGhostWebhook(widened, 'posts:update')).toBe(false);
    });

    it('treats access rule sets as order-insensitive', () => {
        const a = {
            data: {
                id: 'post-2',
                attributes: { title: 'T', min_cents_pledged_to_view: 100 },
                relationships: {
                    access_rules: { data: [{ id: 'r1' }, { id: 'r2' }] },
                },
            },
        };
        const b = JSON.parse(JSON.stringify(a));
        b.data.relationships.access_rules.data.reverse();

        expect(isGhostWebhook(a, 'posts:update')).toBe(false);
        expect(isGhostWebhook(b, 'posts:update')).toBe(true); // same set, different order
    });

    it('forgets state after the 5 minute TTL expires', () => {
        jest.useFakeTimers();
        jest.setSystemTime(1_700_000_000_000);

        isGhostWebhook(memberUpdate, 'members:update');
        expect(isGhostWebhook(memberUpdate, 'members:update')).toBe(true);

        jest.setSystemTime(1_700_000_000_000 + 5 * 60_000 + 1_000); // past the TTL
        expect(isGhostWebhook(memberUpdate, 'members:update')).toBe(false);

        jest.useRealTimers();
    });

    it('lets webhooks through when the payload has no data section', () => {
        expect(isGhostWebhook(null, 'members:update')).toBe(false);
        expect(isGhostWebhook({}, 'members:update')).toBe(false);
        expect(isGhostWebhook({ data: null }, 'members:update')).toBe(false);
    });
});
