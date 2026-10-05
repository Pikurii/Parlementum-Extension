/**
 * interceptor-client.js — Content Script Bridge for Main-World Interceptor
 *
 * Runs in the ISOLATED world (inside dist/content.js).
 * Listens for messages dispatched by interceptor.js (MAIN world).
 * Directly updates energy state, tokens, and work stats from raw server JSON.
 */

import { patchPageVisualEnergy } from './energy.js';

const MSG_SOURCE = 'PARLAMENTUM_INTERCEPTOR';
const EXT_SOURCE = 'PARLAMENTUM_EXTENSION';

export function initInterceptorClient(state, CONFIG, ctx) {
    if (state._interceptorClientInitialized) return;
    state._interceptorClientInitialized = true;

    window.addEventListener('message', (event) => {
        if (!event || event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.source !== MSG_SOURCE) return;

        switch (msg.type) {
            case 'READY':
            case 'PONG':
                state.interceptorActive = true;
                break;

            case 'AUTH_TOKEN':
                if (msg.token && typeof msg.token === 'string' && msg.token !== state.currentToken) {
                    if (ctx?.handleNewToken) {
                        ctx.handleNewToken(msg.token, 'network_interceptor');
                    }
                }
                break;

            case 'ENERGY_SYNC':
                _handleEnergySync(state, msg, ctx);
                break;

            case 'WORK_SUCCESS':
                _handleWorkSuccess(state, msg, ctx);
                break;

            case 'WORK_REJECTED':
                _handleWorkRejected(state, msg, ctx);
                break;

            default:
                break;
        }
    });

    // 1. Send Ping to check if interceptor.js is already running from manifest world: "MAIN"
    try {
        window.postMessage({ source: EXT_SOURCE, action: 'PING' }, '*');
    } catch { /* ignore */ }

    // 2. Fallback: If not active after 350ms, dynamically inject interceptor.js as a script tag
    setTimeout(() => {
        if (!state.interceptorActive && chrome.runtime?.getURL) {
            try {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('interceptor.js');
                script.async = false;
                (document.head || document.documentElement).appendChild(script);
                script.onload = () => script.remove();
            } catch { /* ignore */ }
        }
    }, 350);
}

function _handleEnergySync(state, msg, ctx) {
    const curRaw = msg.currentEnergy;
    const maxRaw = msg.maxEnergy;

    let updated = false;

    if (typeof curRaw === 'number' && Number.isFinite(curRaw)) {
        const cur = Math.max(0, Math.round(curRaw));
        state.currentEnergy = cur;
        updated = true;
    }

    if (typeof maxRaw === 'number' && Number.isFinite(maxRaw) && maxRaw > 0) {
        state.maxEnergy = Math.round(maxRaw);
        updated = true;
    }

    if (updated) {
        state.energySyncBase = {
            current: state.currentEnergy,
            max: state.maxEnergy || 110,
            updatedAt: Date.now()
        };
        ctx?.updatePanel?.();
    }
}

function _handleWorkSuccess(state, msg, ctx) {
    const used = Number(msg.energyUsed) || 10;
    const xp = Number(msg.xpEarned) || 0;

    // If extension initiated the work, work.js already handles state and logging
    if (state.workInFlight) {
        if (msg.remainingEnergy != null && typeof msg.remainingEnergy === 'number') {
            state.currentEnergy = Math.max(0, Math.round(msg.remainingEnergy));
        } else {
            state.currentEnergy = Math.max(0, (state.currentEnergy || 0) - used);
        }
        state.energySyncBase = {
            current: state.currentEnergy,
            max: state.maxEnergy || 110,
            updatedAt: Date.now()
        };
        patchPageVisualEnergy(state.currentEnergy, state.maxEnergy, true);
        return;
    }

    // External work shift (e.g. user clicked button manually on web page)
    if (msg.remainingEnergy != null && typeof msg.remainingEnergy === 'number') {
        state.currentEnergy = Math.max(0, Math.round(msg.remainingEnergy));
    } else {
        state.currentEnergy = Math.max(0, (state.currentEnergy || 0) - used);
    }

    state.energySyncBase = {
        current: state.currentEnergy,
        max: state.maxEnergy || 110,
        updatedAt: Date.now()
    };

    const nowStr = new Date().toLocaleTimeString('id-ID');
    state.workToday = (state.workToday || 0) + 1;
    state.totalWorked = (state.totalWorked || 0) + 1;
    state.xpToday = (state.xpToday || 0) + xp;
    state.totalWorkXP = (state.totalWorkXP || 0) + xp;
    state.lastWorkTime = nowStr;
    state.lastWorkTimestamp = Date.now();

    ctx?.setValue?.('workToday', state.workToday);
    ctx?.setValue?.('totalWorked', state.totalWorked);
    ctx?.setValue?.('xpToday', state.xpToday);
    ctx?.setValue?.('totalWorkXP', state.totalWorkXP);

    ctx?.log?.(`⚡ Shift di game terdeteksi (Anti-Desync): +${xp} XP | Sisa: ${state.currentEnergy}⚡`, 'success');
    ctx?.updatePanel?.();
}

function _handleWorkRejected(state, msg, ctx) {
    const errorMsg = String(msg.message || msg.raw?.message || '');
    if (/not enough energy|energi tidak cukup|kurang/i.test(errorMsg)) {
        state.currentEnergy = 0;
        state.energySyncBase = {
            current: 0,
            max: state.maxEnergy || 110,
            updatedAt: Date.now()
        };
        patchPageVisualEnergy(0, state.maxEnergy, true);
        ctx?.updatePanel?.();
    }
}
