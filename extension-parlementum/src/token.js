/**
 * token.js — JWT parsing, detection, and storage watching
 */

import { setValue } from './storage.js';

/** @param {string} rawToken @returns {{ payload, cleanToken, expiry, isExpired }|null} */
export function parseJwt(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return null;
    try {
        let clean = rawToken.trim();

        // Handle quoted strings
        if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
            try { clean = JSON.parse(clean); } catch { clean = clean.slice(1, -1).trim(); }
        }

        // Strip Bearer prefix
        clean = clean.replace(/^Bearer\s+/i, '').trim();

        // Handle JSON object containing token
        if (clean.startsWith('{')) {
            try {
                const obj = JSON.parse(clean);
                clean = obj.token || obj.access_token || obj.jwt || obj.value || clean;
            } catch { /* ignore */ }
        }

        const parts = clean.split('.');
        if (parts.length !== 3) return null;

        // Base64URL → Base64 with padding
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) base64 += '=';

        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const payload = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        const expiry = payload.exp ? new Date(payload.exp * 1000) : null;

        return { payload, cleanToken: clean, expiry, isExpired: expiry ? expiry < new Date() : false };
    } catch (err) {
        console.error('[JWT] Failed to parse:', err);
        return null;
    }
}

/**
 * Attempts to accept a new raw token candidate into state.
 * @returns {boolean} true if token was valid and accepted
 */
export function handleNewToken(state, logFn, wakePendingWork, rawCandidate, source = 'storage', onResume = null, onUpdate = null) {
    if (!rawCandidate) return false;

    const parsed = parseJwt(rawCandidate);
    if (!parsed) return false;

    const { cleanToken, expiry, isExpired } = parsed;
    if (isExpired) {
        console.warn(`[Token] Token dari ${source} sudah EXPIRED pada ${expiry?.toLocaleString('id-ID')}`);
        return false;
    }

    if (cleanToken === state.storedTokenValue && state.currentToken) return true; // sudah sinkron

    state.storedTokenValue = cleanToken;
    state.currentToken     = `Bearer ${cleanToken}`;
    state.tokenExpiry      = expiry;

    try {
        setValue('aw_auth_token', cleanToken);
        setValue('aw_auth_token_expiry', expiry ? expiry.getTime().toString() : '');
    } catch { /* ignore */ }

    const diff   = expiry ? Math.floor((expiry - Date.now()) / 1000) : null;
    const timeStr = expiry
        ? `${expiry.toLocaleTimeString('id-ID')} (${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m)`
        : 'Tidak ada exp';

    logFn(`🔑 Token valid via ${source}! Exp: ${timeStr}`, 'success');

    state.tokenExpired     = false;

    if (state.pausedForToken || !state.running) {
        state.running = true;
        state.pausedForToken = false;
        logFn('▶️ Sesi diperbarui. Script dilanjutkan otomatis!', 'success');
        onResume?.();
        wakePendingWork?.();
    }

    onUpdate?.();
    return true;
}

/**
 * Scans window.localStorage, sessionStorage, and unsafeWindow.localStorage for a valid JWT.
 */
export function getTokenFromStorage(state, handleNewTokenFn) {
    const shouldLog = Date.now() - (getTokenFromStorage._lastDiagAt || 0) >= 30000;
    if (shouldLog) {
        console.log('[Token] Memindai storage...');
        getTokenFromStorage._lastDiagAt = Date.now();
    }

    const storages = [];
    try { if (window.localStorage) storages.push({ name: 'localStorage', store: window.localStorage }); } catch { /* ignore */ }
    try {
        const pw = window; // In MV3 content scripts, window IS the page window
        if (pw?.localStorage && pw.localStorage !== window.localStorage) {
            storages.push({ name: 'pw.localStorage', store: pw.localStorage });
        }
    } catch { /* ignore */ }
    try { if (window.sessionStorage) storages.push({ name: 'sessionStorage', store: window.sessionStorage }); } catch { /* ignore */ }

    const commonKeys = ['token', 'auth_token', 'authToken', 'access_token', 'jwt',
                        'session', 'parlamentum_token', 'sb-token', 'sb-access-token', 'user_token'];

    for (const { name, store } of storages) {
        for (const key of commonKeys) {
            const val = store.getItem(key);
            if (val && handleNewTokenFn(val, `${name}[${key}]`)) return state.currentToken;
        }
    }

    for (const { name, store } of storages) {
        for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (!key) continue;
            const val = store.getItem(key);
            if (val && typeof val === 'string' && (val.includes('eyJ') || val.startsWith('{'))) {
                if (handleNewTokenFn(val, `${name}[auto:${key}]`)) return state.currentToken;
            }
        }
    }

    if (shouldLog) {
        console.warn('[Token] Tidak ditemukan. Keys tersedia:');
        for (const { name, store } of storages) {
            try { console.log(`  ${name}:`, Object.keys(store)); } catch { /* ignore */ }
        }
    }
    return null;
}

/**
 * Returns a human-readable string of time remaining until token expiry.
 * @param {object} state
 */
export function getTimeUntilExpiry(state) {
    if (!state.tokenExpiry) return 'N/A';
    const diff = state.tokenExpiry - Date.now();
    if (diff <= 0) return 'EXPIRED';
    return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
}

/**
 * Sets up 0ms token interception via storage events + fetch sniffer + interval fallback.
 */
export function startTokenWatcher(state, handleNewTokenFn, getTokenFn) {
    // 1. Cross-tab storage events (catches login in another tab)
    window.addEventListener('storage', ({ newValue, key }) => {
        if (newValue) handleNewTokenFn(newValue, `storage-event[${key}]`);
    });

    // 2. Fetch sniffer — intercepts Authorization Bearer from live page requests
    try {
        const origFetch = window.fetch;
        window.fetch = function(...args) {
            try {
                const [input, config] = args;
                let auth = null;
                if (config?.headers) {
                    auth = config.headers instanceof Headers
                        ? config.headers.get('Authorization') || config.headers.get('authorization')
                        : config.headers['Authorization'] || config.headers['authorization'];
                }
                if (!auth && input instanceof Request) {
                    auth = input.headers?.get('Authorization') || input.headers?.get('authorization');
                }
                if (auth?.includes('Bearer ')) handleNewTokenFn(auth, 'fetch-intercept');
            } catch { /* never break the page */ }
            return origFetch.apply(this, args);
        };
    } catch { /* ignore */ }

    // 3. Interval fallback — rescans if token is missing or expired
    setInterval(() => {
        if (!state.currentToken || (state.tokenExpiry && state.tokenExpiry < new Date())) {
            getTokenFn();
        }
    }, 8000);
}
