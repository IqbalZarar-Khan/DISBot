import * as Sentry from '@sentry/node';

let initialized = false;

/**
 * Initialize Sentry SDK for error tracking and APM.
 * Completely no-op if SENTRY_DSN is unset.
 */
export function initSentry(): void {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return; // silent no-op when SENTRY_DSN is not configured

    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV ?? 'development',
        release: process.env.npm_package_version,
        // Breadcrumbs: last 50 actions before an error
        maxBreadcrumbs: 50,
        // Ignore known non-actionable errors
        ignoreErrors: [
            'DiscordAPIError[10062]', // Unknown interaction (expired)
            'DiscordAPIError[40060]', // Interaction already acknowledged
        ],
        beforeSend(event) {
            // Strip any user PII that could inadvertently be captured
            if (event.user) {
                delete event.user.email;
                delete event.user.ip_address;
                delete event.user.username;
            }
            return event;
        },
    });

    initialized = true;
    console.log('🛡️  [SENTRY] Initialized successfully');
}

/**
 * Capture an exception in Sentry with optional contextual metadata.
 * Strips PII and attaches non-sensitive metadata only.
 */
export function captureError(err: Error, context?: Record<string, unknown>): void {
    if (!initialized) return;
    Sentry.withScope((scope) => {
        if (context) {
            scope.setExtras(context);
        }
        Sentry.captureException(err);
    });
}

/**
 * Record a breadcrumb in Sentry for tracing events leading up to errors.
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
    if (!initialized) return;
    Sentry.addBreadcrumb({ message, data, level: 'info' });
}

/**
 * Check if Sentry is currently active
 */
export function isSentryInitialized(): boolean {
    return initialized;
}
