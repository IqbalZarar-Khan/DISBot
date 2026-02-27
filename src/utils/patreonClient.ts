import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { config } from '../config';
import { setConfig, getConfig } from '../database/db';
import { logger } from './logger';

const PATREON_API = 'https://www.patreon.com/api/oauth2/v2';
const TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';

let currentAccessToken: string = config.patreonAccessToken;
let currentRefreshToken: string = config.patreonRefreshToken || '';
let isRefreshing = false;

/**
 * Initialize tokens from DB if available (DB overrides env vars).
 */
async function loadTokensFromDb(): Promise<void> {
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
    } catch {
        // DB might not be ready yet — use env vars
    }
}

/**
 * Refresh the Patreon access token using the refresh token.
 */
async function refreshAccessToken(): Promise<boolean> {
    if (isRefreshing) return false;
    if (!currentRefreshToken) {
        logger.warn('🔑 [TOKEN] No refresh token available — cannot auto-refresh');
        return false;
    }

    isRefreshing = true;

    try {
        logger.info('🔑 [TOKEN] Access token expired — refreshing...');

        const res = await axios.post(TOKEN_URL, null, {
            params: {
                grant_type: 'refresh_token',
                refresh_token: currentRefreshToken,
                client_id: config.patreonClientId,
                client_secret: config.patreonClientSecret,
            },
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
 *
 * Usage:
 *   const client = await getPatreonClient();
 *   const res = await client.get('/campaigns/12345');
 */
export async function getPatreonClient(): Promise<AxiosInstance> {
    // Load DB tokens on first use
    await loadTokensFromDb();

    const instance = axios.create({
        baseURL: PATREON_API,
        timeout: 15000,
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

    return instance;
}

/**
 * Get the current access token (useful for one-off calls without the full client).
 */
export function getCurrentAccessToken(): string {
    return currentAccessToken;
}
