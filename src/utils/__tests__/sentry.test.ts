import * as Sentry from '@sentry/node';
import { initSentry, captureError, addBreadcrumb, isSentryInitialized } from '../sentry';

jest.mock('@sentry/node', () => ({
    init: jest.fn(),
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
    withScope: jest.fn((callback) => {
        const mockScope = {
            setExtras: jest.fn(),
        };
        callback(mockScope);
    }),
}));

describe('sentry utility', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env.SENTRY_DSN;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('initSentry is a no-op when SENTRY_DSN is not set', () => {
        initSentry();
        expect(Sentry.init).not.toHaveBeenCalled();
    });

    test('initSentry initializes when SENTRY_DSN is set', () => {
        process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
        initSentry();
        expect(Sentry.init).toHaveBeenCalledWith(
            expect.objectContaining({
                dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
                maxBreadcrumbs: 50,
                beforeSend: expect.any(Function),
            })
        );
        expect(isSentryInitialized()).toBe(true);
    });

    test('captureError sends error and attaches context when initialized', () => {
        process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
        initSentry();

        const err = new Error('Test Sentry Error');
        captureError(err, { post_id: '12345', event: 'posts:publish' });

        expect(Sentry.captureException).toHaveBeenCalledWith(err);
    });

    test('addBreadcrumb adds breadcrumb when initialized', () => {
        process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
        initSentry();

        addBreadcrumb('Received webhook', { event: 'members:create' });
        expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
            message: 'Received webhook',
            data: { event: 'members:create' },
            level: 'info',
        });
    });
});
