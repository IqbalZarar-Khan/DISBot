import { markMemberWelcomed, wasRecentlyWelcomed } from '../welcomeGuard';

describe('welcomeGuard', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        // Clear guard state between tests by expiring everything
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('member is not welcomed before being marked', () => {
        expect(wasRecentlyWelcomed('member-1')).toBe(false);
    });

    test('marking a member makes them count as recently welcomed', () => {
        markMemberWelcomed('member-1');
        expect(wasRecentlyWelcomed('member-1')).toBe(true);
    });

    test('marking one member does not affect another', () => {
        markMemberWelcomed('member-1');
        expect(wasRecentlyWelcomed('member-2')).toBe(false);
    });

    test('mark expires after the TTL window', () => {
        markMemberWelcomed('member-1');
        jest.advanceTimersByTime(10 * 60_000 + 1);
        expect(wasRecentlyWelcomed('member-1')).toBe(false);
    });

    test('re-marking refreshes the TTL window', () => {
        markMemberWelcomed('member-1');
        jest.advanceTimersByTime(5 * 60_000);
        markMemberWelcomed('member-1');
        jest.advanceTimersByTime(5 * 60_000);
        expect(wasRecentlyWelcomed('member-1')).toBe(true);
    });
});
