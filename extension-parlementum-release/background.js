/**
 * background.js — MV3 Service Worker
 *
 * Responsibilities:
 * 1. Notifications relay (via chrome.notifications)
 * 2. Toolbar Badge management (displays live energy, status, or sleep)
 * 3. Command router with tab unfreezing & background fallback
 * 4. Background Worker: executes work shifts via alarms or when tabs are closed/frozen
 */

function parseConfig(raw) {
    if (!raw) return { energyThreshold: 10 };
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return { energyThreshold: 10 }; }
    }
    return raw;
}

function showDesktopNotification(options) {
    try {
        const iconUrl = chrome.runtime.getURL('icons/icon48.png');
        const rawTitle = options?.title;
        const title = typeof rawTitle === 'string' ? rawTitle : (typeof rawTitle === 'object' && rawTitle?.title ? String(rawTitle.title) : 'Parlamentum Auto Worker');
        const rawMessage = options?.message;
        const message = typeof rawMessage === 'string' ? rawMessage : (typeof rawMessage === 'object' && rawMessage?.message ? String(rawMessage.message) : String(rawMessage || ''));

        chrome.notifications.create('aw_notif_' + Date.now(), {
            type: 'basic',
            iconUrl: iconUrl,
            title: title,
            message: message,
            priority: options?.priority ?? 2,
            requireInteraction: Boolean(options?.requireInteraction)
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('[Notification error]', chrome.runtime.lastError.message);
            }
        });
    } catch (e) {
        console.error('[Notification exception]', e);
    }
}

if (chrome.notifications?.onClicked) {
    chrome.notifications.onClicked.addListener(() => {
        chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
            if (tabs && tabs.length > 0) {
                const target = tabs.find(t => t.active) || tabs[0];
                chrome.tabs.update(target.id, { active: true });
                if (target.windowId) {
                    chrome.windows.update(target.windowId, { focused: true });
                }
            } else {
                chrome.tabs.create({ url: 'https://parlamentum.org/dashboard' });
            }
        });
    });
}

async function appendBackgroundLog(message, type = 'info') {
    try {
        const nowStr = new Date().toLocaleTimeString('id-ID');
        const res = await chrome.storage.local.get(['aw_recent_logs']);
        const logs = Array.isArray(res.aw_recent_logs) ? res.aw_recent_logs : [];
        logs.unshift({ time: nowStr, type, message });
        if (logs.length > 80) logs.length = 80;
        await chrome.storage.local.set({ aw_recent_logs: logs });
    } catch { /* ignore */ }
}

/**
 * Pure mathematical projection of energy from a fixed anchor point.
 * Preserves fractional elapsed milliseconds so that zero seconds are lost across ticks.
 *
 * @param {object} syncBase { current, max, updatedAt, regenRate }
 * @param {number} [now=Date.now()]
 * @returns {number} Integer energy clamped between 0 and max
 */
function calculateProjectedEnergy(syncBase, now = Date.now()) {
    if (!syncBase || typeof syncBase.current !== 'number') return 0;
    const max = syncBase.max || 115;
    if (syncBase.current >= max) return max;
    const updatedAt = syncBase.updatedAt || now;
    const elapsedMs = Math.max(0, now - updatedAt);
    const rate = Math.max(0.5, syncBase.regenRate || 1.0);
    // Parlamentum formula: `rate` energy per minute (60,000 ms)
    const gained = Math.floor((elapsedMs * rate) / 60000);
    return Math.min(max, syncBase.current + gained);
}

