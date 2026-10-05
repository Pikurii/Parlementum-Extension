/**
 * main.js — Entry point for the Chrome Extension content script
 *
 * Wires together all modules and runs the main worker loop.
 * Vite bundles this + all imports into dist/content.js.
 */

import { initStorage, getValue, setValue, onStorageChanged } from './storage.js';
import { loadConfig, saveConfig, normalizeConfig }           from './config.js';
import { createInitialState, saveState, saveLiveStatus, reloadStateFromStorage, getStoredInteger } from './state.js';
import { loadWorkHistory, saveWorkHistory }                   from './history.js';
import { log as _log, setLogUpdateCallback }                  from './logger.js';
import { parseJwt, handleNewToken as _handleNewToken, getTokenFromStorage as _getTokenFromStorage,
         getTimeUntilExpiry, startTokenWatcher }              from './token.js';
import { getSyncedEnergy, getCurrentEnergy, waitForEnergyElement, getPlayerLevel, getMaxEnergyForLevel,
         getLiveCountdown, getTimeToFullEnergy, getNextWorkDelay, patchPageVisualEnergy, getRegionHealthBonus, getRegionDetails } from './energy.js';
import { sendNotification, playNotificationSound, playEnergyFullAlarm, showInPageNotification } from './notifications.js';
import { doWork }                                             from './work.js';
import { createPanel, updatePanel as _updatePanel, setRunningUI, updatePanelVisibility } from './ui/panel.js';
import { createSettingsModal, openSettings }                  from './ui/settings.js';
import { createAnalyticsDashboard, openAnalytics }            from './ui/analytics.js';
import { createLogViewer, openLogViewer, updateLogViewer }    from './ui/logviewer.js';
import { setupLoginCapture, tryAutoLogin, getSavedCredentials } from './autologin.js';
import { initInterceptorClient }                              from './interceptor-client.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

