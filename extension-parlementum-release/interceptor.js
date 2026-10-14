/**
 * interceptor.js — Main-World Network Interceptor
 *
 * Runs in world: "MAIN" (the game's execution context).
 * Responsibilities:
 * 1. Safely intercept window.fetch and window.XMLHttpRequest
 * 2. Capture Authorization tokens from outgoing API requests
 * 3. Intercept JSON responses from /api/ (energy, work yield, player stats)
 * 4. Relay raw server data to the extension's isolated world via window.postMessage
 * 5. 100% transparent: never interferes with or delays page requests
 */
(function() {
    'use strict';

    if (window.__PARLAMENTUM_INTERCEPTOR_ACTIVE__) return;
    window.__PARLAMENTUM_INTERCEPTOR_ACTIVE__ = true;

    const MSG_SOURCE = 'PARLAMENTUM_INTERCEPTOR';
    const EXT_SOURCE = 'PARLAMENTUM_EXTENSION';

    function sendToExtension(type, payload = {}) {
        try {
            window.postMessage({
                source: MSG_SOURCE,
                type,
                timestamp: Date.now(),
                ...payload
            }, '*');
        } catch { /* ignore */ }
    }

    // ── Helper to extract token from Authorization header ────────────────────
    function inspectAuthHeader(headers) {
        if (!headers) return;
        try {
            let auth = null;
            if (typeof headers.get === 'function') {
                auth = headers.get('Authorization') || headers.get('authorization');
            } else if (typeof headers === 'object') {
                auth = headers['Authorization'] || headers['authorization'] || headers['AUTHORIZATION'];
            }
            if (auth && typeof auth === 'string') {
                const clean = auth.replace(/^Bearer\s+/i, '').trim();
                if (clean.length > 20) {
                    sendToExtension('AUTH_TOKEN', { token: clean });
                }
            }
        } catch { /* ignore */ }
    }

    // ── Deep scanner to locate energy & player data in any JSON payload ──────
    function scanAndDispatchApiData(url, status, data) {
        if (!data || typeof data !== 'object') return;

        try {
            // 1. Work endpoint response
            if (url.includes('/api/player/work') || url.includes('/player/work') || url.includes('/api/work') || url.includes('/api/player/shift') || url.includes('/api/shift')) {
                if (status >= 200 && status < 300) {
                    const energyUsed = Number(data.energyUsed) || 0;
                    const calculatedXp = energyUsed >= 10 ? Math.floor(energyUsed / 10) * 4 : (energyUsed > 0 ? 4 : 0);
                    const xpEarned = Number(data.xpEarned) > 0 ? Number(data.xpEarned) : calculatedXp;
                    sendToExtension('WORK_SUCCESS', {
                        url,
                        status,
                        energyUsed,
                        xpEarned,
                        produced: Number(data.produced) || 0,
                        workerUnits: Number(data.workerUnits) || 0,
                        wageNet: data.wageNet || '0',
                        leveledUp: Boolean(data.leveledUp),
                        remainingEnergy: data.energy != null ? Number(data.energy) : null,
                        raw: data
                    });
                } else {
                    sendToExtension('WORK_REJECTED', {
                        url,
                        status,
                        message: data.message || data.error || '',
                        raw: data
                    });
                }
                return;
            }

            // 2. Generic scanner for energy fields
            let curE = null;
            let maxE = null;

            // Direct properties
            if (typeof data.energy === 'number') curE = data.energy;
            else if (typeof data.currentEnergy === 'number') curE = data.currentEnergy;
            else if (typeof data.current_energy === 'number') curE = data.current_energy;

            if (typeof data.maxEnergy === 'number') maxE = data.maxEnergy;
            else if (typeof data.max_energy === 'number') maxE = data.max_energy;

            // Nested player / user properties
            const p = data.player || data.user || data.data?.player || data.data?.user || data.data;
            if (p && typeof p === 'object') {
                if (curE === null) {
                    if (typeof p.energy === 'number') curE = p.energy;
                    else if (typeof p.currentEnergy === 'number') curE = p.currentEnergy;
                    else if (typeof p.current_energy === 'number') curE = p.current_energy;
                }
                if (maxE === null) {
                    if (typeof p.maxEnergy === 'number') maxE = p.maxEnergy;
                    else if (typeof p.max_energy === 'number') maxE = p.max_energy;
                }
            }

            if (curE !== null || maxE !== null) {
                sendToExtension('ENERGY_SYNC', {
                    url,
                    status,
                    currentEnergy: curE,
                    maxEnergy: maxE,
                    raw: data
                });
            }

            // 3. Scanner for food / bread consumption
            let foodEaten = null;
            if (typeof data.foodEatenToday === 'number') foodEaten = data.foodEatenToday;
            else if (typeof data.food_eaten_today === 'number') foodEaten = data.food_eaten_today;
            else if (typeof data.foodUsed === 'number') foodEaten = data.foodUsed;
            else if (p && typeof p === 'object') {
                if (typeof p.foodEatenToday === 'number') foodEaten = p.foodEatenToday;
                else if (typeof p.food_eaten_today === 'number') foodEaten = p.food_eaten_today;
                else if (typeof p.foodUsed === 'number') foodEaten = p.foodUsed;
            }

            // Check if response message indicates daily food limit reached
            const msgStr = (typeof data.message === 'string' ? data.message : '') +
                           ' ' + (typeof data.error === 'string' ? data.error : '') +
                           ' ' + (typeof data.msg === 'string' ? data.msg : '') +
                           ' ' + (typeof data.detail === 'string' ? data.detail : '');
            if (/batas roti harian tercapai/i.test(msgStr) || /daily bread limit/i.test(msgStr)) {
                foodEaten = 10;
            }

            if (foodEaten !== null) {
                sendToExtension('FOOD_STATUS', { foodEatenToday: foodEaten });
            }

            const isFoodUrl = /eat|food|roti|bread|item\/use|inventory\/use|consume/i.test(url);
            if (isFoodUrl && status >= 200 && status < 300) {
                sendToExtension('FOOD_CONSUMED', { raw: data });
            }
        } catch { /* ignore */ }
    }

    // ── 1. Hook window.fetch ─────────────────────────────────────────────────
    if (typeof window.fetch === 'function') {
        const originalFetch = window.fetch;

        window.fetch = async function(input, init) {
            // Inspect outgoing headers for auth token
            try {
                if (init && init.headers) {
                    inspectAuthHeader(init.headers);
                } else if (input && typeof input === 'object' && input.headers) {
                    inspectAuthHeader(input.headers);
                }
            } catch { /* ignore */ }

            const response = await originalFetch.apply(this, arguments);

            // Clone and inspect API responses safely
            try {
                const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                if (url && (url.includes('/api/') || url.startsWith('/api/'))) {
                    const clone = response.clone();
                    const contentType = clone.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        clone.json().then(data => {
                            scanAndDispatchApiData(url, response.status, data);
                        }).catch(() => {
                            clone.text().then(text => {
                                if (/batas roti harian tercapai/i.test(text)) {
                                    sendToExtension('FOOD_STATUS', { foodEatenToday: 10 });
                                }
                            }).catch(() => {});
                        });
                    } else {
                        clone.text().then(text => {
                            if (/batas roti harian tercapai/i.test(text)) {
                                sendToExtension('FOOD_STATUS', { foodEatenToday: 10 });
                            }
                        }).catch(() => {});
                    }
                }
            } catch { /* ignore */ }

            return response;
        };
    }

    // ── 2. Hook window.XMLHttpRequest ────────────────────────────────────────
    if (typeof window.XMLHttpRequest === 'function') {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._aw_method = method;
            this._aw_url = url;
            return originalOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            if (header && /^authorization$/i.test(header) && value) {
                inspectAuthHeader({ authorization: value });
            }
            return originalSetHeader.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function() {
            this.addEventListener('load', function() {
                try {
                    const url = this._aw_url || this.responseURL || '';
                    if (url && (url.includes('/api/') || url.startsWith('/api/'))) {
                        const ct = this.getResponseHeader('content-type') || '';
                        if (ct.includes('application/json') && this.responseText) {
                            try {
                                const data = JSON.parse(this.responseText);
                                scanAndDispatchApiData(url, this.status, data);
                            } catch {
                                if (/batas roti harian tercapai/i.test(this.responseText)) {
                                    sendToExtension('FOOD_STATUS', { foodEatenToday: 10 });
                                }
                            }
                        } else if (this.responseText && /batas roti harian tercapai/i.test(this.responseText)) {
                            sendToExtension('FOOD_STATUS', { foodEatenToday: 10 });
                        }
                    }
                } catch { /* ignore */ }
            });

            return originalSend.apply(this, arguments);
        };
    }

    // ── 3. Listen for commands from the extension ─────────────────────────────
    window.addEventListener('message', function(event) {
        if (!event || event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== EXT_SOURCE) return;

        if (data.action === 'PING') {
            sendToExtension('PONG', { active: true });
        }
    });

    // Notify extension that Main-World Interceptor is active
    sendToExtension('READY', { active: true });
})();
