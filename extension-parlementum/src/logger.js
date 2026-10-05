/**
 * logger.js — In-memory activity log with throttling and quiet mode
 */

import { setValue } from './storage.js';

const recentRepeatedLogs = new Map();

/** @type {function|null} Called after each log entry to refresh the log viewer UI */
export let onLogUpdate = null;
export function setLogUpdateCallback(fn) { onLogUpdate = fn; }

/**
 * @param {object} state
 * @param {object} CONFIG
 * @param {string} message
 * @param {'info'|'success'|'warn'|'error'} type
 * @param {boolean} toActivityLog
 */
export function log(state, CONFIG, message, type = 'info', toActivityLog = true) {
    const now = new Date().toLocaleTimeString('id-ID');
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';

    // Quiet mode: suppress repeated low-energy warnings
    if (toActivityLog && type === 'warn'
        && /(?:Energi (?:belum|tidak) cukup|Server menolak kerja|Shift tidak menghasilkan unit)/i.test(message)
        && CONFIG.quietModeEnabled
    ) {
        const nowMs = Date.now();
        if (nowMs - state.lastLowEnergyLogTime < CONFIG.quietModeInterval) return;
        state.lastLowEnergyLogTime = nowMs;
    }

    // Throttle repeated warn/error messages
    if (toActivityLog && (type === 'warn' || type === 'error')) {
        const throttleKey = /^⏳ Retry dalam /.test(message) ? `${type}:retry` : `${type}:${message}`;
        const nowMs = Date.now();
        const previous = recentRepeatedLogs.get(throttleKey);
        if (previous && nowMs - previous.time < 30000) {
            previous.suppressed++;
            return;
        }
        if (previous?.suppressed > 0) {
            message += ` (${previous.suppressed} pesan serupa disembunyikan)`;
        }
        recentRepeatedLogs.set(throttleKey, { time: nowMs, suppressed: 0 });
        if (recentRepeatedLogs.size > 100) {
            recentRepeatedLogs.delete(recentRepeatedLogs.keys().next().value);
        }
    }

    console.log(`[${now}] ${prefix} ${message}`);
    state.lastLogMessage = `[${now}] ${message}`;
    state.lastLogTime = now;
    if (!toActivityLog) return;

    state.logs.unshift({ time: now, type, message });
    if (state.logs.length > CONFIG.maxLogEntries) {
        state.logs = state.logs.slice(0, CONFIG.maxLogEntries);
    }
    _persistLogs(state.logs);
    onLogUpdate?.();
}

let _persistTimer = null;
function _persistLogs(logs) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
        _persistTimer = null;
        try {
            const trimmed = logs.slice(0, 80);
            setValue('aw_recent_logs', trimmed);
        } catch { /* context invalidated */ }
    }, 300);
}

export function clearStoredLogs() {
    if (_persistTimer) {
        clearTimeout(_persistTimer);
        _persistTimer = null;
    }
    recentRepeatedLogs.clear();
    setValue('aw_recent_logs', []);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        try { chrome.storage.local.set({ aw_recent_logs: [] }).catch(() => {}); } catch { /* ignore */ }
    }
}