function updateBadge(status, rawConfig) {
    if (!chrome.action) return;
    if (!status) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    const config = parseConfig(rawConfig);

    // 1. Check if token is expired or paused for token
    const isExpired = Boolean(
        status.tokenExpired ||
        status.pausedForToken ||
        (status.tokenExpiry && Number(status.tokenExpiry) <= Date.now())
    );

    if (isExpired) {
        chrome.action.setBadgeText({ text: 'EXPD' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff0033' });
        return;
    }

    // 2. Normal pause
    if (status.running === false) {
        chrome.action.setBadgeText({ text: 'PAUS' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff7700' });
        return;
    }

    // 3. Sleep schedule
    if (config.sleepScheduleEnabled) {
        const h = new Date().getHours();
        const start = config.sleepStartHour ?? 1;
        const end = config.sleepEndHour ?? 6;
        const inSleep = start < end ? (h >= start && h < end) : (h >= start || h < end);
        if (inSleep) {
            chrome.action.setBadgeText({ text: 'ZZZ' });
            chrome.action.setBadgeBackgroundColor({ color: '#666688' });
            return;
        }
    }

    // 4. Energy display: includes natural passive regen with city health buff via fixed anchor
    const now = Date.now();
    let curE = status.currentEnergy;
    if (status.energySyncBase) {
        curE = calculateProjectedEnergy(status.energySyncBase, now);
    } else if (curE == null || typeof curE !== 'number') {
        const syncBase = {
            current: 0,
            max: status.maxEnergy || 115,
            updatedAt: status.updatedAt || now,
            regenRate: status.regenRate || 1.0
        };
        curE = calculateProjectedEnergy(syncBase, now);
    }
    const text = curE != null ? String(curE) : '';
    chrome.action.setBadgeText({ text });
    const threshold = config.energyThreshold || status.energyThreshold || 10;
    if (curE != null && curE >= threshold) {
        chrome.action.setBadgeBackgroundColor({ color: '#00ff88' });
    } else {
        chrome.action.setBadgeBackgroundColor({ color: '#0088ff' });
    }
}

// ── Refresh badge on service worker wake-up ──────────────────────────────────
chrome.storage.local.get(['aw_live_status', 'aw_config', 'aw_worker_running', 'aw_auth_token', 'aw_auth_token_expiry']).then(data => {
    const status = data.aw_live_status || {};
    if (data.aw_worker_running !== undefined) {
        status.running = data.aw_worker_running !== 'false';
    }
    if (data.aw_auth_token_expiry && Number(data.aw_auth_token_expiry) <= Date.now()) {
        status.tokenExpired = true;
    }
    updateBadge(status, data.aw_config);
}).catch(() => {});

// ── Listen for storage changes to update badge immediately ───────────────────
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.aw_live_status || changes.aw_config || changes.aw_worker_running || changes.aw_auth_token_expiry) {
        chrome.storage.local.get(['aw_live_status', 'aw_config', 'aw_worker_running', 'aw_auth_token', 'aw_auth_token_expiry']).then(data => {
            const status = data.aw_live_status || {};
            if (data.aw_worker_running !== undefined) {
                status.running = data.aw_worker_running !== 'false';
            }
            if (data.aw_auth_token_expiry && Number(data.aw_auth_token_expiry) <= Date.now()) {
                status.tokenExpired = true;
            }
            updateBadge(status, data.aw_config);
        }).catch(() => {});
    }
});

// ── Core Background Worker Function ──────────────────────────────────────────
async function doBackgroundWork(isManual = false) {
    try {
        const nowStr = new Date().toLocaleTimeString('id-ID');
        const data = await chrome.storage.local.get([
            'aw_live_status',
            'aw_config',
            'aw_auth_token',
            'aw_auth_token_expiry',
            'aw_worker_running',
            'aw_work_mutex',
            'totalWorked',
            'workToday',
            'totalWorkXP',
            'xpToday',
            'totalEnergySpent',
            'totalActualEnergySpent',
            'aw_workHistory',
            'aw_work_history'
        ]);

        const status = data.aw_live_status || {};
        const config = parseConfig(data.aw_config);
        const token  = data.aw_auth_token;
        const expiry = data.aw_auth_token_expiry ? Number(data.aw_auth_token_expiry) : 0;

        const isRunning = data.aw_worker_running !== 'false' && status.running !== false;
        if (!isManual && !isRunning) return { ok: false, reason: 'paused' };
        if (!isManual && status.serverCooldownUntil && Date.now() < status.serverCooldownUntil) {
            return { ok: false, reason: 'server_cooldown' };
        }
        if (!isManual && status.lastWorkTimestamp && (Date.now() - status.lastWorkTimestamp < 45000)) {
            return { ok: false, reason: 'cooldown' };
        }
        const mutex = data.aw_work_mutex || 0;
        if (!isManual && mutex && Date.now() < mutex) {
            return { ok: false, reason: 'work_in_flight' };
        }
        await chrome.storage.local.set({ aw_work_mutex: Date.now() + 20000 });
        if (!token) return { ok: false, error: 'no_token' };
        if (expiry && expiry <= Date.now()) {
            status.running = false;
            status.tokenExpired = true;
            status.pausedForToken = true;
            status.hasToken = false;
            status.lastLogMessage = `[${nowStr}] Token expired. Buka game untuk login.`;
            await chrome.storage.local.set({
                aw_live_status: status,
                aw_auth_token: '',
                aw_auth_token_expiry: '0'
            });
            updateBadge(status, config);
            showDesktopNotification({
                title: 'Parlamentum: Token Expired',
                message: config.autoReloginEnabled
                    ? 'Sesi login berakhir. Auto Re-Login mengarahkan ke halaman login...'
                    : 'Sesi login telah berakhir. Silakan buka game dan login ulang.',
                requireInteraction: true,
                priority: 2
            });

            if (config.autoReloginEnabled) {
                chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
                    if (tabs && tabs.length > 0) {
                        chrome.tabs.update(tabs[0].id, { url: 'https://parlamentum.org/login' });
                    }
                });
            }

            return { ok: false, error: 'token_expired' };
        }

        const isFlush = isEnergyFlushActive(config);
        const threshold = isFlush ? 10 : (config.energyThreshold || 10);
        const projEnergy = calculateProjectedEnergy(status.energySyncBase, Date.now());
        const curEnergy = projEnergy != null ? projEnergy : (status.currentEnergy ?? 0);
        if (!isManual && curEnergy < threshold) {
            return { ok: false, reason: 'insufficient_energy' };
        }
        if (isManual && curEnergy < 10) {
            return { ok: false, error: 'insufficient_energy' };
        }

        const response = await fetch('https://parlamentum.org/api/player/work', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token.replace(/^Bearer\s+/i, '').trim()}`,
                'Accept': '*/*'
            },
            credentials: 'include',
            body: JSON.stringify({})
        });

        if (response.ok) {
            let resData = null;
            try { resData = await response.json(); } catch { /* ignore */ }

            const resEnergyUsed = Number(resData?.energyUsed);
            const resXp = Number(resData?.xpEarned);
            const isZeroEnergy = Number.isSafeInteger(resEnergyUsed) && resEnergyUsed === 0;
            const isZeroXp = Number.isSafeInteger(resXp) && resXp === 0;

            if (isZeroEnergy || isZeroXp || resData?.error || (typeof resData?.message === 'string' && /energy|unit/i.test(resData.message))) {
                status.currentEnergy = 0;
                status.energySyncBase = {
                    current: 0,
                    max: status.maxEnergy || 115,
                    updatedAt: Date.now(),
                    regenRate: status.regenRate || 1.0
                };
                status.lastLogMessage = `[${nowStr}] Shift tidak menghasilkan XP (energi server belum cukup: 0 EN). Menunggu energi pulih.`;
                appendBackgroundLog(status.lastLogMessage, 'warn');
                status.updatedAt = Date.now();
                status.nextWorkTimestamp = Date.now() + 10 * 60000;
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
                return { ok: false, reason: 'zero_gain' };
            }

            // In Parlamentum, a shift consumes all available energy in blocks of 10
            const availableBlocks = Math.floor(curEnergy / 10) * 10;
            const energyUsed = Number.isSafeInteger(resEnergyUsed) && resEnergyUsed >= 10
                ? resEnergyUsed
                : Math.max(10, availableBlocks);
            const xpGained = Number.isSafeInteger(resXp) && resXp > 0
                ? resXp
                : Math.floor(energyUsed / 10) * 4;

            if (xpGained <= 0) {
                status.currentEnergy = 0;
                status.energySyncBase = {
                    current: 0,
                    max: status.maxEnergy || 115,
                    updatedAt: Date.now(),
                    regenRate: status.regenRate || 1.0
                };
                status.updatedAt = Date.now();
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
                return { ok: false, reason: 'zero_gain' };
            }

            if (resData?.energy != null && typeof resData.energy === 'number') {
                status.currentEnergy = Math.max(0, Math.round(resData.energy));
            } else {
                status.currentEnergy = Math.max(0, curEnergy - energyUsed);
            }
            status.energySyncBase = {
                current: status.currentEnergy,
                max: status.maxEnergy || 115,
                updatedAt: Date.now(),
                regenRate: status.regenRate || 1.0
            };
            status.workToday     = (status.workToday || 0) + 1;
            status.totalWorked   = (status.totalWorked || 0) + 1;
            status.xpToday       = (status.xpToday || 0) + xpGained;
            status.totalWorkXP   = (status.totalWorkXP || 0) + xpGained;
            status.lastWorkTime  = nowStr;
            status.lastWorkTimestamp = Date.now();
            const units = Number(resData?.workerUnits) || Number(resData?.produced) || 0;
            const unitsPart = units > 0 ? ` | +${units} unit` : '';
            status.lastLogMessage = `[${nowStr}] Shift sukses (Background): +${xpGained} XP${unitsPart}`;
            appendBackgroundLog(status.lastLogMessage, 'success');
            status.updatedAt     = Date.now();
            const rate = Math.max(0.5, status.regenRate || 1.0);
            const neededMins = Math.max(1, ((config.energyThreshold || 90) - status.currentEnergy) / rate);
            status.nextWorkTimestamp = Date.now() + Math.round(neededMins * 60000);

            const todayKey = new Date().toDateString();
            let history = data.aw_workHistory || data.aw_work_history || {};
            if (typeof history === 'string') {
                try { history = JSON.parse(history); } catch { history = {}; }
            }
            if (!history || typeof history !== 'object') history = {};
            if (!history[todayKey]) history[todayKey] = { shifts: 0, xp: 0, energySpent: 0 };
            history[todayKey].shifts = (history[todayKey].shifts || 0) + 1;
            history[todayKey].xp = (history[todayKey].xp || 0) + xpGained;
            history[todayKey].energySpent = (history[todayKey].energySpent || 0) + energyUsed;

            const totalEnergySpent = (Number(data.totalEnergySpent) || 0) + energyUsed;
            const totalActualEnergySpent = (Number(data.totalActualEnergySpent) || 0) + energyUsed;

            await chrome.storage.local.set({
                aw_live_status: status,
                totalWorked: status.totalWorked.toString(),
                workToday: status.workToday.toString(),
                totalWorkXP: status.totalWorkXP.toString(),
                xpToday: status.xpToday.toString(),
                totalEnergySpent: totalEnergySpent.toString(),
                totalActualEnergySpent: totalActualEnergySpent.toString(),
                lastWorkTime: status.lastWorkTime,
                aw_workHistory: JSON.stringify(history)
            });

            updateBadge(status, config);

            // Notify all open tabs so their DOM and panel are immediately up to date
            chrome.tabs.query({ url: '*://parlamentum.org/*' }, openTabs => {
                if (openTabs && openTabs.length > 0) {
                    for (const t of openTabs) {
                        chrome.tabs.sendMessage(t.id, {
                            type: 'STORAGE_SYNC',
                            action: 'backgroundWorkDone',
                            energy: status.currentEnergy,
                            maxEnergy: status.maxEnergy || 110,
                            status
                        }).catch(() => {});
                    }
                }
            });

            if (config.sendNotification !== false) {
                showDesktopNotification({
                    title: 'Parlamentum Auto Worker',
                    message: `Shift sukses: +${xpGained} XP${unitsPart}`,
                    priority: 1
                });
            }

            return { ok: true, xpEarned: xpGained, energyUsed };
        } else if (response.status === 401) {
            status.lastLogMessage = `[${nowStr}] Token expired (401). Me-reload tab game untuk refresh token...`;
            appendBackgroundLog(status.lastLogMessage, 'warn');
            await chrome.storage.local.set({ aw_live_status: status });

            chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
                if (tabs && tabs.length > 0) {
                    console.log('[Background] Token 401: me-reload tab game agar sesi cookie menerbitkan token baru...');
                    chrome.tabs.reload(tabs[0].id);
                }
            });

            return { ok: false, error: 'token_expired' };
        } else if (response.status === 400 || response.status === 422) {
            const errText = await response.text().catch(() => '');
            let serverMsg = '';
            try {
                const p = JSON.parse(errText);
                serverMsg = p.message || p.error || p.detail || '';
            } catch { serverMsg = errText.slice(0, 100); }

            const combined = `${errText} ${serverMsg}`;

            // 1. Region / Travel / Transit Error
            if (/region|wilayah|transit|travel|penerbangan/i.test(combined)) {
                status.lastLogMessage = `[${nowStr}] ${serverMsg || 'Harus berada di wilayah perusahaan untuk bekerja.'}`;
                status.nextWorkTimestamp = Date.now() + 3 * 60000; // retry in 3 minutes
                appendBackgroundLog(status.lastLogMessage, 'warn');
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
                return { ok: false, error: 'region_mismatch', message: serverMsg };
            }

            // 2. Insufficient Energy Error
            const isEnergyErr = /(insufficient[_ ]energy|not enough energy|energi.{0,40}(?:tidak|belum|kurang)|produce even one unit)/i.test(combined);
            if (isEnergyErr) {
                status.currentEnergy = 0;
                status.energySyncBase = {
                    current: 0,
                    max: status.maxEnergy || 115,
                    updatedAt: Date.now(),
                    regenRate: status.regenRate || 1.0
                };
                status.updatedAt = Date.now();
                const target = Math.max(20, config.energyThreshold || 90);
                const rate = Math.max(0.5, status.regenRate || 1.0);
                const neededMs = Math.max(120000, Math.round((target / rate) * 60000));
                status.nextWorkTimestamp = Date.now() + neededMs;
                status.lastLogMessage = serverMsg ? `[${nowStr}] ${serverMsg}` : `[${nowStr}] Energi di server belum cukup.`;
                appendBackgroundLog(status.lastLogMessage, 'warn');
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
                return { ok: false, error: 'insufficient_energy', message: serverMsg || 'Energi tidak cukup' };
            }

            // 3. Other errors (funds, materials, etc.)
            status.lastLogMessage = serverMsg
                ? `[${nowStr}] ${serverMsg}`
                : `[${nowStr}] Server menolak shift (HTTP ${response.status}).`;
            appendBackgroundLog(status.lastLogMessage, 'warn');
            await chrome.storage.local.set({ aw_live_status: status });
            updateBadge(status, config);
            return { ok: false, error: 'rejected', message: serverMsg || 'Server menolak shift' };
        } else {
            const errText = await response.text().catch(() => '');
            status.lastLogMessage = `[${nowStr}] Server menolak shift (HTTP ${response.status})`;
            await chrome.storage.local.set({ aw_live_status: status });
            return { ok: false, error: `http_${response.status}`, message: errText };
        }
    } catch (err) {
        console.error('[doBackgroundWork] Error:', err);
        return { ok: false, error: err.message };
    } finally {
        await chrome.storage.local.set({ aw_work_mutex: 0 }).catch(() => {});
    }
}

// ── Message Router ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'NOTIFY' || msg.type === 'TOKEN_EXPIRED') {
        const isCritical = Boolean(msg.requireInteraction || /expired|401|habis|kadaluarsa|dijeda|login/i.test(`${msg.title || ''} ${msg.message || ''}`));
        showDesktopNotification({
            title: msg.title || 'Parlamentum Auto Worker',
            message: msg.message || '',
            priority: msg.priority ?? (isCritical ? 2 : 1),
            requireInteraction: isCritical
        });
        sendResponse({ ok: true });
        return false;
    }

    if (msg.type === 'POPUP_TO_TAB') {
        (async () => {
            if (msg.action === 'toggleRunning') {
                const data = await chrome.storage.local.get(['aw_live_status', 'aw_config']);
                const status = data.aw_live_status || {};
                status.running = msg.value;
                await chrome.storage.local.set({
                    aw_live_status: status,
                    aw_worker_running: String(msg.value)
                });
                updateBadge(status, data.aw_config);

                // Notify all open tabs to keep them synchronized
                const tabs = await chrome.tabs.query({ url: '*://parlamentum.org/*' });
                for (const t of tabs) {
                    chrome.tabs.sendMessage(t.id, { type: 'POPUP_COMMAND', action: 'toggleRunning', value: msg.value }).catch(() => {});
                }
                sendResponse({ ok: true, running: msg.value });
                return;
            }

            if (msg.action === 'workNow') {
                const tabs = await chrome.tabs.query({ url: '*://parlamentum.org/*' });
                let worked = false;

                // Pick best tab: active dashboard tab first, then any dashboard tab, then active tab, then tabs[0]
                const targetTab = tabs?.find(t => t.active && isDashUrl(t.url)) ||
                                  tabs?.find(t => isDashUrl(t.url)) ||
                                  tabs?.find(t => t.active) ||
                                  tabs?.[0];

                if (targetTab) {
                    try {
                        const res = await new Promise(resolve => {
                            const timer = setTimeout(() => resolve(null), 8000);
                            chrome.tabs.sendMessage(targetTab.id, { type: 'POPUP_COMMAND', action: 'workNow' }, r => {
                                clearTimeout(timer);
                                if (chrome.runtime.lastError || !r) resolve(null);
                                else resolve(r);
                            });
                        });
                        if (res) {
                            worked = true;
                            sendResponse(res);
                            return;
                        }
                    } catch { /* ignore */ }
                }

                // If no tab is open or tab completely timed out:
                // execute directly via Background Service Worker!
                if (!worked) {
                    console.log('[Background] Tab tidak merespons atau tidak ada. Menjalankan manual shift via Background Worker...');
                    const bgResult = await doBackgroundWork(true);
                    sendResponse(bgResult);
                }
                return;
            }

            sendResponse({ ok: false, error: 'unknown_action' });
        })();
        return true;
    }

    return false;
});

// ── Tab Presence & Leadership Registry ─────────────────────────────────────
function isDashUrl(url) {
    if (!url) return false;
    try {
        const u = new URL(url);
        const p = u.pathname.toLowerCase().replace(/\/+$/, '');
        return p === '/dashboard' || p === '';
    } catch { return false; }
}

async function updateDashboardTabPresence() {
    try {
        const tabs = await chrome.tabs.query({ url: '*://parlamentum.org/*' });
        const hasDash = tabs?.some(t => isDashUrl(t.url)) || false;
        await chrome.storage.local.set({ aw_has_dashboard_tab: hasDash });
    } catch { /* ignore */ }
}

function protectTabFromDiscard(tabId) {
    try {
        chrome.tabs.update(tabId, { autoDiscardable: false }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
        });
    } catch { /* ignore */ }
}

chrome.tabs.onCreated.addListener(tab => {
    if (tab?.url && tab.url.includes('parlamentum.org')) {
        protectTabFromDiscard(tab.id);
        updateDashboardTabPresence();
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab?.url && tab.url.includes('parlamentum.org')) {
        protectTabFromDiscard(tabId);
        updateDashboardTabPresence();
    }
});

chrome.tabs.onRemoved.addListener(() => {
    updateDashboardTabPresence();
});

// Run once on worker boot
updateDashboardTabPresence();

// ── Background Alarms Worker (every 1 minute) ──────────────────────────────
try {
    chrome.alarms.get('aw_background_tick', alarm => {
        if (!alarm) {
            chrome.alarms.create('aw_background_tick', { periodInMinutes: 1 });
        }
    });
} catch { /* ignore */ }

function isEnergyFlushActive(config) {
    if (!config?.energyFlushEnabled) return false;
    const now = new Date();
    return now.getUTCHours() === 23 && now.getUTCMinutes() >= 15;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'aw_background_tick') return;

    try {
        const data = await chrome.storage.local.get(['aw_live_status', 'aw_config', 'aw_worker_running']);
        const status = data.aw_live_status;
        const config = parseConfig(data.aw_config);

        if (!status || status.running === false || data.aw_worker_running === 'false') return;

        // Check Server Cooldown penalty
        if (status.serverCooldownUntil && Date.now() < status.serverCooldownUntil) {
            updateBadge(status, config);
            return;
        }

        // Check Micro-Breaks or Network Backoff
        if (status.microBreakUntil && Date.now() < status.microBreakUntil) {
            updateBadge(status, config);
            return;
        }
        if (status.backoffUntil && Date.now() < status.backoffUntil) {
            updateBadge(status, config);
            return;
        }

        // 1. Check Sleep Schedule
        if (config.sleepScheduleEnabled) {
            const h = new Date().getHours();
            const start = config.sleepStartHour ?? 1;
            const end = config.sleepEndHour ?? 6;
            const inSleep = start < end ? (h >= start && h < end) : (h >= start || h < end);
            if (inSleep) return;
        }

        // Energy Flush support
        const isFlush = isEnergyFlushActive(config);
        const threshold = isFlush ? 10 : (config.energyThreshold || 10);

        // 2. Query open tabs first to get authoritative ground truth from game DOM
        const tabs = await chrome.tabs.query({ url: '*://parlamentum.org/*' });
        let workedInTab = false;
        let tabHandledWorker = false;
        let bestEnergy = null;
        let bestEnergySyncBase = null;

        if (tabs && tabs.length > 0) {
            // Dashboard tabs ALWAYS take absolute priority over non-dashboard tabs (e.g. /map, /pasar)
            tabs.sort((a, b) => {
                const aDash = isDashUrl(a.url) ? 1 : 0;
                const bDash = isDashUrl(b.url) ? 1 : 0;
                if (aDash !== bDash) return bDash - aDash;
                if (a.active && !b.active) return -1;
                if (!a.active && b.active) return 1;
                return 0;
            });

            // Target open tabs (dashboard first)
            for (const tab of tabs) {
                protectTabFromDiscard(tab.id);

                if (tab.discarded) {
                    chrome.tabs.reload(tab.id);
                    continue;
                }

                try {
                    const res = await new Promise(resolve => {
                        const timer = setTimeout(() => resolve(null), 8000);
                        chrome.tabs.sendMessage(tab.id, { type: 'WAKE_WORKER' }, r => {
                            clearTimeout(timer);
                            if (chrome.runtime.lastError || !r) resolve(null);
                            else resolve(r);
                        });
                    });

                    if (res && res.handled) {
                        tabHandledWorker = true;
                        const isThisTabDashboard = isDashUrl(tab.url);
                        if (res.worked || res.isLockOwner || isThisTabDashboard) {
                            bestEnergy = res.energy;
                            if (res.energySyncBase) bestEnergySyncBase = res.energySyncBase;
                            if (res.worked) {
                                workedInTab = true;
                            }
                            // Master leader tab, Dashboard tab, or tab that executed work responded
                            break;
                        } else if (bestEnergy == null && res.energy != null && !tabs.some(t => isDashUrl(t.url))) {
                            // Only fallback to non-dashboard tab if NO dashboard tab exists at all!
                            bestEnergy = res.energy;
                            if (res.energySyncBase) bestEnergySyncBase = res.energySyncBase;
                        }
                        if (res.worked) {
                            workedInTab = true;
                            break;
                        }
                    }
                } catch { /* ignore */ }
            }

            if (bestEnergy != null) {
                const freshData = await chrome.storage.local.get(['aw_live_status']);
                const liveStatus = freshData.aw_live_status || status;
                liveStatus.currentEnergy = bestEnergy;
                if (bestEnergySyncBase) {
                    liveStatus.energySyncBase = bestEnergySyncBase;
                } else if (!liveStatus.energySyncBase || Math.abs(calculateProjectedEnergy(liveStatus.energySyncBase, Date.now()) - bestEnergy) >= 1) {
                    liveStatus.energySyncBase = {
                        current: bestEnergy,
                        max: liveStatus.maxEnergy || status.maxEnergy || 115,
                        updatedAt: Date.now(),
                        regenRate: liveStatus.regenRate || status.regenRate || 1.0
                    };
                }
                liveStatus.updatedAt = Date.now();
                await chrome.storage.local.set({ aw_live_status: liveStatus });
                updateBadge(liveStatus, config);
            }

            if (workedInTab || tabHandledWorker) return;

            // Tabs are open, but NONE of them responded to WAKE_WORKER (e.g. tabs completely dead/crashed/frozen).
            // Only if energy is already at or above threshold, execute the shift directly via Service Worker!
            const nowMs = Date.now();
            const hasRecentWork = status.lastWorkTimestamp && (nowMs - status.lastWorkTimestamp < 35000);
            const curEnergy = bestEnergy != null ? bestEnergy : Number(status.currentEnergy || 0);

            if (!hasRecentWork && curEnergy >= threshold) {
                console.log(`[Background Alarm] Tab tidak merespons tick alarm (energi: ${curEnergy}/${threshold}). Menjalankan via Background Worker...`);
                await doBackgroundWork(false);
            }
            return;
        } else {
            // Passive Regeneration & Badge Synchronization ONLY when NO tabs are open
            // Calculate smooth mathematical regen from fixed anchor (zero drift across ticks)
            const now = Date.now();
            const syncBase = status.energySyncBase || {
                current: status.currentEnergy ?? 0,
                max: status.maxEnergy || 115,
                updatedAt: status.updatedAt || now,
                regenRate: status.regenRate || 1.0
            };
            if (status.regenRate && syncBase.regenRate !== status.regenRate) {
                syncBase.regenRate = status.regenRate;
            }
            status.energySyncBase = syncBase;
            const projectedEnergy = calculateProjectedEnergy(syncBase, now);
            if (status.currentEnergy !== projectedEnergy) {
                status.currentEnergy = projectedEnergy;
                status.updatedAt = now;
                await chrome.storage.local.set({ aw_live_status: status });
            }
            updateBadge(status, config);

            // 4. Fallback: ONLY when NO tabs are open (0 open tabs)
            const nowMs = Date.now();
            const hasRecentWork = status.lastWorkTimestamp && (nowMs - status.lastWorkTimestamp < 35000);
            const curEnergy = Number(status.currentEnergy || 0);

            if (!hasRecentWork && curEnergy >= threshold) {
                console.log(`[Background Alarm] Tidak ada tab terbuka dan energi >= threshold (${curEnergy}/${threshold}). Menjalankan via Background Worker...`);
                await doBackgroundWork(false);
                return;
            }
        }
    } catch (err) {
        console.error('[Background Alarm] Error:', err);
    }
});