(async function bootstrap() {
    'use strict';

    // 1. Load all persistent data synchronously into cache
    await initStorage();

    // 2. Config
    const CONFIG = loadConfig();

    // 3. Session start time persistence
    const todayStr = new Date().toDateString();
    const savedStartDay = getValue('sessionStartDay', '');
    let savedStartTime  = getStoredInteger('sessionStartTime', Date.now(), 1);

    if (savedStartDay !== todayStr) {
        savedStartTime = Date.now();
        setValue('sessionStartTime', savedStartTime.toString());
        setValue('sessionStartDay', todayStr);
    }

    // 4. Uncertain work state from previous session
    const hasUncertainWorkResult = getValue('aw_workResultUncertain', 'false') === 'true';
    let uncertainEnergyBefore = null;
    try {
        const raw = getValue('aw_uncertainEnergyBefore', '');
        uncertainEnergyBefore = raw ? JSON.parse(raw) : null;
    } catch { /* ignore */ }

    // 5. State
    const state = createInitialState(CONFIG, savedStartTime, hasUncertainWorkResult);
    let workHistory = loadWorkHistory(state, CONFIG);

    // 6. Schema migration (run once per install)
    _runMigrations(state, CONFIG, workHistory);

    // ─── Bound helpers ────────────────────────────────────────────────────────

    const log        = (msg, type, toLog) => _log(state, CONFIG, msg, type, toLog);
    const handleNewToken = (raw, src)    => _handleNewToken(state, log, () => wakePendingWork?.(), raw, src, () => setRunningUI(true), () => updatePanel());
    const getTokenFn     = ()            => _getTokenFromStorage(state, handleNewToken);

    // Context object passed to doWork and UI modules
    const ctx = {
        state, CONFIG,
        get workHistory() { return workHistory; },
        set workHistory(val) { workHistory = val; },
        log,
        handleNewToken,
        setRunningUI:      (running)     => setRunningUI(running),
        sendNotification:      (arg1, arg2, arg3) => sendNotification(arg1 === CONFIG ? arg2 : arg1, arg1 === CONFIG ? arg3 : arg2),
        playNotificationSound: (arg1, arg2)       => playNotificationSound(arg1, arg2),
        playEnergyFullAlarm:   (cfg)              => playEnergyFullAlarm(cfg || CONFIG),
        updatePanel:           ()                 => updatePanel(),
        updatePanelVisibility: (cfg)              => updatePanelVisibility(state, cfg || CONFIG),
        wakePendingWork:       ()                 => wakePendingWork?.(),
        setValue,
        get uncertainEnergyBefore() { return uncertainEnergyBefore; },
        set uncertainEnergyBefore(val) { uncertainEnergyBefore = val; },
        reconcileUncertainWork,
        // Energy helpers expected by panel.js
        getSyncedEnergy:        (st)     => getSyncedEnergy(st),
        getPlayerLevel:         (st)     => getPlayerLevel(st),
        getMaxEnergyForLevel:   (lvl)    => getMaxEnergyForLevel(lvl),
        getLiveCountdown:       (st)     => getLiveCountdown(st, CONFIG),
        getTimeToFullEnergy:    (st)     => getTimeToFullEnergy(st),
        getNextWorkDelay:       (st)     => getNextWorkDelay(st, CONFIG),
        getRegionDetails:       (force = false) => getRegionDetails(force),
        // Action helpers expected by panel.js
        doWork:            (manual = false) => doWork(ctx, manual),
        openSettings:      ()            => openSettings(CONFIG, ctx),
        openAnalytics:     ()            => openAnalytics(state, CONFIG, workHistory, ctx),
        openLogViewer:     ()            => openLogViewer(state, CONFIG),
        saveConfig:        (cfg)         => saveConfig(cfg),
        reloadStateFromStorage: ()       => reloadStateFromStorage(state, () => { workHistory = loadWorkHistory(state, CONFIG); }),
        patchPageVisualEnergy:  (cur, max, force) => patchPageVisualEnergy(cur, max, force),
    };

    // ─── Main-World Network Interceptor Bridge ─────────────────────────────────
    initInterceptorClient(state, CONFIG, ctx);

    // ─── UI wiring ────────────────────────────────────────────────────────────

    setLogUpdateCallback(() => updateLogViewer(state, CONFIG));

    function updatePanel() {
        _updatePanel(state, CONFIG, workHistory, ctx);
    }

    // ─── Daily reset ──────────────────────────────────────────────────────────

    function checkDailyReset() {
        if (!chrome.runtime?.id) return;
        const today = new Date().toDateString();
        if (state.lastWorkDate === today) return;
        state.workToday  = 0;
        state.xpToday    = 0;
        state.lastWorkDate = today;
        state.sessionStartTime = Date.now();
        setValue('sessionStartTime', state.sessionStartTime.toString());
        setValue('sessionStartDay', today);
        if (!workHistory[today]) workHistory[today] = { shifts: 0, xp: 0 };
        setValue('workToday', '0');
        setValue('xpToday', '0');
        setValue('lastWorkDate', today);
        saveWorkHistory(workHistory);
        log('🌙 Hari berganti! Counter & Sesi di-reset.', 'info');
        updatePanel();
    }

    // ─── Uncertain work reconciliation ────────────────────────────────────────

    function reconcileUncertainWork() {
        if (!chrome.runtime?.id) return;
        if (!state.workResultUncertain || !uncertainEnergyBefore) return;
        const curr = getCurrentEnergy();
        if (!curr) return;
        if (curr.current < uncertainEnergyBefore.current) {
            if (state.uncertainReconciliation !== 'energy_changed') {
                state.uncertainReconciliation = 'energy_changed';
                log(`Perubahan energi terdeteksi (${uncertainEnergyBefore.current} → ${curr.current}). Shift mungkin diproses.`, 'warn');
            }
        } else if (state.uncertainReconciliation === 'energy_changed') {
            state.uncertainReconciliation = 'pending';
        }
        updatePanel();
    }

    ctx.reconcileUncertainWork = reconcileUncertainWork;

    // ─── Scheduled sleep with Web Worker timer ────────────────────────────────

    let wakePendingWork = null;
    let pendingWorkTimer = null;
    let bgTimerWorker = null;

    try {
        const blob = new Blob([`
            let t = null;
            self.onmessage = e => {
                if (t !== null) clearTimeout(t);
                t = setTimeout(() => self.postMessage('wake'), Math.max(10, e.data));
            };
        `], { type: 'application/javascript' });
        bgTimerWorker = new Worker(URL.createObjectURL(blob));
    } catch { bgTimerWorker = null; }

    function waitForScheduledWork(delay) {
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                if (pendingWorkTimer !== null) clearTimeout(pendingWorkTimer);
                pendingWorkTimer = null;
                wakePendingWork = null;
                if (bgTimerWorker) bgTimerWorker.onmessage = null;
                resolve();
            };
            wakePendingWork = finish;
            if (bgTimerWorker) { bgTimerWorker.onmessage = finish; bgTimerWorker.postMessage(Math.max(10, delay)); }
            pendingWorkTimer = setTimeout(finish, delay);
        });
    }

    ctx.wakePendingWork = () => wakePendingWork?.();

    // ─── Route Guard: Isolated Mode on Auth Pages ──────────────────────────────
    const isAuthRoute = (path = window.location.pathname) =>
        /^\/(login|register|signup|forgot-password|reset-password)/i.test(path);

    if (isAuthRoute()) {
        console.log(`[Auto Worker] Halaman autentikasi terdeteksi (${window.location.pathname}). Isolasi aktif: DOM tidak dimodifikasi agar form login tetap utuh.`);
        setupLoginCapture(log);
        tryAutoLogin(CONFIG, log, sendNotification);

        _watchSpaNavigation(() => {
            if (!isAuthRoute()) {
                console.log(`[Auto Worker] Navigasi ke halaman game terdeteksi (${window.location.pathname}). Memuat lingkungan game...`);
                window.location.reload();
            }
        });
        return; // SELESAI UNTUK HALAMAN LOGIN! Tidak ada panel, modal, atau worker loop yang mengganggu login!
    }

    // ─── Main loop (Hanya berjalan di lingkungan game) ─────────────────────────

    state.tabLockManaged = Boolean(navigator?.locks?.request);
    state.isTabLockOwner = !state.tabLockManaged;

    _logStartup(log, CONFIG, state);

    getTokenFn();
    createPanel(state, CONFIG, ctx);
    const cachedLogs = getValue('aw_recent_logs');
    if (Array.isArray(cachedLogs)) {
        state.logs = [...cachedLogs];
    }
    createLogViewer(state, CONFIG);
    createSettingsModal(CONFIG, ctx);
    createAnalyticsDashboard(state, CONFIG, workHistory, ctx);
    startTokenWatcher(state, handleNewToken, getTokenFn);

    // Pantau navigasi SPA jika user logout di dalam game tanpa reload penuh atau pindah halaman
    _watchSpaNavigation(() => {
        if (isAuthRoute()) {
            console.log(`[Auto Worker] Logout / Navigasi ke auth page terdeteksi (${window.location.pathname}). Mengalihkan ke mode isolasi...`);
            window.location.reload();
        }
        state.userManuallyToggledPanel = false;
        const path = window.location.pathname || '';
        const isDash = path === '/dashboard' || path.startsWith('/dashboard/') || path === '/' || path === '';
        if (CONFIG.panelDashboardOnly && isDash) {
            state.panelVisible = true;
            setValue('panelVisible', 'true');
        }
        getRegionDetails(true);
        updatePanelVisibility(state, CONFIG);
    });

    // Intercept clicks on game's "KERJAKAN SATU GILIRAN" button when energy < 10
    // Prevents confusing server 400 error toasts ("Not enough energy to produce even one unit")
    document.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('button');
        if (!btn) return;
        const txt = (btn.textContent || '').trim();
        if (/KERJAKAN\s+SATU\s+GILIRAN/i.test(txt)) {
            if (state.currentEnergy != null && state.currentEnergy < 10) {
                e.preventDefault();
                e.stopPropagation();
                log(`⚡ Energi saat ini ${state.currentEnergy}/${state.maxEnergy}⚡ (butuh minimal 10⚡). Menunggu energi pulih.`, 'warn');
                showInPageNotification(`⚡ Energi belum cukup (${state.currentEnergy}/${state.maxEnergy}⚡). Butuh minimal 10⚡ untuk giliran kerja.`, 'warn');
            }
        }
    }, true);

    // Pre-seed energy from stored live status immediately while React SPA initializes (no phantom time additions)
    const cachedLive = getValue('aw_live_status');
    if (cachedLive && cachedLive.currentEnergy != null) {
        const maxE = cachedLive.maxEnergy || state.maxEnergy || 110;
        state.maxEnergy = maxE;
        state.currentEnergy = Math.min(maxE, cachedLive.currentEnergy);
        state.energySyncBase = { current: state.currentEnergy, max: maxE, updatedAt: cachedLive.updatedAt || Date.now() };
    }

    // Pre-seed energy from DOM — wait for React SPA to render the element (up to 15s)
    waitForEnergyElement(15000).then(energy => {
        if (energy) {
            state.currentEnergy = energy.current;
            state.maxEnergy     = energy.max;
            state.domEnergyStale = false;
            state.lastWorkTimestamp = 0; // Fresh page load: DOM is 100% authoritative ground truth!
            state.energySyncBase = { current: energy.current, max: energy.max, updatedAt: Date.now() };

            const healthBuff = getRegionHealthBonus();
            state.regenRate = healthBuff;
            if (healthBuff > 1.0) {
                const bonusPct = Math.round((healthBuff - 1.0) * 100);
                log(`🏥 Buff Kota: Kesehatan +${bonusPct}% pemulihan energi pasif (${healthBuff}x)`, 'info');
            }

            log(`⚡ Energi terbaca: ${energy.current}/${energy.max}`, 'info');
            saveLiveStatus(state, CONFIG);
            updatePanel();
        } else {
            log('⚠️ Elemen energi tidak ditemukan dalam 15 detik. Energi akan terbaca saat panel pertama update.', 'warn');
        }
    });

    setInterval(() => { if (state.running) _checkAndRefreshToken(state, CONFIG, log, ctx); }, Math.min(CONFIG.tokenRefreshInterval, 60000));
    setInterval(checkDailyReset, 60000);
    setInterval(updatePanel, 1000);
    setInterval(reconcileUncertainWork, 10000);

    // ── Chrome Extension Runtime Message Listener (Popup & Background) ────
    try {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg?.type === 'POPUP_COMMAND') {
                if (msg.action === 'toggleRunning') {
                    const newRunning = msg.value != null ? Boolean(msg.value) : !state.running;
                    state.running = newRunning;
                    setRunningUI(newRunning);
                    updatePanel();
                    saveLiveStatus(state, CONFIG, true);
                    log(`Auto Worker ${newRunning ? 'dilanjutkan' : 'dijeda'} via Popup toolbar.`, 'info');
                    if (newRunning) wakePendingWork?.();
                    sendResponse({ ok: true, running: state.running });
                    return true;
                }
                if (msg.action === 'workNow') {
                    log('⚡ Manual work dipicu via Popup toolbar!', 'info');
                    if (state.tokenExpired || state.pausedForToken || !state.currentToken) {
                        sendResponse({ ok: false, error: 'token_expired' });
                        return true;
                    }
                    doWork(ctx, true).then(result => {
                        saveLiveStatus(state, CONFIG, true);
                        updatePanel();
                        if (result === 'worked') {
                            sendResponse({ ok: true, isLockOwner: state.isTabLockOwner, result });
                        } else if (result === 'paused' && (state.pausedForToken || state.tokenExpired)) {
                            sendResponse({ ok: false, error: 'token_expired' });
                        } else if (result === 'waiting' && state.currentEnergy < 10) {
                            sendResponse({ ok: false, error: 'insufficient_energy' });
                        } else {
                            sendResponse({ ok: false, error: result || 'work_failed' });
                        }
                    }).catch(err => {
                        sendResponse({ ok: false, error: err.message });
                    });
                    return true;
                }
                if (msg.action === 'getStatus') {
                    const synced = getSyncedEnergy(state);
                    if (synced) {
                        state.currentEnergy = synced.current;
                        state.maxEnergy     = synced.max;
                    }
                    sendResponse({ ok: true, status: saveLiveStatus(state, CONFIG, true) });
                    return true;
                }
                if (msg.action === 'getLogs') {
                    sendResponse({ ok: true, logs: state.logs || [] });
                    return true;
                }
                if (msg.action === 'clearLogs') {
                    state.logs = [];
                    clearStoredLogs();
                    updateLogViewer(state, CONFIG);
                    sendResponse({ ok: true });
                    return true;
                }
            }
            if (msg?.type === 'STORAGE_SYNC' && msg.action === 'backgroundWorkDone') {
                if (msg.energy != null) {
                    state.currentEnergy = msg.energy;
                    state.postShiftEnergy = msg.energy;
                    state.lastWorkTimestamp = Date.now();
                    state.domEnergyStale = true;
                    state.energySyncBase = {
                        current: msg.energy,
                        max: msg.maxEnergy || state.maxEnergy || 110,
                        updatedAt: Date.now()
                    };
                }
                if (msg.status) {
                    if (msg.status.workToday != null) state.workToday = msg.status.workToday;
                    if (msg.status.xpToday != null) state.xpToday = msg.status.xpToday;
                    if (msg.status.totalWorked != null) state.totalWorked = msg.status.totalWorked;
                    if (msg.status.totalWorkXP != null) state.totalWorkXP = msg.status.totalWorkXP;
                    if (msg.status.lastWorkTime) state.lastWorkTime = msg.status.lastWorkTime;
                    if (msg.status.nextWorkTimestamp != null) state.nextWorkTimestamp = msg.status.nextWorkTimestamp;
                }
                state.workInFlight = false;
                state.workResultUncertain = false;
                state.energyFullAlertActive = false;
                updatePanel();
                sendResponse({ ok: true });
                return true;
            }
            if (msg?.type === 'EXECUTE_WORK_NOW') {
                (async () => {
                    try {
                        if (!state.running && !msg.manual) {
                            sendResponse({ ok: false, result: 'paused' });
                            return;
                        }
                        if (state.workInFlight) {
                            if (Date.now() - (state.workInFlightAt || 0) > 15000) {
                                state.workInFlight = false;
                            } else {
                                sendResponse({ ok: false, result: 'busy' });
                                return;
                            }
                        }
                        if (state.tokenExpired || state.pausedForToken || !state.currentToken) {
                            sendResponse({ ok: false, result: 'token_expired' });
                            return;
                        }
                        if (state.tabLockManaged && !state.isTabLockOwner) {
                            sendResponse({ ok: false, result: 'standby' });
                            return;
                        }

                        const synced = getSyncedEnergy(state);
                        if (synced) {
                            state.currentEnergy = synced.current;
                            state.maxEnergy = synced.max;
                        }

                        if (!msg.manual && state.currentEnergy < CONFIG.energyThreshold) {
                            sendResponse({ ok: true, result: 'waiting', energy: state.currentEnergy });
                            return;
                        }

                        log('⚡ Trigger background: Menjalankan shift kerja otomatis...', 'info');
                        const result = await doWork(ctx, Boolean(msg.manual));
                        saveLiveStatus(state, CONFIG, true);
                        updatePanel();
                        sendResponse({
                            ok: result === 'worked',
                            result,
                            energy: state.currentEnergy,
                            isLockOwner: Boolean(state.isTabLockOwner)
                        });
                    } catch (err) {
                        sendResponse({ ok: false, error: err?.message || String(err) });
                    }
                })();
                return true;
            }
            if (msg?.type === 'WAKE_WORKER') {
                (async () => {
                    try {
                        // Always sync latest state from storage first (in case background worked while tab slept)
                        const latestLive = getValue('aw_live_status');
                        if (latestLive) {
                            if (latestLive.lastWorkTimestamp && latestLive.lastWorkTimestamp > (state.lastWorkTimestamp || 0)) {
                                state.lastWorkTimestamp = latestLive.lastWorkTimestamp;
                                state.currentEnergy = latestLive.currentEnergy;
                                state.postShiftEnergy = latestLive.currentEnergy;
                                state.domEnergyStale = true;
                                state.energySyncBase = {
                                    current: latestLive.currentEnergy,
                                    max: latestLive.maxEnergy || state.maxEnergy || 115,
                                    updatedAt: latestLive.updatedAt || latestLive.lastWorkTimestamp
                                };
                            }
                            if (latestLive.nextWorkTimestamp) state.nextWorkTimestamp = latestLive.nextWorkTimestamp;
                            if (latestLive.workToday != null) state.workToday = latestLive.workToday;
                            if (latestLive.xpToday != null) state.xpToday = latestLive.xpToday;
                            if (latestLive.totalWorked != null) state.totalWorked = latestLive.totalWorked;
                            if (latestLive.totalWorkXP != null) state.totalWorkXP = latestLive.totalWorkXP;
                        }

                        if (state.running) {
                            const energy = getSyncedEnergy(state);
                            if (energy) {
                                state.currentEnergy = energy.current;
                                state.maxEnergy = energy.max;
                            }
                            const isCooldownActive = state.nextWorkTimestamp && (Date.now() < state.nextWorkTimestamp - 5000);
                            const hasRecentWork = state.lastWorkTimestamp && (Date.now() - state.lastWorkTimestamp < 45000);
                            if (state.isTabLockOwner && state.currentEnergy >= CONFIG.energyThreshold && !isCooldownActive && !hasRecentWork && !state.workInFlight && !state.workResultUncertain) {
                                log('⚡ Background wake: Energi target tercapai, mengeksekusi shift kerja...', 'info');
                                const result = await doWork({ ...ctx }, false);
                                saveLiveStatus(state, CONFIG);
                                updatePanel();
                                sendResponse({
                                    handled: true,
                                    isLockOwner: true,
                                    energy: state.currentEnergy,
                                    worked: result === 'worked',
                                    result
                                });
                                return;
                            }
                        }
                        updatePanel();
                        saveLiveStatus(state, CONFIG);
                        sendResponse({
                            handled: true,
                            isLockOwner: Boolean(state.isTabLockOwner),
                            energy: state.currentEnergy,
                            worked: false
                        });
                    } catch (err) {
                        sendResponse({ handled: false, error: err?.message });
                    }
                })();
                return true;
            }
        });
    } catch { /* ignore if chrome.runtime is unavailable */ }

    onStorageChanged((key, newValue) => {
        if (key === 'aw_live_status' && newValue) {
            const isBackgroundShift = Boolean(
                newValue.lastWorkTime &&
                newValue.lastWorkTime !== state.lastWorkTime &&
                (newValue.totalWorked || 0) > (state.totalWorked || 0)
            );

            if (!state.isTabLockOwner || isBackgroundShift) {
                if (newValue.workToday != null) state.workToday = newValue.workToday;
                if (newValue.xpToday != null) state.xpToday = newValue.xpToday;
                if (newValue.totalWorked != null) state.totalWorked = newValue.totalWorked;
                if (newValue.totalWorkXP != null) state.totalWorkXP = newValue.totalWorkXP;
                if (newValue.lastWorkTime) state.lastWorkTime = newValue.lastWorkTime;
                if (newValue.nextWorkTimestamp != null) state.nextWorkTimestamp = newValue.nextWorkTimestamp;
                if (isBackgroundShift && newValue.currentEnergy != null) {
                    state.currentEnergy = newValue.currentEnergy;
                    state.lastWorkTimestamp = newValue.updatedAt || Date.now();
                    state.domEnergyStale = true;
                    state.energySyncBase = {
                        current: newValue.currentEnergy,
                        max: newValue.maxEnergy || state.maxEnergy || 110,
                        updatedAt: newValue.updatedAt || Date.now()
                    };
                }
                if (newValue.maxEnergy != null) state.maxEnergy = newValue.maxEnergy;
            }
            updatePanel();
        }
        if (key === 'aw_config' && newValue) {
            try {
                Object.assign(CONFIG, typeof newValue === 'string' ? JSON.parse(newValue) : newValue);
                updatePanel();
            } catch { /* ignore */ }
        }
        if (key === 'aw_recent_logs') {
            state.logs = Array.isArray(newValue) ? [...newValue] : [];
            updateLogViewer(state, CONFIG);
        }
    });

    document.addEventListener('visibilitychange', _handleForegroundReturn);
    window.addEventListener('focus', _handleForegroundReturn);

    function _handleForegroundReturn() {
        if (!chrome.runtime?.id) return;
        if (document.visibilityState === 'hidden') return;
        state.lastForegroundReturnTime = Date.now();
        updatePanelVisibility(state, CONFIG);
        patchPageVisualEnergy(state.currentEnergy, state.maxEnergy, true);
        saveLiveStatus(state, CONFIG);

        chrome.storage.local.get(['aw_live_status'], data => {
            const live = data?.aw_live_status;
            if (live) {
                const isNewerShift = Boolean(
                    live.lastWorkTime &&
                    live.lastWorkTime !== state.lastWorkTime &&
                    (live.totalWorked || 0) > (state.totalWorked || 0)
                );
                if (isNewerShift) {
                    if (live.currentEnergy != null) {
                        state.currentEnergy = live.currentEnergy;
                        state.lastWorkTimestamp = live.updatedAt || Date.now();
                        state.domEnergyStale = true;
                        state.energySyncBase = {
                            current: live.currentEnergy,
                            max: live.maxEnergy || state.maxEnergy || 110,
                            updatedAt: live.updatedAt || Date.now()
                        };
                    }
                    if (live.workToday != null) state.workToday = live.workToday;
                    if (live.xpToday != null) state.xpToday = live.xpToday;
                    if (live.totalWorked != null) state.totalWorked = live.totalWorked;
                    if (live.totalWorkXP != null) state.totalWorkXP = live.totalWorkXP;
                    if (live.lastWorkTime) state.lastWorkTime = live.lastWorkTime;
                    if (live.nextWorkTimestamp != null) state.nextWorkTimestamp = live.nextWorkTimestamp;
                }
            }

            reloadStateFromStorage(state, () => { workHistory = loadWorkHistory(state, CONFIG); });

            const synced = getSyncedEnergy(state);
            if (synced) {
                state.currentEnergy = synced.current;
                state.maxEnergy = synced.max;
                if (state.domEnergyStale) {
                    patchPageVisualEnergy(synced.current, synced.max, true);
                }
            }

            updatePanel();
            updatePanelVisibility(state, CONFIG);
            if (state.running && state.isTabLockOwner && state.currentEnergy >= CONFIG.energyThreshold) {
                wakePendingWork?.();
            }
        });
    }

    async function runWorkerLoop() {
        let errCount = 0;
        while (true) {
            try {
                if (!chrome.runtime?.id) {
                    console.warn('[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih. Silakan refresh tab game (F5).');
                    return;
                }
                checkDailyReset();
                if (state.running) {
                    const result = await doWork(ctx);
                    if (result === 'retrySoon') {
                        await waitForScheduledWork(5000);
                    } else if (result === 'retry') {
                        errCount++;
                        const backoff = Math.min(300000, 10000 * Math.pow(2, errCount - 1));
                        log(`⏳ Retry dalam ${(backoff / 1000).toFixed(0)}s (percobaan ke-${errCount})...`, 'warn');
                        await waitForScheduledWork(backoff);
                    } else if (result === 'waiting' || result === 'worked') {
                        errCount = 0;
                        const delay = Math.max(1000, state.nextWorkTimestamp - Date.now());
                        await waitForScheduledWork(delay);
                    } else {
                        await waitForScheduledWork(10000);
                    }
                } else {
                    await waitForScheduledWork(10000);
                }
            } catch (error) {
                if (error?.message?.includes('Extension context invalidated') || !chrome.runtime?.id) {
                    console.warn('[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih.');
                    return;
                }
                console.error('[MainLoop]', error);
                log(`Main loop error: ${error.message}`, 'error');
                errCount++;
                const backoff = Math.min(300000, 10000 * Math.pow(2, errCount - 1));
                await waitForScheduledWork(backoff);
            }
        }
    }

    if (!state.tabLockManaged) {
        log('Web Locks tidak tersedia; perlindungan multi-tab tidak aktif.', 'warn');
        await runWorkerLoop();
        return;
    }

    _setTabLockOwner(state, false, ctx);
    while (true) {
        let acquired = false;
        try {
            await navigator.locks.request('parlamentum-auto-worker', { ifAvailable: true }, async lock => {
                if (!lock) return;
                acquired = true;
                reloadStateFromStorage(state, () => { workHistory = loadWorkHistory(state, CONFIG); });
                if (getValue('aw_workResultUncertain', 'false') === 'true') {
                    state.workResultUncertain = true;
                    state.running = false;
                    updatePanel();
                }
                _setTabLockOwner(state, true, ctx);
                state.waitedForTabLock = false;
                await runWorkerLoop();
            });
        } catch (error) {
            log(`Web Locks gagal: ${error.message}. Worker dijeda.`, 'error');
            state.running = false;
            _setTabLockOwner(state, false, ctx);
            return;
        }
        if (!acquired) {
            state.waitedForTabLock = true;
            _setTabLockOwner(state, false, ctx);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
})();

