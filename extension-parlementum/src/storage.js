/**
 * storage.js — Chrome storage wrapper with synchronous cache
 *
 * Replaces all GM_getValue / GM_setValue calls.
 * On init, loads all data into _cache so the rest of the codebase
 * can call getValue/setValue synchronously (same API as GM_).
 * Writes are async fire-and-forget to chrome.storage.local.
 */

const _cache = {};

/**
 * Returns true if the extension runtime context is currently active and valid.
 * When an extension is reloaded in browser, existing tabs become orphaned.
 */
export function isExtensionContextValid() {
    try {
        return Boolean(typeof chrome !== 'undefined' && chrome?.runtime && chrome.runtime.id);
    } catch {
        return false;
    }
}

/**
 * Must be awaited once at startup before anything reads storage.
 */
export async function initStorage() {
    if (!isExtensionContextValid()) return;
    try {
        const data = await chrome.storage.local.get(null);
        Object.assign(_cache, data);
    } catch { /* context invalidated */ }
}

export function getValue(key, defaultVal = null) {
    return key in _cache ? _cache[key] : defaultVal;
}

let _pendingWrites = null;
let _flushScheduled = false;

function _scheduleFlush() {
    if (_flushScheduled) return;
    _flushScheduled = true;
    queueMicrotask(() => {
        _flushScheduled = false;
        if (!_pendingWrites) return;
        const toWrite = _pendingWrites;
        _pendingWrites = null;
        if (!isExtensionContextValid()) return;
        try {
            chrome.storage.local.set(toWrite).catch(err => {
                if (err?.message?.includes('Extension context invalidated')) return;
                console.error('[Storage] batch setValue failed:', err);
            });
        } catch { /* context invalidated */ }
    });
}

export function setValue(key, value) {
    _cache[key] = value;
    if (!isExtensionContextValid()) return;
    if (!_pendingWrites) _pendingWrites = {};
    _pendingWrites[key] = value;
    _scheduleFlush();
}

export function removeValue(key) {
    delete _cache[key];
    if (!isExtensionContextValid()) return;
    try {
        chrome.storage.local.remove(key).catch(err => {
            if (err?.message?.includes('Extension context invalidated')) return;
            console.error('[Storage] removeValue failed:', key, err);
        });
    } catch { /* context invalidated */ }
}

/**
 * Listen for storage changes from other tabs or the background service worker.
 * callback(key, newValue) — newValue is undefined if key was deleted.
 */
export function onStorageChanged(callback) {
    if (!isExtensionContextValid()) return;
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (!isExtensionContextValid()) return;
            if (area !== 'local') return;
            for (const [key, { newValue }] of Object.entries(changes)) {
                if (newValue !== undefined) _cache[key] = newValue;
                else delete _cache[key];
                callback(key, newValue);
            }
        });
    } catch { /* context invalidated */ }
}
