import { queueMemberUpsert, getBufferedMember, clearBatchBuffer, getBatchBufferSize } from '../batchWriter';
import { TrackedMember } from '../schema';

describe('batchWriter', () => {
    beforeEach(() => {
        clearBatchBuffer();
    });

    test('queueMemberUpsert defaults is_active to true when omitted', () => {
        const memberWithoutActive: TrackedMember = {
            member_id: 'm1',
            full_name: 'Test Patron',
            current_tier_id: 'gold',
            email: 'test@example.com',
            joined_at: 1000,
            updated_at: 1000,
        };

        queueMemberUpsert(memberWithoutActive);

        const buffered = getBufferedMember('m1');
        expect(buffered).toBeDefined();
        expect(buffered?.is_active).toBe(true);
    });

    test('queueMemberUpsert preserves is_active=false when explicitly false', () => {
        const inactiveMember: TrackedMember = {
            member_id: 'm2',
            full_name: 'Departed Patron',
            current_tier_id: 'free',
            email: null,
            joined_at: 1000,
            updated_at: 2000,
            is_active: false,
        };

        queueMemberUpsert(inactiveMember);

        const buffered = getBufferedMember('m2');
        expect(buffered).toBeDefined();
        expect(buffered?.is_active).toBe(false);
    });

    test('queueMemberUpsert preserves is_active=true when explicitly true', () => {
        const activeMember: TrackedMember = {
            member_id: 'm3',
            full_name: 'Active Patron',
            current_tier_id: 'diamond',
            email: 'active@example.com',
            joined_at: 1000,
            updated_at: 2000,
            is_active: true,
        };

        queueMemberUpsert(activeMember);

        const buffered = getBufferedMember('m3');
        expect(buffered).toBeDefined();
        expect(buffered?.is_active).toBe(true);
    });

    test('multiple members in buffer all have explicit boolean is_active', () => {
        queueMemberUpsert({
            member_id: 'm1',
            full_name: 'Member 1',
            current_tier_id: 'silver',
            email: null,
            joined_at: 1000,
            updated_at: 1000,
            is_active: true,
        });

        queueMemberUpsert({
            member_id: 'm2',
            full_name: 'Member 2',
            current_tier_id: 'free',
            email: null,
            joined_at: 1000,
            updated_at: 1000,
            // is_active omitted
        });

        queueMemberUpsert({
            member_id: 'm3',
            full_name: 'Member 3',
            current_tier_id: 'free',
            email: null,
            joined_at: 1000,
            updated_at: 1000,
            is_active: false,
        });

        expect(getBatchBufferSize()).toBe(3);
        expect(typeof getBufferedMember('m1')?.is_active).toBe('boolean');
        expect(typeof getBufferedMember('m2')?.is_active).toBe('boolean');
        expect(typeof getBufferedMember('m3')?.is_active).toBe('boolean');
        expect(getBufferedMember('m2')?.is_active).toBe(true);
        expect(getBufferedMember('m3')?.is_active).toBe(false);
    });
});
