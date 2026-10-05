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
 * Must be awaited once at startup before anything reads storage.
 */
export async function initStorage() {
    const data = await chrome.storage.local.get(null);
    Object.assign(_cache, data);
}

export function getValue(key, defaultVal = null) {
    return key in _cache ? _cache[key] : defaultVal;
}

export function setValue(key, value) {
    _cache[key] = value;
    if (!chrome.runtime?.id) return;
    try {
        chrome.storage.local.set({ [key]: value }).catch(err => {
            if (err?.message?.includes('Extension context invalidated')) return;
            console.error('[Storage] setValue failed:', key, err);
        });
    } catch { /* context invalidated */ }
}

export function removeValue(key) {
    delete _cache[key];
    if (!chrome.runtime?.id) return;
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
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        for (const [key, { newValue }] of Object.entries(changes)) {
            if (newValue !== undefined) _cache[key] = newValue;
            else delete _cache[key];
            callback(key, newValue);
        }
    });
}
