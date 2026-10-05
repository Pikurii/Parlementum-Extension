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

function updateBadge(status, rawConfig) {
    if (!chrome.action) return;
    if (!status) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    const config = parseConfig(rawConfig);

    // 1. Check if token is expired, missing, or paused for token
    const isExpired = Boolean(
        status.tokenExpired ||
        status.pausedForToken ||
        !status.hasToken ||
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

    // 4. Energy display: includes natural passive regen with city health buff
    let curE = status.currentEnergy;
    const maxE = status.maxEnergy || 115;
    if (curE != null && status.updatedAt && curE < maxE) {
        const elapsedMins = (Date.now() - status.updatedAt) / 60000;
        const regenRate = status.regenRate || 1.0;
        const gained = Math.floor(elapsedMins * regenRate);
        if (gained > 0) {
            curE = Math.min(maxE, curE + gained);
        }
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
chrome.storage.local.get(['aw_live_status', 'aw_config']).then(data => {
    updateBadge(data.aw_live_status, data.aw_config);
}).catch(() => {});

// ── Listen for storage changes to update badge immediately ───────────────────
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.aw_live_status || changes.aw_config) {
        chrome.storage.local.get(['aw_live_status', 'aw_config']).then(data => {
            updateBadge(data.aw_live_status, data.aw_config);
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

        if (!isManual && status.running === false) return { ok: false, reason: 'paused' };
        if (!isManual && status.lastWorkTimestamp && (Date.now() - status.lastWorkTimestamp < 45000)) {
            return { ok: false, reason: 'cooldown' };
        }
        if (!token) return { ok: false, error: 'no_token' };
        if (expiry && expiry <= Date.now()) {
            status.running = false;
            status.tokenExpired = true;
            status.pausedForToken = true;
            status.hasToken = false;
            status.lastLogMessage = `[${nowStr}] ❌ Token expired! Buka game untuk login.`;
            await chrome.storage.local.set({
                aw_live_status: status,
                aw_auth_token: '',
                aw_auth_token_expiry: '0'
            });
            updateBadge(status, config);
            showDesktopNotification({
                title: '🔑 Parlamentum: Token Expired!',
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

        const threshold = config.energyThreshold || 10;
        if (!isManual && (status.currentEnergy || 0) < threshold) {
            return { ok: false, reason: 'insufficient_energy' };
        }
        if (isManual && (status.currentEnergy || 0) < 10) {
            return { ok: false, error: 'insufficient_energy' };
        }

        const response = await fetch('https://parlamentum.org/api/player/work', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
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
                status.lastLogMessage = `[${nowStr}] Shift tidak menghasilkan XP (energi server belum cukup: 0⚡). Menunggu energi pulih.`;
                appendBackgroundLog(status.lastLogMessage, 'warn');
                status.updatedAt = Date.now();
                status.nextWorkTimestamp = Date.now() + 10 * 60000;
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
                return { ok: false, reason: 'zero_gain' };
            }

            // In Parlamentum, a shift consumes all available energy in blocks of 10
            const availableBlocks = Math.floor((status.currentEnergy || 0) / 10) * 10;
            const energyUsed = Number.isSafeInteger(resEnergyUsed) && resEnergyUsed >= 10
                ? resEnergyUsed
                : Math.max(10, availableBlocks);
            const xpGained = Number.isSafeInteger(resXp) && resXp > 0
                ? resXp
                : Math.floor(energyUsed / 10) * 4;

            if (xpGained <= 0) {
                status.currentEnergy = 0;
                status.updatedAt = Date.now();
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
                return { ok: false, reason: 'zero_gain' };
            }

            status.currentEnergy = Math.max(0, (status.currentEnergy || 0) - energyUsed);
            status.workToday     = (status.workToday || 0) + 1;
            status.totalWorked   = (status.totalWorked || 0) + 1;
            status.xpToday       = (status.xpToday || 0) + xpGained;
            status.totalWorkXP   = (status.totalWorkXP || 0) + xpGained;
            status.lastWorkTime  = nowStr;
            status.lastWorkTimestamp = Date.now();
            status.lastLogMessage = `[${nowStr}] Shift sukses (Background): +${xpGained} XP | Sisa: ${status.currentEnergy}⚡`;
            appendBackgroundLog(status.lastLogMessage, 'success');
            status.updatedAt     = Date.now();
            const neededMs = Math.max(1, (config.energyThreshold || 90) - status.currentEnergy) * 60000;
            status.nextWorkTimestamp = Date.now() + neededMs;

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
                    message: `⚡ Shift sukses! +${xpGained} XP (Sisa: ${status.currentEnergy}⚡)`,
                    priority: 1
                });
            }

            return { ok: true, xpEarned: xpGained, energyUsed };
        } else if (response.status === 401) {
            status.lastLogMessage = `[${nowStr}] 🔄 Token expired (401). Me-reload tab game untuk refresh token...`;
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
                status.lastLogMessage = `[${nowStr}] ⚠️ ${serverMsg || 'Harus berada di wilayah perusahaan untuk bekerja.'}`;
                status.nextWorkTimestamp = Date.now() + 3 * 60000; // retry in 3 minutes
                appendBackgroundLog(status.lastLogMessage, 'warn');
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
                return { ok: false, error: 'region_mismatch', message: serverMsg };
            }

            // 2. Insufficient Energy Error
            const isEnergyErr = /(insufficient[_ ]energy|not enough energy|energi.{0,40}(?:tidak|belum|kurang)|produce even one unit)/i.test(combined);
            if (isEnergyErr) {
                const curEnergy = Math.max(0, Number(status.currentEnergy) || 0);
                status.updatedAt = Date.now();
                const neededMs = Math.max(1, (config.energyThreshold || 90) - curEnergy) * 60000;
                status.nextWorkTimestamp = Date.now() + neededMs;
                status.lastLogMessage = serverMsg ? `[${nowStr}] ⚠️ ${serverMsg}` : `[${nowStr}] ⚠️ Energi di server belum cukup.`;
                appendBackgroundLog(status.lastLogMessage, 'warn');
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
                return { ok: false, error: 'insufficient_energy', message: serverMsg || 'Energi tidak cukup' };
            }

            // 3. Other errors (funds, materials, etc.)
            status.lastLogMessage = serverMsg
                ? `[${nowStr}] ⚠️ ${serverMsg}`
                : `[${nowStr}] ⚠️ Server menolak shift (HTTP ${response.status}).`;
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
                await chrome.storage.local.set({ aw_live_status: status });
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

                // Pick best tab: active tab first, or any open tab
                const targetTab = tabs?.find(t => t.active) || tabs?.[0];

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

// ── Tab Anti-Discard & Wake Protection ─────────────────────────────────────
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
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab?.url && tab.url.includes('parlamentum.org')) {
        protectTabFromDiscard(tabId);
    }
});

// ── Background Alarms Worker (every 1 minute) ──────────────────────────────
try {
    chrome.alarms.get('aw_background_tick', alarm => {
        if (!alarm) {
            chrome.alarms.create('aw_background_tick', { periodInMinutes: 1 });
        }
    });
} catch { /* ignore */ }

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'aw_background_tick') return;

    try {
        const data = await chrome.storage.local.get(['aw_live_status', 'aw_config']);
        const status = data.aw_live_status;
        const config = parseConfig(data.aw_config);

        if (!status || status.running === false) return;

        // 1. Check Sleep Schedule
        if (config.sleepScheduleEnabled) {
            const h = new Date().getHours();
            const start = config.sleepStartHour ?? 1;
            const end = config.sleepEndHour ?? 6;
            const inSleep = start < end ? (h >= start && h < end) : (h >= start || h < end);
            if (inSleep) return;
        }

        const threshold = config.energyThreshold || 10;

        // 2. Query open tabs to execute work natively in tab context
        const tabs = await chrome.tabs.query({ url: '*://parlamentum.org/*' });
        if (tabs && tabs.length > 0) {
            // Sort tabs: active foreground tab first, then /dashboard tab, then others
            tabs.sort((a, b) => {
                if (a.active && !b.active) return -1;
                if (!a.active && b.active) return 1;
                const aDash = (a.url && a.url.includes('/dashboard')) ? 1 : 0;
                const bDash = (b.url && b.url.includes('/dashboard')) ? 1 : 0;
                return bDash - aDash;
            });

            let lockOwnerTab = null;
            let bestEnergy = null;
            let workedInTab = false;

            for (const tab of tabs) {
                protectTabFromDiscard(tab.id);

                // If tab was discarded by browser memory saver, reload it
                if (tab.discarded) {
                    chrome.tabs.reload(tab.id);
                    continue;
                }

                try {
                    const res = await new Promise(resolve => {
                        const timer = setTimeout(() => resolve(null), 12000);
                        chrome.tabs.sendMessage(tab.id, { type: 'WAKE_WORKER' }, r => {
                            clearTimeout(timer);
                            if (chrome.runtime.lastError || !r) resolve(null);
                            else resolve(r);
                        });
                    });

                    if (res && res.handled) {
                        if (res.isLockOwner) {
                            lockOwnerTab = tab;
                        }
                        if (res.energy != null) {
                            if (bestEnergy == null || res.energy > bestEnergy) {
                                bestEnergy = res.energy;
                            }
                        }
                        if (res.worked) {
                            // Shift was executed inside WAKE_WORKER!
                            workedInTab = true;
                            break;
                        }
                    }
                } catch { /* ignore */ }
            }

            if (bestEnergy != null) {
                if (status.currentEnergy !== bestEnergy || !status.updatedAt) {
                    status.currentEnergy = bestEnergy;
                    status.updatedAt = Date.now();
                }
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
            }

            if (workedInTab) return;

            // If a shift was executed within the last 45 seconds, prevent duplicate execution
            const nowMs = Date.now();
            if (status.lastWorkTimestamp && (nowMs - status.lastWorkTimestamp < 45000)) {
                return;
            }

            // Tabs are open and active: tab is the primary executor via WAKE_WORKER.
            // If tab responded, do not double-fire background work.
            return;
        }

        // 3. Fallback: ONLY when NO tabs are open (0 open tabs)
        // Natural passive energy regeneration with city health buff
        const now = Date.now();
        if (status.currentEnergy != null && status.updatedAt && status.currentEnergy < (status.maxEnergy || 115)) {
            const elapsedMins = (now - status.updatedAt) / 60000;
            const regenRate = status.regenRate || 1.0;
            const gained = Math.floor(elapsedMins * regenRate);
            if (gained > 0) {
                const max = status.maxEnergy || 115;
                status.currentEnergy = Math.min(max, status.currentEnergy + gained);
                status.updatedAt = now;
                await chrome.storage.local.set({ aw_live_status: status });
                updateBadge(status, config);
            }
        }

        const nowMs = Date.now();
        if (status.lastWorkTimestamp && (nowMs - status.lastWorkTimestamp < 45000)) {
            return;
        }

        if (status.currentEnergy != null && status.currentEnergy >= threshold) {
            await doBackgroundWork(false);
        }
    } catch (err) {
        console.error('[Background Alarm] Error:', err);
    }
});
