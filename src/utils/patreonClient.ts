import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import http from 'http';
import https from 'https';
import { config } from '../config';
import { setConfig, getConfig } from '../database/db';
import { logger } from './logger';

const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';
const TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';

let currentAccessToken: string = config.patreonAccessToken;
let currentRefreshToken: string = config.patreonRefreshToken || '';
let isRefreshing = false;
let tokensLoaded = false;

// Reusable HTTP agents with keep-alive to avoid TCP+TLS handshake per request
const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 30_000 });
const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30_000 });

// Singleton client instance
let cachedClient: AxiosInstance | null = null;

/**
 * Initialize tokens from DB if available (DB overrides env vars).
 */
async function loadTokensFromDb(): Promise<void> {
    if (tokensLoaded) return; // Only load once
    try {
        const dbToken = await getConfig('patreon_access_token');
        const dbRefresh = await getConfig('patreon_refresh_token');
        if (dbToken) {
            currentAccessToken = dbToken;
            logger.info('🔑 [TOKEN] Loaded access token from database');
        }
        if (dbRefresh) {
            currentRefreshToken = dbRefresh;
        }
        tokensLoaded = true;
    } catch {
        // DB might not be ready yet — use env vars
    }
}

let proactiveRefreshTimer: NodeJS.Timeout | null = null;
const REFRESH_INTERVAL_MS = 25 * 24 * 60 * 60_000; // 25 days

/**
 * Start proactive token refresh scheduler.
 * Runs on boot and checks if tokens should be proactively refreshed to avoid
 * phantom 401s on idle deployments.
 */
export async function startProactiveTokenRefresh(): Promise<void> {
    await loadTokensFromDb();

    // Check if token was refreshed within last 25 days
    try {
        const lastRefreshedAtStr = await getConfig('patreon_token_refreshed_at');
        const lastRefreshedAt = lastRefreshedAtStr ? parseInt(lastRefreshedAtStr, 10) : 0;
        const now = Date.now();

        if (currentRefreshToken && (!lastRefreshedAt || now - lastRefreshedAt > REFRESH_INTERVAL_MS)) {
            logger.info('🔑 [TOKEN] Token refresh window reached — proactively refreshing token');
            await refreshAccessToken();
        }
    } catch {
        // Non-critical startup check
    }

    if (proactiveRefreshTimer) clearInterval(proactiveRefreshTimer);
    proactiveRefreshTimer = setInterval(async () => {
        if (currentRefreshToken) {
            logger.info('🔑 [TOKEN] Running scheduled proactive token refresh');
            await refreshAccessToken().catch(err => logger.warn('🔑 [TOKEN] Scheduled refresh failed', err as Error));
        }
    }, REFRESH_INTERVAL_MS);
}

export function stopProactiveTokenRefresh(): void {
    if (proactiveRefreshTimer) {
        clearInterval(proactiveRefreshTimer);
        proactiveRefreshTimer = null;
    }
}

/**
 * Refresh the Patreon access token using the refresh token.
 */
export async function refreshAccessToken(): Promise<boolean> {
    if (isRefreshing) return false;
    if (!currentRefreshToken) {
        logger.warn('🔑 [TOKEN] No refresh token available — cannot auto-refresh');
        return false;
    }

    isRefreshing = true;

    try {
        logger.info('🔑 [TOKEN] Access token expired or refresh requested — refreshing...');

        const res = await axios.post(TOKEN_URL, null, {
            params: {
                grant_type: 'refresh_token',
                refresh_token: currentRefreshToken,
                client_id: config.patreonClientId,
                client_secret: config.patreonClientSecret,
            },
            httpAgent,
            httpsAgent,
        });

        const { access_token, refresh_token } = res.data;

        currentAccessToken = access_token;
        if (refresh_token) {
            currentRefreshToken = refresh_token;
        }

        // Persist to DB
        await setConfig('patreon_access_token', access_token);
        if (refresh_token) {
            await setConfig('patreon_refresh_token', refresh_token);
        }
        await setConfig('patreon_token_refreshed_at', String(Date.now()));

        logger.info('🔑 [TOKEN] Token refreshed and saved to database');
        return true;

    } catch (err: any) {
        logger.error(`🔑 [TOKEN] Refresh failed: ${err.response?.data?.error || err.message}`);
        return false;

    } finally {
        isRefreshing = false;
    }
}

/**
 * Create a Patreon API client with automatic token refresh.
 * Uses a singleton with HTTP keep-alive for minimal latency.
 *
 * Usage:
 *   const client = await getPatreonClient();
 *   const res = await client.get('/campaigns/12345');
 */
export async function getPatreonClient(): Promise<AxiosInstance> {
    // Load DB tokens on first use
    await loadTokensFromDb();

    // Return cached client if available
    if (cachedClient) return cachedClient;

    const instance = axios.create({
        baseURL: PATREON_API,
        timeout: 15000,
        httpAgent,
        httpsAgent,
        headers: {
            'Accept-Encoding': 'gzip, deflate',
        },
    });

    // Request interceptor: attach current access token
    instance.interceptors.request.use((cfg) => {
        cfg.headers = cfg.headers || {};
        cfg.headers['Authorization'] = `Bearer ${currentAccessToken}`;
        return cfg;
    });

    // Response interceptor: auto-refresh on 401
    instance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

            if (error.response?.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;

                const refreshed = await refreshAccessToken();
                if (refreshed) {
                    // Retry with new token
                    originalRequest.headers = originalRequest.headers || {};
                    (originalRequest.headers as any)['Authorization'] = `Bearer ${currentAccessToken}`;
                    return instance.request(originalRequest);
                }
            }

            return Promise.reject(error);
        }
    );

    cachedClient = instance;
    return instance;
}

/**
 * Get the current access token (useful for one-off calls without the full client).
 */
export function getCurrentAccessToken(): string {
    return currentAccessToken;
}