// ─── Private utilities ────────────────────────────────────────────────────────

function _runMigrations(state, CONFIG, workHistory) {
    const version = getStoredInteger('aw_energySchemaVersion', 1, 1, 2);
    if (version >= 2) return;

    if (state.totalWorkXP < state.totalWorked * 3 && state.totalWorked > 0) {
        state.totalWorkXP = state.totalWorked * 10 / 10 * 4; // rough estimate
        setValue('totalWorkXP', state.totalWorkXP.toString());
    }
    if (state.totalEnergySpent < state.totalWorked * 5 && state.totalWorked > 0) {
        state.totalEnergySpent = state.totalWorked * 10;
        setValue('totalEnergySpent', state.totalEnergySpent.toString());
        console.log('[Init] 🔧 Estimasi energi masa lalu diterapkan (migrasi sekali jalan).');
    }
    setValue('aw_energySchemaVersion', '2');
}

function _checkAndRefreshToken(state, CONFIG, log, ctx = null) {
    if (!chrome.runtime?.id) return;
    if (!state.currentToken) return;
    if (!state.tokenExpiry) return;
    const remaining = state.tokenExpiry - Date.now();
    if (remaining <= 0) {
        if (!state.pausedForToken) {
            log('🔄 Token sesi kedaluwarsa. Me-reload tab otomatis untuk memperbarui token via session cookie...', 'warn');
            state.pausedForToken = true;
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        }
        return;
    }
    if (remaining < CONFIG.tokenExpiryThreshold) {
        log(`Token akan expired dalam ${Math.round(remaining / 1000)} detik!`, 'warn');
        log('Token tidak auto-refresh. Login ulang jika expired.', 'warn');
    }
}

