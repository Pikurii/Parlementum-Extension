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

    // ── Guard: NEVER touch authentication, registration, or public onboarding routes ───
    if (/^\/(login|register|signup|forgot-password|reset-password)/i.test(window.location.pathname)) {
        return; // Complete passthrough: do not hook window.fetch, XMLHttpRequest, or dispatch messages
    }

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
    function scanAndDispatchApiData(url, status, data, method = 'GET', reqBody = null) {
        if (!data || typeof data !== 'object') return;

        try {
            const payload = (data.data && typeof data.data === 'object') ? { ...data, ...data.data } : data;

            // Extract stat from request body if available
            let reqStat = null;
            if (reqBody) {
                try {
                    const parsed = typeof reqBody === 'string' ? JSON.parse(reqBody) : reqBody;
                    if (parsed && typeof parsed === 'object' && parsed.stat) reqStat = parsed.stat;
                } catch { /* ignore */ }
            }

            // 0. Training endpoint response
            const isTrainUrl = url && (
                url.includes('/api/player/train') ||
                url.includes('/player/train') ||
                url.includes('/api/train')
            );

            if (isTrainUrl) {
                if (status >= 200 && status < 300) {
                    sendToExtension('TRAIN_SUCCESS', {
                        url,
                        status,
                        endsAt: payload.endsAt || payload.ends_at || null,
                        targetLevel: Number(payload.targetLevel ?? payload.target_level ?? 0),
                        costGold: Number(payload.costGold ?? payload.cost_gold ?? 0),
                        stat: payload.stat || reqStat || null,
                        raw: data
                    });
                } else {
                    sendToExtension('TRAIN_REJECTED', {
                        url,
                        status,
                        stat: reqStat || null,
                        message: payload.message || payload.error || payload.detail || '',
                        raw: data
                    });
                }
                return;
            }

            // 1. Work endpoint response
            const isWorkUrl = url && (
                url.includes('/api/player/work') ||
                url.includes('/player/work') ||
                url.includes('/api/work') ||
                url.includes('/api/player/shift') ||
                url.includes('/api/shift') ||
                /(?:\/api\/.*(?:work|shift))/i.test(url)
            );

            if (isWorkUrl) {
                if (status >= 200 && status < 300) {
                    const energyUsed = Number(payload.energyUsed) || Number(payload.energy_used) || 0;
                    const calculatedXp = energyUsed >= 10 ? Math.floor(energyUsed / 10) * 4 : (energyUsed > 0 ? 4 : 0);
                    const xpEarned = Number(payload.xpEarned) > 0 ? Number(payload.xpEarned) : (Number(payload.xp_earned) > 0 ? Number(payload.xp_earned) : calculatedXp);
                    sendToExtension('WORK_SUCCESS', {
                        url,
                        status,
                        energyUsed,
                        xpEarned,
                        produced: Number(payload.produced) || 0,
                        workerUnits: Number(payload.workerUnits) || Number(payload.worker_units) || 0,
                        wageNet: payload.wageNet || payload.wage_net || '0',
                        leveledUp: Boolean(payload.leveledUp || payload.leveled_up),
                        remainingEnergy: payload.energy != null ? Number(payload.energy) : null,
                        raw: data
                    });
                } else {
                    sendToExtension('WORK_REJECTED', {
                        url,
                        status,
                        message: payload.message || payload.error || payload.detail || '',
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

            // Check if user has premium status
            const isPrem = Boolean(data.isPremium || data.is_premium || data.premium || p?.isPremium || p?.is_premium || p?.premium);
            if (isPrem) {
                sendToExtension('PREMIUM_STATUS', { isPremium: true });
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

            // 4. Scanner for player stats (strength, education, economy) & gold
            const parseGoldVal = (v) => {
                if (typeof v === 'number' && !isNaN(v) && v >= 0) return Math.round(v);
                if (typeof v === 'string') {
                    const clean = v.replace(/[.,]/g, '').replace(/[^\d]/g, '');
                    const n = parseInt(clean, 10);
                    if (!isNaN(n) && n >= 0) return n;
                }
                return null;
            };

            let gold = parseGoldVal(data.gold) ?? parseGoldVal(data.walletGold) ?? parseGoldVal(data.wallet_gold);
            if (gold === null && p && typeof p === 'object') {
                gold = parseGoldVal(p.gold) ?? parseGoldVal(p.walletGold) ?? parseGoldVal(p.wallet_gold);
            }
            if (gold !== null && gold >= 0) {
                sendToExtension('WALLET_GOLD_SYNC', { gold });
            }

            let str = null, edu = null, eko = null;
            if (typeof data.strength === 'number') str = data.strength;
            if (typeof data.education === 'number') edu = data.education;
            if (typeof data.economy === 'number') eko = data.economy;
            if (p && typeof p === 'object') {
                if (str === null && typeof p.strength === 'number') str = p.strength;
                if (edu === null && typeof p.education === 'number') edu = p.education;
                if (eko === null && typeof p.economy === 'number') eko = p.economy;
            }
            if (str !== null || edu !== null || eko !== null) {
                sendToExtension('PLAYER_STATS_SYNC', {
                    strength: str !== null ? Math.round(str) : null,
                    education: edu !== null ? Math.round(edu) : null,
                    economy: eko !== null ? Math.round(eko) : null
                });
            }

            // Consuming food is strictly a mutating action (POST/PUT/PATCH).
            // Never trigger FOOD_CONSUMED on GET requests (which are merely inventory queries)
            // or on market/trade/shop/craft actions!
            const isMutation = (method === 'POST' || method === 'PUT' || method === 'PATCH');
            const isEatActionUrl = /(?:player\/eat|user\/eat|inventory\/use|inventory\/consume|item\/use|item\/consume|action\/eat)\b/i.test(url) &&
                                   !/(?:market|shop|trade|buy|sell|store|transfer|craft)\b/i.test(url);
            if (isMutation && isEatActionUrl && status >= 200 && status < 300) {
                sendToExtension('FOOD_CONSUMED', { raw: data, url });
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

            const method = (init?.method || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();

            // Crucial: ALWAYS call originalFetch with `window` as this context
            // to prevent "TypeError: 'fetch' called on an object that does not implement interface Window" in Firefox!
            const response = await Reflect.apply(originalFetch, window, arguments);

            // Clone and inspect API responses safely
            try {
                const url = typeof input === 'string' ? input : (input && input.url ? input.url : (typeof URL !== 'undefined' && input instanceof URL ? input.href : ''));
                if (url && (url.includes('/api/') || url.startsWith('/api/'))) {
                    // Ignore chat, SSE streams, websockets, and telemetry immediately
                    if (/chat|stream|socket|events|metrics|telemetry|analytics/i.test(url)) {
                        return response;
                    }
                    const contentType = response.headers?.get('content-type') || '';
                    if (!contentType.includes('application/json')) {
                        // Never clone streaming or non-JSON payloads
                        return response;
                    }
                    const clone = response.clone();
                    const reqBody = init?.body || (input && typeof input === 'object' && input.body) || null;
                    clone.text().then(text => {
                        try {
                            const data = JSON.parse(text);
                            scanAndDispatchApiData(url, response.status, data, method, reqBody);
                        } catch {
                            if (/batas roti harian tercapai/i.test(text)) {
                                sendToExtension('FOOD_STATUS', { foodEatenToday: 10 });
                            }
                        }
                    }).catch(() => {});
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

        XMLHttpRequest.prototype.send = function(body) {
            const method = (this._aw_method || 'GET').toUpperCase();
            this._aw_body = body;

            this.addEventListener('load', function() {
                try {
                    const url = this._aw_url || this.responseURL || '';
                    if (url && (url.includes('/api/') || url.startsWith('/api/'))) {
                        if (/chat|stream|socket|events|metrics|telemetry|analytics/i.test(url)) {
                            return;
                        }
                        const ct = this.getResponseHeader('content-type') || '';
                        if (!ct.includes('application/json')) return;
                        if (this.responseText) {
                            try {
                                const data = JSON.parse(this.responseText);
                                scanAndDispatchApiData(url, this.status, data, method, this._aw_body);
                            } catch {
                                if (/batas roti harian tercapai/i.test(this.responseText)) {
                                    sendToExtension('FOOD_STATUS', { foodEatenToday: 10 });
                                }
                            }
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
