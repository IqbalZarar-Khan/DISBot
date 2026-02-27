/**
 * Currency-aware pledge amount normalization.
 *
 * Patreon supports multiple currencies for international patrons.
 * If the webhook payload includes a non-USD currency, the raw
 * min_cents_pledged_to_view value may not match the TIER_CONFIG
 * cents (which are typically in USD).
 *
 * This helper normalizes amounts to USD cents using a static
 * exchange rate table (no external API dependency).
 */

// Approximate rates: 1 unit of currency = X USD
// Updated periodically — these are fallback values only
const RATES_TO_USD: Record<string, number> = {
    USD: 1.0,
    EUR: 1.08,
    GBP: 1.27,
    CAD: 0.74,
    AUD: 0.65,
    NZD: 0.61,
    JPY: 0.0067,
    CHF: 1.13,
    SEK: 0.096,
    NOK: 0.094,
    DKK: 0.145,
    MXN: 0.058,
    BRL: 0.20,
    INR: 0.012,
    PLN: 0.25,
    SGD: 0.74,
    HKD: 0.13,
};

/**
 * Normalize a pledge amount in cents from a given currency to USD cents.
 *
 * @param cents     - The raw amount in cents (smallest currency unit)
 * @param currency  - ISO 4217 currency code from the webhook payload (e.g., "EUR")
 * @param baseCurrency - The creator's base currency (defaults to "USD")
 * @returns The normalized amount in base currency cents
 *
 * @example
 *   normalizeCents(2500, 'EUR', 'USD') → ~2700  (€25.00 ≈ $27.00)
 *   normalizeCents(2500, 'USD', 'USD') → 2500   (same currency, no conversion)
 *   normalizeCents(2500, 'XYZ', 'USD') → 2500   (unknown currency, pass-through)
 */
export function normalizeCents(cents: number, currency?: string, baseCurrency: string = 'USD'): number {
    if (!currency || currency === baseCurrency) {
        return cents; // Same currency or no currency info — no conversion needed
    }

    const fromRate = RATES_TO_USD[currency.toUpperCase()];
    const toRate = RATES_TO_USD[baseCurrency.toUpperCase()];

    if (!fromRate || !toRate) {
        // Unknown currency — return original amount (safe fallback)
        return cents;
    }

    // Convert: cents_in_source_currency → USD → base_currency
    const usdCents = cents * fromRate;
    const baseCents = usdCents / toRate;

    return Math.round(baseCents);
}

/**
 * Extract currency from a Patreon webhook attributes object.
 * Patreon may include it as `currency` or in nested pledge data.
 */
export function extractCurrency(attributes: any): string | undefined {
    return attributes?.currency
        || attributes?.patron_currency
        || undefined;
}