function _setTabLockOwner(state, isOwner, ctx) {
    state.isTabLockOwner = isOwner;
    if (ctx?.CONFIG) {
        updatePanelVisibility(state, ctx.CONFIG);
    }
    // Notify UI modules of ownership change
    ctx.updatePanel?.();
}

function _logStartup(log, CONFIG, state) {
    const uptime = Math.floor((Date.now() - state.scriptStartTime) / 1000);
    log('🚀 Auto Worker v5.11.0 HARDENED (Network Interceptor) aktif!', 'success');
    log(`⚡ Energy Threshold: ${CONFIG.energyThreshold} (ubah di Settings)`, 'info');
    log(`🗓️ History: simpan ${CONFIG.historyMaxDays} hari terakhir`, 'info');
    log(`🔇 Quiet mode: ${CONFIG.quietModeEnabled ? 'ON' : 'OFF'}`, 'info');
    log(`⌨️ Shortcuts: ${Object.values(CONFIG.shortcuts).map(s => s.display).join(', ')}`, 'info');
    log(`⏱️ Script uptime: ${uptime}s`, 'info');
}

function _watchSpaNavigation(onRouteChanged) {
    let lastPath = window.location.pathname;
    const check = () => {
        if (window.location.pathname !== lastPath) {
            lastPath = window.location.pathname;
            onRouteChanged?.();
        }
    };
    try {
        const origPushState = history.pushState;
        history.pushState = function(...args) {
            origPushState.apply(this, args);
            check();
        };
        const origReplaceState = history.replaceState;
        history.replaceState = function(...args) {
            origReplaceState.apply(this, args);
            check();
        };
    } catch { /* ignore */ }
    window.addEventListener('popstate', check);
    setInterval(check, 1000);
}
