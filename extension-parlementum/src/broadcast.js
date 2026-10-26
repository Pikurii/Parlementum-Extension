/**
 * broadcast.js — Centralized Singleton Cross-Tab BroadcastChannel
 *
 * Prevents object churn, memory leaks, and dangling event listeners
 * across multiple modules and SPA navigations.
 */

let _channel = null;

/**
 * Returns the singleton BroadcastChannel instance, creating it if needed.
 * @returns {BroadcastChannel|null}
 */
export function getTabChannel() {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (!_channel) {
        try {
            _channel = new BroadcastChannel('aw_parlamentum_tabs');
            _channel.onmessageerror = () => {
                try { _channel.close(); } catch { /* ignore */ }
                _channel = null;
            };
        } catch {
            _channel = null;
        }
    }
    return _channel;
}

/**
 * Safely posts a message to all open Parlamentum tabs.
 * Recovers cleanly if the channel was closed or invalidated.
 * @param {object} msg
 */
export function broadcastTabMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    const ch = getTabChannel();
    if (!ch) return;
    try {
        ch.postMessage(msg);
    } catch {
        try { ch.close(); } catch { /* ignore */ }
        _channel = null;
    }
}
