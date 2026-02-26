import en from '../locales/en.json';

type NestedRecord = { [key: string]: string | NestedRecord };

// Default locale
let currentLocale: NestedRecord = en;
let localeName = 'en';

/**
 * Initialize i18n with a locale.
 * @param locale - Locale code (e.g., 'en', 'es', 'ja')
 */
export function initI18n(locale: string = 'en'): void {
    localeName = locale;

    try {
        // Dynamic import would be ideal here, but for simplicity we use require
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        currentLocale = require(`../locales/${locale}.json`);
        console.log(`🌐 [i18n] Loaded locale: ${locale}`);
    } catch {
        console.warn(`⚠️ [i18n] Locale "${locale}" not found, falling back to English`);
        currentLocale = en;
        localeName = 'en';
    }
}

/**
 * Get a translated string by key path.
 * Supports dot notation (e.g., 'bot.starting') and {{placeholder}} interpolation.
 *
 * @example
 * t('bot.login_attempt', { attempt: '1', max: '5' })
 * // "🔑 Discord login attempt 1/5..."
 */
export function t(key: string, params?: Record<string, string | number>): string {
    // Navigate the nested key path
    const parts = key.split('.');
    let value: any = currentLocale;

    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            // Key not found — return the key itself as fallback
            return key;
        }
    }

    if (typeof value !== 'string') return key;

    // Interpolate {{placeholder}} values
    if (params) {
        return value.replace(/\{\{(\w+)\}\}/g, (_match: string, paramKey: string) => {
            return params[paramKey]?.toString() ?? `{{${paramKey}}}`;
        });
    }

    return value;
}

/**
 * Get the current locale name.
 */
export function getLocale(): string {
    return localeName;
}
