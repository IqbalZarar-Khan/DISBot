import {
    getEventChannel,
    loadPersistedEventRoutes,
    getAllEventRoutes,
    handleSetEventChannel,
    MEMBER_EVENT_TYPES,
} from '../set-event-channel';
import * as db from '../../../database/db';
import * as adminCheck from '../../../middleware/adminCheck';

jest.mock('../../../database/db', () => ({
    getConfig: jest.fn(),
    setConfig: jest.fn(),
}));

jest.mock('../../../middleware/adminCheck', () => ({
    checkAdminPermission: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe('set-event-channel', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env.EVENT_CHANNEL_MEMBER_JOIN;
        delete process.env.EVENT_CHANNEL_MEMBER_LEAVE;
        delete process.env.EVENT_CHANNEL_PLEDGE_UPGRADE;
        delete process.env.EVENT_CHANNEL_PLEDGE_DOWNGRADE;
        delete process.env.EVENT_CHANNEL_PLEDGE_CREATE;
        delete process.env.EVENT_CHANNEL_PLEDGE_DELETE;
        delete process.env.WELCOME_CHANNEL_ID;
        delete process.env.LOG_CHANNEL_ID;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('getEventChannel', () => {
        it('falls back to LOG_CHANNEL_ID when no route is set', async () => {
            (db.getConfig as jest.Mock).mockResolvedValue(null);
            process.env.LOG_CHANNEL_ID = 'log-channel-999';

            const channel = await getEventChannel('pledge_delete');
            expect(channel).toBe('log-channel-999');
        });

        it('resolves from environment variables if present', async () => {
            process.env.EVENT_CHANNEL_PLEDGE_UPGRADE = 'upgrade-channel-111';
            (db.getConfig as jest.Mock).mockResolvedValue(null);

            const channel = await getEventChannel('pledge_upgrade');
            expect(channel).toBe('upgrade-channel-111');
        });

        it('resolves member_join from WELCOME_CHANNEL_ID if EVENT_CHANNEL_MEMBER_JOIN is not set', async () => {
            process.env.WELCOME_CHANNEL_ID = 'welcome-chan-222';
            (db.getConfig as jest.Mock).mockResolvedValue(null);

            const channel = await getEventChannel('member_join');
            expect(channel).toBe('welcome-chan-222');
        });

        it('resolves from database bot_config if in-memory and env are not present', async () => {
            (db.getConfig as jest.Mock).mockImplementation(async (key: string) => {
                if (key === 'event_channel_pledge_downgrade') return 'downgrade-chan-333';
                return null;
            });

            const channel = await getEventChannel('pledge_downgrade');
            expect(channel).toBe('downgrade-chan-333');
        });
    });

    describe('loadPersistedEventRoutes', () => {
        it('loads routes from environment variables and seeds to database', async () => {
            process.env.EVENT_CHANNEL_MEMBER_JOIN = 'join-env-123';
            process.env.EVENT_CHANNEL_PLEDGE_CREATE = 'create-env-456';
            (db.getConfig as jest.Mock).mockResolvedValue(null);
            (db.setConfig as jest.Mock).mockResolvedValue(undefined);

            const routes = await loadPersistedEventRoutes();

            expect(routes.member_join).toBe('join-env-123');
            expect(routes.pledge_create).toBe('create-env-456');
            expect(db.setConfig).toHaveBeenCalledWith('event_channel_member_join', 'join-env-123');
            expect(db.setConfig).toHaveBeenCalledWith('event_channel_pledge_create', 'create-env-456');
        });

        it('loads routes from database when not present in env', async () => {
            (db.getConfig as jest.Mock).mockImplementation(async (key: string) => {
                if (key === 'event_channel_member_leave') return 'db-leave-789';
                return null;
            });

            const routes = await loadPersistedEventRoutes();

            expect(routes.member_leave).toBe('db-leave-789');
        });
    });

    describe('getAllEventRoutes', () => {
        it('returns all event types mapped to their resolved channel ID', async () => {
            process.env.LOG_CHANNEL_ID = 'fallback-log';
            const all = await getAllEventRoutes();

            for (const eventType of MEMBER_EVENT_TYPES) {
                expect(all).toHaveProperty(eventType);
            }
        });
    });

    describe('handleSetEventChannel', () => {
        it('rejects non-text channel selection', async () => {
            (adminCheck.checkAdminPermission as jest.Mock).mockResolvedValue(true);

            const mockReply = jest.fn();
            const mockInteraction: any = {
                options: {
                    getString: jest.fn().mockReturnValue('member_join'),
                    getChannel: jest.fn().mockReturnValue({ id: 'voice-1', type: 2 }), // GuildVoice = 2
                },
                reply: mockReply,
            };

            await handleSetEventChannel(mockInteraction);

            expect(mockReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Please select a text channel'),
                    ephemeral: true,
                })
            );
        });

        it('updates in-memory cache and persists to database on valid configuration', async () => {
            (adminCheck.checkAdminPermission as jest.Mock).mockResolvedValue(true);
            (db.setConfig as jest.Mock).mockResolvedValue(undefined);

            const mockReply = jest.fn();
            const mockInteraction: any = {
                options: {
                    getString: jest.fn().mockReturnValue('pledge_create'),
                    getChannel: jest.fn().mockReturnValue({ id: 'channel-999', type: 0 }), // GuildText = 0
                },
                reply: mockReply,
            };

            await handleSetEventChannel(mockInteraction);

            expect(db.setConfig).toHaveBeenCalledWith('event_channel_pledge_create', 'channel-999');
            expect(mockReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.any(Array),
                    ephemeral: true,
                })
            );

            // Confirm immediate in-memory resolution
            const resolved = await getEventChannel('pledge_create');
            expect(resolved).toBe('channel-999');
        });
    });
});
