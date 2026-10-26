/**
 * main.js — Entry point for the Chrome Extension content script
 *
 * Wires together all modules and runs the main worker loop.
 * Vite bundles this + all imports into dist/content.js.
 */

import { initStorage, getValue, setValue, onStorageChanged, isExtensionContextValid } from './storage.js';
import { loadConfig, saveConfig, normalizeConfig }           from './config.js';
import { createInitialState, saveState, saveLiveStatus, reloadStateFromStorage, getStoredInteger } from './state.js';
import { loadWorkHistory, saveWorkHistory }                   from './history.js';
import { log as _log, setLogUpdateCallback, clearStoredLogs }                  from './logger.js';
import { parseJwt, handleNewToken as _handleNewToken, getTokenFromStorage as _getTokenFromStorage,
         getTimeUntilExpiry, startTokenWatcher }              from './token.js';
import { getSyncedEnergy, getCurrentEnergy, waitForEnergyElement, getPlayerLevel, getMaxEnergyForLevel,
         getLiveCountdown, getTimeToFullEnergy, getNextWorkDelay, patchPageVisualEnergy, getRegionHealthBonus, getRegionDetails, invalidateRegionCache, isDashboardPage, getEffectiveEnergyThreshold, isEnergyFlushActive, calculateProjectedEnergy, readBreadQuotaFromDom } from './energy.js';
import { sendNotification, playNotificationSound, playEnergyFullAlarm, showInPageNotification } from './notifications.js';
import { doWork }                                             from './work.js';
import { createPanel, updatePanel as _updatePanel, setRunningUI, updatePanelVisibility } from './ui/panel.js';
import { createSettingsModal, openSettings }                  from './ui/settings.js';
import { createLogViewer, openLogViewer, updateLogViewer }    from './ui/logviewer.js';
import { setupLoginCapture, tryAutoLogin, getSavedCredentials } from './autologin.js';
import { initInterceptorClient }                              from './interceptor-client.js';
import { getTabChannel, broadcastTabMessage }                 from './broadcast.js';
import { autoConfirmTrainingModal, executeAutoTrain, getTrainingConfirmStartButton, handleTrainSuccess, handleTrainRejected, readTrainingStatsFromDom } from './training.js';

/**
 * Creates an interval that automatically halts and cleans itself up
 * whenever the browser extension context is invalidated or reloaded.
 */
function safeSetInterval(fn, delay) {
    const timer = setInterval(() => {
        if (!isExtensionContextValid()) {
            clearInterval(timer);
            return;
        }
        try {
            fn();
        } catch (err) {
            if (err?.message?.includes('Extension context invalidated')) {
                clearInterval(timer);
            } else {
                console.error('[Interval Error]', err);
            }
        }
    }, delay);
    return timer;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

(async function bootstrap() {
    'use strict';

    // ─── Route Guard: Isolated Mode on Auth & Registration Pages ──────────────
    const isAuthRoute = (path = window.location.pathname) =>
        /^\/(login|register|signup|forgot-password|reset-password)/i.test(path);

    if (isAuthRoute()) {
        console.log(`[Auto Worker] Halaman autentikasi terdeteksi (${window.location.pathname}). Mode passthrough aktif.`);

        // Non-invasive SPA navigation observer without touching DOM or form elements
        let lastPath = window.location.pathname;
        const check = () => {
            if (window.location.pathname !== lastPath) {
                lastPath = window.location.pathname;
                if (!isAuthRoute(lastPath)) {
                    console.log(`[Auto Worker] Navigasi ke halaman game terdeteksi (${lastPath}). Memuat lingkungan game...`);
                    window.location.reload();
                }
            }
        };
        window.addEventListener('popstate', check);
        setInterval(check, 500);
        return; // SELESAI! Jangan sentuh DOM, jangan jalankan worker, form registrasi/login tetap 100% utuh!
    }

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

    // ─── Real-Time Cross-Tab Coordination (BroadcastChannel Singleton) ───────
    const tabChannel = getTabChannel();

    function safePostTabMessage(msg) {
        broadcastTabMessage(msg);
    }

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
        openLogViewer:     ()            => openLogViewer(state, CONFIG),
        saveConfig:        (cfg)         => saveConfig(cfg),
        saveLiveStatus:    (force = false) => saveLiveStatus(state, CONFIG, force),
        getCurrentEnergy:  ()            => getCurrentEnergy(),
        reloadStateFromStorage: ()       => reloadStateFromStorage(state, () => { workHistory = loadWorkHistory(state, CONFIG); }),
        patchPageVisualEnergy:  (cur, max, force) => patchPageVisualEnergy(cur, max, force),
        executeAutoTrain:   ()           => executeAutoTrain(ctx),
        autoConfirmTrainingModal: ()     => autoConfirmTrainingModal(ctx),
        handleTrainSuccess: (msg)        => handleTrainSuccess(msg, state, CONFIG, ctx),
        handleTrainRejected: (msg)       => handleTrainRejected(msg, state, CONFIG, ctx),
        readBreadQuotaFromDom: ()        => readBreadQuotaFromDom(state, CONFIG, log),
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
        const currentUtcDay = new Date().toISOString().slice(0, 10);
        const today = new Date().toDateString();

        // 1. Food quota strictly follows 00:00 UTC game server reset
        const lastFoodUtc = getValue('aw_foodUtcDate', '');
        if (lastFoodUtc && lastFoodUtc !== currentUtcDay) {
            state.foodEatenToday = 0;
            setValue('aw_foodEatenToday', '0');
            setValue('aw_foodUtcDate', currentUtcDay);
            safePostTabMessage({
                type: 'FOOD_UPDATED',
                foodEatenToday: 0,
                timestamp: Date.now()
            });
            log('Reset server 00:00 UTC tercapai. Kuota makanan harian di-reset ke 0.', 'info');
        } else if (!lastFoodUtc) {
            setValue('aw_foodUtcDate', currentUtcDay);
        }

        // 2. Work shifts and XP daily counters
        if (state.lastWorkDate === today && lastFoodUtc === currentUtcDay) return;
        if (state.lastWorkDate !== today) {
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
            log('Hari berganti. Counter shift harian & sesi di-reset.', 'info');
        }
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
            // Cap single timer sleep to 15s so background tab throttling doesn't freeze the loop for hours
            const cappedDelay = Math.min(delay, 15000);
            if (bgTimerWorker) { bgTimerWorker.onmessage = finish; bgTimerWorker.postMessage(Math.max(10, cappedDelay)); }
            pendingWorkTimer = setTimeout(finish, cappedDelay);
        });
    }

    ctx.wakePendingWork = () => wakePendingWork?.();

    // ─── Main loop (Hanya berjalan di lingkungan game) ─────────────────────────

    state.tabLockManaged = Boolean(navigator?.locks?.request);
    state.isTabLockOwner = !state.tabLockManaged;

    if (!isDashboardPage()) {
        try {
            if (isExtensionContextValid()) {
                chrome.storage?.local?.get?.(['aw_has_dashboard_tab'], d => {
                    if (typeof d?.aw_has_dashboard_tab === 'boolean') {
                        state.hasActiveDashboardTab = d.aw_has_dashboard_tab;
                    }
                });
            }
        } catch { /* context invalidated */ }
    }

    _logStartup(log, CONFIG, state);

    // Pre-seed energy from stored live status & mathematical projection immediately before UI creation
    const cachedLive = getValue('aw_live_status');
    if (cachedLive && typeof cachedLive === 'object') {
        const maxE = cachedLive.maxEnergy || state.maxEnergy || 110;
        state.maxEnergy = maxE;
        if (cachedLive.regenRate != null) state.regenRate = cachedLive.regenRate;
        if (cachedLive.regionHealthBonusPercent != null) state.regionHealthBonusPercent = cachedLive.regionHealthBonusPercent;
        if (cachedLive.regionName) state.regionName = cachedLive.regionName;
        if (cachedLive.lastWorkTimestamp) state.lastWorkTimestamp = cachedLive.lastWorkTimestamp;

        if (cachedLive.energySyncBase && typeof cachedLive.energySyncBase.current === 'number') {
            state.energySyncBase = { ...cachedLive.energySyncBase };
            const projected = calculateProjectedEnergy(state.energySyncBase, Date.now());
            if (typeof projected === 'number' && projected > 0) {
                state.currentEnergy = Math.min(maxE, projected);
            } else if (typeof cachedLive.currentEnergy === 'number' && cachedLive.currentEnergy > 0) {
                state.currentEnergy = Math.min(maxE, cachedLive.currentEnergy);
            }
        } else if (typeof cachedLive.currentEnergy === 'number' && cachedLive.currentEnergy > 0) {
            state.currentEnergy = Math.min(maxE, cachedLive.currentEnergy);
            state.energySyncBase = {
                current: state.currentEnergy,
                max: maxE,
                updatedAt: cachedLive.updatedAt || Date.now(),
                regenRate: state.regenRate || 1.0
            };
        }
    }

    // Immediate synchronous DOM check: if page DOM is already rendered, read it instantly before panel creation!
    const immediateEnergy = getCurrentEnergy();
    if (immediateEnergy) {
        if (immediateEnergy.current > 0 || state.currentEnergy <= 0 || state.postShiftEnergy === 0) {
            state.hasInitialDomEnergyRead = true;
            state.currentEnergy = immediateEnergy.current;
            state.maxEnergy     = immediateEnergy.max;
            state.domEnergyStale = false;
            state.energySyncBase = { current: immediateEnergy.current, max: immediateEnergy.max, updatedAt: Date.now() };
        }
    }

    getTokenFn();
    createPanel(state, CONFIG, ctx);
    setRunningUI(state.running);
    if (!state.running) {
        log('Auto Worker dalam kondisi DIJEDA (status disimpan dari sesi sebelumnya).', 'warn', false);
    }
    const cachedLogs = getValue('aw_recent_logs');
    if (Array.isArray(cachedLogs)) {
        state.logs = cachedLogs.filter(l =>
            l && typeof l.message === 'string' &&
            !/^Panel v[\d.]+\s+siap!/i.test(l.message) &&
            !/^Auto Worker v[\d.]+/i.test(l.message)
        );
    }
    createLogViewer(state, CONFIG);
    createSettingsModal(CONFIG, ctx);
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
        if (isDash) {
            waitForEnergyElement(5000).then(energy => {
                if (energy) {
                    if (energy.current > 0 || state.currentEnergy <= 0 || state.postShiftEnergy === 0) {
                        state.currentEnergy = energy.current;
                        state.maxEnergy     = energy.max;
                        state.domEnergyStale = false;
                        state.energySyncBase = { current: energy.current, max: energy.max, updatedAt: Date.now() };
                        saveLiveStatus(state, CONFIG);
                        updatePanel();
                    }
                }
            });
        }
        getRegionDetails(true);
        updatePanelVisibility(state, CONFIG);
    });

    // Asynchronous DOM observer for React SPA hydration on Dashboard — wait for element if not yet rendered

    // Pre-seed energy from DOM on Dashboard — wait for React SPA to render the element (up to 15s)
    if (isDashboardPage()) {
        waitForEnergyElement(15000).then(energy => {
            if (energy) {
                if (energy.current > 0 || state.currentEnergy <= 0 || state.postShiftEnergy === 0) {
                    state.hasInitialDomEnergyRead = true;
                    state.currentEnergy = energy.current;
                    state.maxEnergy     = energy.max;
                    state.domEnergyStale = false;
                    state.energySyncBase = { current: energy.current, max: energy.max, updatedAt: Date.now() };

                    const regDetails = getRegionDetails(true);
                    const healthBuff = regDetails.bonusMultiplier || 1.0;
                    state.regenRate = healthBuff;
                    state.regionHealthBonusPercent = regDetails.bonusPercent || 0;
                    if (state.regionHealthBonusPercent > 0 || healthBuff > 1.0) {
                        const bonusPct = state.regionHealthBonusPercent || Math.round((healthBuff - 1.0) * 100);
                        log(`Buff Kota: Kesehatan +${bonusPct}% pemulihan energi pasif (${healthBuff}x / mnt)`, 'info', false);
                    }

                    log(`Energi terbaca: ${state.currentEnergy}/${state.maxEnergy}`, 'info', false);
                    saveLiveStatus(state, CONFIG, true);
                    updatePanel();
                }
            } else {
                state.hasInitialDomEnergyRead = true;
                log('Elemen energi tidak ditemukan dalam 15 detik. Energi akan terbaca saat panel update.', 'warn');
            }
        });
    } else {
        // Non-dashboard page: derive current energy from synchronized base time immediately
        state.hasInitialDomEnergyRead = true;
        const synced = getSyncedEnergy(state);
        if (synced) {
            state.currentEnergy = synced.current;
            state.maxEnergy = synced.max;
        }
        updatePanel();
    }

    safeSetInterval(() => { if (state.running) _checkAndRefreshToken(state, CONFIG, log, ctx); }, Math.min(CONFIG.tokenRefreshInterval, 60000));
    safeSetInterval(checkDailyReset, 60000);
    safeSetInterval(() => {
        if (isDashboardPage()) {
            readBreadQuotaFromDom(state, CONFIG, log);
        }
        updatePanel();
        if (CONFIG.autoTrainEnabled) {
            autoConfirmTrainingModal(ctx);
        }
    }, 1000);
    safeSetInterval(reconcileUncertainWork, 10000);
    safeSetInterval(() => {
        if (CONFIG.autoTrainEnabled) {
            autoConfirmTrainingModal(ctx);
            executeAutoTrain(ctx);
        }
    }, 3500);
    setupDomToastObserver();
    setupTrainingModalObserver();
    if (isDashboardPage()) {
        readBreadQuotaFromDom(state, CONFIG, log);
    }
    if (CONFIG.autoTrainEnabled) {
        autoConfirmTrainingModal(ctx);
    }

    // ─── Real-Time Cross-Tab Coordination Setup ──────────────────────────────
    const isCurrentTabDashboard = isDashboardPage();

    if (tabChannel) {
        if (isCurrentTabDashboard) {
            // Dashboard tab claims master leadership across all open tabs
            safePostTabMessage({
                type: 'CLAIM_LEADERSHIP_FOR_DASHBOARD',
                timestamp: Date.now()
            });
        }

        tabChannel.onmessage = (event) => {
            const msg = event?.data;
            if (!msg || typeof msg !== 'object') return;

            // Training update across tabs
            if (msg.type === 'TRAIN_UPDATED') {
                if (msg.activeTraining !== undefined) state.activeTraining = msg.activeTraining;
                if (msg.walletGold != null) state.walletGold = msg.walletGold;
                updatePanel();
            }

            // 0. Work shift completed in one tab -> immediately sync all tabs
            if (msg.type === 'WORK_SHIFT_COMPLETED') {
                if (!isDashboardPage() || !state.isTabLockOwner) {
                    state.domEnergyStale = true;
                    if (msg.currentEnergy != null) {
                        state.currentEnergy = msg.currentEnergy;
                        state.postShiftEnergy = msg.currentEnergy;
                        state.maxEnergy = msg.maxEnergy || state.maxEnergy;
                        state.energySyncBase = msg.energySyncBase ? { ...msg.energySyncBase } : {
                            current: msg.currentEnergy,
                            max: state.maxEnergy,
                            updatedAt: msg.timestamp || Date.now(),
                            regenRate: state.regenRate || 1.0
                        };
                    }
                    if (msg.workToday != null) state.workToday = msg.workToday;
                    if (msg.xpToday != null) state.xpToday = msg.xpToday;
                    if (msg.totalWorked != null) state.totalWorked = msg.totalWorked;
                    if (msg.totalWorkXP != null) state.totalWorkXP = msg.totalWorkXP;
                    if (msg.lastWorkTime) state.lastWorkTime = msg.lastWorkTime;
                    if (msg.lastWorkTimestamp != null) state.lastWorkTimestamp = msg.lastWorkTimestamp;
                    if (msg.nextWorkTimestamp != null) state.nextWorkTimestamp = msg.nextWorkTimestamp;
                    if (msg.serverCooldownUntil != null) state.serverCooldownUntil = msg.serverCooldownUntil;
                    updatePanel();
                }
            }

            // 1. Dashboard heartbeat received by non-dashboard tabs (e.g. /pasar, /map)
            if (msg.type === 'DASHBOARD_HEARTBEAT') {
                state.hasActiveDashboardTab = true;
                state.lastDashboardHeartbeat = Date.now();

                // Non-dashboard tab holding the lock must yield immediately to dashboard!
                if (!isDashboardPage() && state.isTabLockOwner) {
                    state.shouldYieldLock = true;
                    wakePendingWork?.();
                }

                // Non-dashboard tabs synchronize ground-truth state instantly with zero lag
                if (!isDashboardPage()) {
                    if (msg.currentEnergy != null) {
                        state.currentEnergy = msg.currentEnergy;
                        state.maxEnergy = msg.maxEnergy || state.maxEnergy;
                        state.energySyncBase = msg.energySyncBase ? { ...msg.energySyncBase } : {
                            current: msg.currentEnergy,
                            max: state.maxEnergy,
                            updatedAt: msg.timestamp || Date.now(),
                            regenRate: msg.regenRate || state.regenRate || 1.0
                        };
                    }
                    if (msg.regenRate != null) state.regenRate = msg.regenRate;
                    if (msg.workToday != null) state.workToday = msg.workToday;
                    if (msg.xpToday != null) state.xpToday = msg.xpToday;
                    if (msg.totalWorked != null) state.totalWorked = msg.totalWorked;
                    if (msg.totalWorkXP != null) state.totalWorkXP = msg.totalWorkXP;
                    if (msg.lastWorkTime) state.lastWorkTime = msg.lastWorkTime;
                    if (msg.nextWorkTimestamp != null) state.nextWorkTimestamp = msg.nextWorkTimestamp;
                    if (msg.foodEatenToday != null && msg.foodEatenToday !== state.foodEatenToday) {
                        state.foodEatenToday = msg.foodEatenToday;
                        setValue('aw_foodEatenToday', state.foodEatenToday.toString());
                    }
                    if (msg.maxFoodDaily != null && msg.maxFoodDaily !== CONFIG.maxFoodDaily) {
                        CONFIG.maxFoodDaily = msg.maxFoodDaily;
                    }
                    if (msg.trainingStats) state.trainingStats = { ...msg.trainingStats };
                    if (msg.activeTraining !== undefined) state.activeTraining = msg.activeTraining;
                    if (msg.walletGold != null) state.walletGold = msg.walletGold;

                    updatePanel();
                }
            }

            // 1.5. Real-time instant food sync across all tabs
            if (msg.type === 'FOOD_UPDATED' && typeof msg.foodEatenToday === 'number') {
                if (state.foodEatenToday !== msg.foodEatenToday) {
                    state.foodEatenToday = msg.foodEatenToday;
                    setValue('aw_foodEatenToday', state.foodEatenToday.toString());
                    saveLiveStatus(state, CONFIG, true);
                    updatePanel();
                }
            }

            // 1.6. Real-time instant toggle pause/resume across all open tabs
            if (msg.type === 'TOGGLE_RUNNING' && typeof msg.running === 'boolean') {
                if (state.running !== msg.running) {
                    state.running = msg.running;
                    setValue('aw_worker_running', msg.running.toString());
                    setRunningUI(state.running);
                    updatePanel();
                    if (state.running) wakePendingWork?.();
                }
            }

            // 2. Dashboard claims leadership -> non-dashboard tabs holding the lock must yield!
            if (msg.type === 'CLAIM_LEADERSHIP_FOR_DASHBOARD') {
                state.hasActiveDashboardTab = true;
                state.lastDashboardHeartbeat = Date.now();

                if (!isDashboardPage() && state.isTabLockOwner) {
                    console.log('[Auto Worker] Tab Dashboard terdeteksi. Mengalihkan worker lock ke tab Dashboard.');
                    state.shouldYieldLock = true;
                    wakePendingWork?.();
                }
            }

            // 3. Dashboard tab closed -> non-dashboard tabs can immediately assume leadership
            if (msg.type === 'DASHBOARD_CLOSED') {
                state.hasActiveDashboardTab = false;
                state.lastDashboardHeartbeat = 0;
            }
        };

        // Broadcast heartbeat every 2 seconds if currently on /dashboard and owning lock to keep other tabs synced
        safeSetInterval(() => {
            if (tabChannel && isDashboardPage() && state.isTabLockOwner && state.currentEnergy != null) {
                safePostTabMessage({
                    type: 'DASHBOARD_HEARTBEAT',
                    currentEnergy: state.currentEnergy,
                    maxEnergy: state.maxEnergy,
                    energySyncBase: state.energySyncBase,
                    regenRate: state.regenRate,
                    workToday: state.workToday,
                    xpToday: state.xpToday,
                    totalWorked: state.totalWorked,
                    totalWorkXP: state.totalWorkXP,
                    lastWorkTime: state.lastWorkTime,
                    nextWorkTimestamp: state.nextWorkTimestamp,
                    foodEatenToday: state.foodEatenToday,
                    maxFoodDaily: CONFIG.maxFoodDaily || 10,
                    trainingStats: state.trainingStats,
                    activeTraining: state.activeTraining,
                    walletGold: state.walletGold,
                    timestamp: Date.now()
                });
            }
        }, 2000);

        // On non-dashboard tabs, check if dashboard tab is still alive via storage and heartbeat
        safeSetInterval(() => {
            if (!isDashboardPage()) {
                if (!isExtensionContextValid()) return;
                try {
                    chrome.storage?.local?.get?.(['aw_has_dashboard_tab'], d => {
                        if (typeof d?.aw_has_dashboard_tab === 'boolean') {
                            state.hasActiveDashboardTab = d.aw_has_dashboard_tab;
                        } else if (state.lastDashboardHeartbeat && Date.now() - state.lastDashboardHeartbeat > 25000) {
                            state.hasActiveDashboardTab = false;
                        }
                    });
                } catch { /* context invalidated */ }
            }
        }, 4000);
    }

    // ── Chrome Extension Runtime Message Listener (Popup & Background) ────
    try {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg?.type === 'POPUP_COMMAND') {
                if (msg.action === 'toggleRunning') {
                    const newRunning = msg.value != null ? Boolean(msg.value) : !state.running;
                    state.running = newRunning;
                    setValue('aw_worker_running', newRunning.toString());
                    safePostTabMessage({ type: 'TOGGLE_RUNNING', running: newRunning });
                    setRunningUI(newRunning);
                    updatePanel();
                    saveLiveStatus(state, CONFIG, true);
                    log(`Auto Worker ${newRunning ? 'dilanjutkan' : 'dijeda'} via Popup toolbar.`, 'info');
                    if (newRunning) wakePendingWork?.();
                    sendResponse({ ok: true, running: state.running });
                    return true;
                }
                if (msg.action === 'openSettings') {
                    openSettings(CONFIG, ctx);
                    sendResponse({ ok: true });
                    return true;
                }
                if (msg.action === 'workNow') {
                    log('Manual work dipicu via Popup toolbar.', 'info');
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
                    const isDash = isDashboardPage();
                    if (isDash) {
                        const synced = getSyncedEnergy(state);
                        if (synced) {
                            state.currentEnergy = synced.current;
                            state.maxEnergy     = synced.max;
                        }
                        const shouldForce = state.hasInitialDomEnergyRead || state.currentEnergy > 0 || state.postShiftEnergy === 0;
                        sendResponse({ ok: true, status: saveLiveStatus(state, CONFIG, shouldForce) });
                    } else {
                        // Non-dashboard tabs must NEVER force unverified energy projection into storage
                        sendResponse({ ok: true, status: saveLiveStatus(state, CONFIG, false) });
                    }
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
                if (msg.action === 'setFoodCount') {
                    const maxFood = CONFIG.maxFoodDaily || 10;
                    const newFood = Math.max(0, Math.min(maxFood, Number(msg.value) || 0));
                    state.foodEatenToday = newFood;
                    setValue('aw_foodEatenToday', newFood.toString());
                    saveLiveStatus(state, CONFIG, true);
                    safePostTabMessage({
                        type: 'FOOD_UPDATED',
                        foodEatenToday: newFood,
                        timestamp: Date.now()
                    });
                    updatePanel();
                    sendResponse({ ok: true, foodEatenToday: newFood });
                    return true;
                }
            }
            if (msg?.type === 'CONFIG_UPDATED' && msg.config) {
                Object.assign(CONFIG, msg.config);
                updatePanel();
                if (CONFIG.autoTrainEnabled) executeAutoTrain(ctx);
                sendResponse({ ok: true });
                return true;
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

                        const effectiveThreshold = getEffectiveEnergyThreshold(state, CONFIG);
                        if (!msg.manual && state.currentEnergy < effectiveThreshold) {
                            sendResponse({ ok: true, result: 'waiting', energy: state.currentEnergy });
                            return;
                        }

                        log('Trigger background: Menjalankan shift kerja otomatis...', 'info');
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
                                state.domEnergyStale = true;
                                if (latestLive.energySyncBase) {
                                    state.energySyncBase = { ...latestLive.energySyncBase };
                                }
                            }
                            if (latestLive.regenRate != null) state.regenRate = latestLive.regenRate;
                            if (latestLive.regionHealthBonusPercent != null) state.regionHealthBonusPercent = latestLive.regionHealthBonusPercent;
                            if (latestLive.regionName) state.regionName = latestLive.regionName;
                            if (latestLive.nextWorkTimestamp) state.nextWorkTimestamp = latestLive.nextWorkTimestamp;
                            if (latestLive.workToday != null) state.workToday = latestLive.workToday;
                            if (latestLive.xpToday != null) state.xpToday = latestLive.xpToday;
                            if (latestLive.totalWorked != null) state.totalWorked = latestLive.totalWorked;
                            if (latestLive.totalWorkXP != null) state.totalWorkXP = latestLive.totalWorkXP;
                            if (latestLive.serverCooldownUntil != null) state.serverCooldownUntil = latestLive.serverCooldownUntil;
                        }

                        // Multi-tab check: only the active tab lock owner executes work to eliminate duplicate shifts
                        const isDash = isDashboardPage();
                        const canExecuteInTab = state.tabLockManaged ? state.isTabLockOwner : (isDash || !state.hasActiveDashboardTab);

                        if (state.running) {
                            const energy = getSyncedEnergy(state);
                            if (energy) {
                                state.currentEnergy = energy.current;
                                state.maxEnergy = energy.max;
                            }
                            const hasRecentWork = state.lastWorkTimestamp && (Date.now() - state.lastWorkTimestamp < 30000);
                            const isCooldownActive = Boolean(state.serverCooldownUntil && Date.now() < state.serverCooldownUntil);
                            const isWaitingNextWork = Boolean(state.nextWorkTimestamp && Date.now() < state.nextWorkTimestamp);
                            const isMicroBreakActive = Boolean(state.microBreakUntil && Date.now() < state.microBreakUntil);
                            const isBackoffActive = Boolean(state.backoffUntil && Date.now() < state.backoffUntil);
                            const effectiveThreshold = getEffectiveEnergyThreshold(state, CONFIG);
                            const isReadyToWork = state.currentEnergy >= effectiveThreshold && !isCooldownActive && !isWaitingNextWork && !isMicroBreakActive && !isBackoffActive;
                            if (state.workInFlight && Date.now() - (state.workInFlightAt || 0) > 15000) {
                                state.workInFlight = false;
                            }

                            // Check atomic mutex
                            const rawMutex = getValue('aw_work_mutex');
                            const mutexActive = rawMutex && Date.now() < Number(rawMutex);

                            if (canExecuteInTab && isReadyToWork && !hasRecentWork && !state.workInFlight && !state.workResultUncertain && !mutexActive) {
                                setValue('aw_work_mutex', (Date.now() + 20000).toString());
                                log('Background wake: Energi target tercapai, mengeksekusi shift kerja...', 'info');
                                let result = 'retry';
                                try {
                                    result = await doWork({ ...ctx }, false);
                                } finally {
                                    setValue('aw_work_mutex', '0');
                                }
                                saveLiveStatus(state, CONFIG, true);
                                updatePanel();
                                sendResponse({
                                    handled: true,
                                    isLockOwner: Boolean(state.isTabLockOwner),
                                    energy: state.currentEnergy,
                                    energySyncBase: state.energySyncBase,
                                    worked: result === 'worked',
                                    result
                                });
                                return;
                            }
                        }
                        updatePanel();
                        if (isDash || !state.hasActiveDashboardTab) {
                            saveLiveStatus(state, CONFIG);
                        }
                        sendResponse({
                            handled: true,
                            isLockOwner: Boolean(state.isTabLockOwner),
                            energy: state.currentEnergy,
                            energySyncBase: state.energySyncBase,
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
        if (key === 'aw_has_dashboard_tab' && typeof newValue === 'boolean') {
            state.hasActiveDashboardTab = newValue;
            if (!isDashboardPage() && state.hasActiveDashboardTab && state.isTabLockOwner) {
                state.shouldYieldLock = true;
                wakePendingWork?.();
            }
        }
        if (key === 'aw_live_status' && newValue) {
            const isBackgroundShift = Boolean(
                (newValue.lastWorkTimestamp && newValue.lastWorkTimestamp > (state.lastWorkTimestamp || 0)) ||
                (newValue.lastWorkTime && newValue.lastWorkTime !== state.lastWorkTime && (newValue.totalWorked || 0) > (state.totalWorked || 0))
            );

            if (newValue.serverCooldownUntil != null) {
                state.serverCooldownUntil = newValue.serverCooldownUntil;
            }

            const isHidden = typeof document !== 'undefined' && document.hidden;
            // Follower tabs, non-dashboard tabs, background shifts, or hidden background tabs always synchronize state from leader
            if (!state.isTabLockOwner || !isDashboardPage() || isBackgroundShift || isHidden) {
                if (newValue.workToday != null) state.workToday = newValue.workToday;
                if (newValue.xpToday != null) state.xpToday = newValue.xpToday;
                if (newValue.totalWorked != null) state.totalWorked = newValue.totalWorked;
                if (newValue.totalWorkXP != null) state.totalWorkXP = newValue.totalWorkXP;
                if (newValue.lastWorkTime) state.lastWorkTime = newValue.lastWorkTime;
                if (newValue.nextWorkTimestamp != null) state.nextWorkTimestamp = newValue.nextWorkTimestamp;
                if (newValue.lastWorkTimestamp && newValue.lastWorkTimestamp > (state.lastWorkTimestamp || 0)) {
                    state.lastWorkTimestamp = newValue.lastWorkTimestamp;
                }
                if (newValue.regenRate != null) {
                    state.regenRate = newValue.regenRate;
                }
                if (newValue.regionHealthBonusPercent != null) {
                    state.regionHealthBonusPercent = newValue.regionHealthBonusPercent;
                }
                if (newValue.regionName) {
                    state.regionName = newValue.regionName;
                }

                // Synchronize energySyncBase ONLY if newer ground truth anchor exists
                if (newValue.energySyncBase && typeof newValue.energySyncBase.current === 'number') {
                    const newAnchorTime = newValue.energySyncBase.updatedAt || 0;
                    const curAnchorTime = state.energySyncBase?.updatedAt || 0;
                    if (newAnchorTime > curAnchorTime || !state.energySyncBase) {
                        state.energySyncBase = {
                            current: newValue.energySyncBase.current,
                            max: newValue.energySyncBase.max || newValue.maxEnergy || state.maxEnergy || 115,
                            updatedAt: newAnchorTime || Date.now(),
                            regenRate: newValue.energySyncBase.regenRate || newValue.regenRate || state.regenRate || 1.0
                        };
                    } else if (newValue.energySyncBase.regenRate && state.energySyncBase.regenRate !== newValue.energySyncBase.regenRate) {
                        state.energySyncBase.regenRate = newValue.energySyncBase.regenRate;
                    }
                } else if (newValue.currentEnergy != null && !state.energySyncBase) {
                    state.energySyncBase = {
                        current: newValue.currentEnergy,
                        max: newValue.maxEnergy || state.maxEnergy || 115,
                        updatedAt: newValue.updatedAt || Date.now(),
                        regenRate: newValue.regenRate || state.regenRate || 1.0
                    };
                }

                const currentProj = calculateProjectedEnergy(state.energySyncBase, Date.now());
                state.currentEnergy = currentProj;
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
    window.addEventListener('online', _handleOnline);
    window.addEventListener('offline', _handleOffline);
    window.addEventListener('beforeunload', _handleBeforeUnload);

    function _handleOnline() {
        if (!chrome.runtime?.id) return;
        state.isOffline = false;
        errCount = 0;
        log('Koneksi internet pulih (online). Memeriksa jadwal kerja...', 'info');
        updatePanel();
        wakePendingWork?.();
    }

    function _handleOffline() {
        if (!chrome.runtime?.id) return;
        state.isOffline = true;
        log('Koneksi internet terputus (offline). Menunggu jaringan kembali...', 'warn');
        updatePanel();
    }

    function _handleBeforeUnload() {
        if (isDashboardPage()) {
            safePostTabMessage({
                type: 'DASHBOARD_CLOSED',
                timestamp: Date.now()
            });
        }
    }

    let _inForegroundReturn = false;
    let _lastForegroundCheck = 0;

    function _handleForegroundReturn() {
        if (!isExtensionContextValid()) return;
        if (document.visibilityState === 'hidden') return;
        const now = Date.now();
        if (now - _lastForegroundCheck < 500 || _inForegroundReturn) return;
        _lastForegroundCheck = now;
        _inForegroundReturn = true;

        try {
            state.lastForegroundReturnTime = now;
            updatePanelVisibility(state, CONFIG);

            if (!isExtensionContextValid()) {
                _inForegroundReturn = false;
                return;
            }

            chrome.storage.local.get(['aw_live_status', 'aw_has_dashboard_tab'], data => {
                try {
                    if (typeof data?.aw_has_dashboard_tab === 'boolean' && !isDashboardPage()) {
                        state.hasActiveDashboardTab = data.aw_has_dashboard_tab;
                    }

                    const live = data?.aw_live_status;
                    if (live) {
                        const isNewerShift = Boolean(
                            (live.lastWorkTimestamp && live.lastWorkTimestamp > (state.lastWorkTimestamp || 0)) ||
                            (live.lastWorkTime && live.lastWorkTime !== state.lastWorkTime && (live.totalWorked || 0) > (state.totalWorked || 0))
                        );
                        if (isNewerShift) {
                            if (live.currentEnergy != null) {
                                state.currentEnergy = live.currentEnergy;
                                state.lastWorkTimestamp = live.lastWorkTimestamp || 0;
                                state.domEnergyStale = true;
                                state.energySyncBase = live.energySyncBase || {
                                    current: live.currentEnergy,
                                    max: live.maxEnergy || state.maxEnergy || 110,
                                    updatedAt: live.updatedAt || Date.now(),
                                    regenRate: live.regenRate || state.regenRate || 1.0
                                };
                            }
                            if (live.workToday != null) state.workToday = live.workToday;
                            if (live.xpToday != null) state.xpToday = live.xpToday;
                            if (live.totalWorked != null) state.totalWorked = live.totalWorked;
                            if (live.totalWorkXP != null) state.totalWorkXP = live.totalWorkXP;
                            if (live.lastWorkTime) state.lastWorkTime = live.lastWorkTime;
                            if (live.nextWorkTimestamp != null) state.nextWorkTimestamp = live.nextWorkTimestamp;
                            if (live.serverCooldownUntil != null) state.serverCooldownUntil = live.serverCooldownUntil;
                        }
                    }

                    reloadStateFromStorage(state, () => { workHistory = loadWorkHistory(state, CONFIG); });

                    const synced = getSyncedEnergy(state);
                    if (synced) {
                        state.currentEnergy = synced.current;
                        state.maxEnergy = synced.max;
                    }

                    updatePanel();
                    updatePanelVisibility(state, CONFIG);
                    saveLiveStatus(state, CONFIG, true);

                    if (state.running && state.isTabLockOwner && (!state.nextWorkTimestamp || Date.now() >= state.nextWorkTimestamp) && (!state.serverCooldownUntil || Date.now() >= state.serverCooldownUntil) && (!state.microBreakUntil || Date.now() >= state.microBreakUntil) && (!state.backoffUntil || Date.now() >= state.backoffUntil) && state.currentEnergy >= getEffectiveEnergyThreshold(state, CONFIG)) {
                        wakePendingWork?.();
                    }
                } finally {
                    _inForegroundReturn = false;
                }
            });
        } catch {
            _inForegroundReturn = false;
        }
    }

    let errCount = 0;

    function checkCircuitBreaker() {
        if (!CONFIG.circuitBreakerEnabled) return { active: false, reason: '' };
        try {
            const title = (document.title || '').toLowerCase();
            if (title.includes('just a moment') || title.includes('attention required') || title.includes('security check')) {
                return { active: true, reason: 'Cloudflare Challenge terdeteksi' };
            }
            if (document.querySelector('#challenge-running, #cf-wrapper, .cf-turnstile, #cf-stage, .cf-browser-verification')) {
                return { active: true, reason: 'Cloudflare Verification terdeteksi' };
            }
            const bodyText = (document.body?.innerText || '').substring(0, 500).toLowerCase();
            if (bodyText.includes('502 bad gateway') || bodyText.includes('503 service unavailable') || bodyText.includes('504 gateway time-out') || bodyText.includes('server sedang pemeliharaan') || bodyText.includes('under maintenance')) {
                return { active: true, reason: 'Server Maintenance / Error 50x terdeteksi' };
            }
            if (document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .h-captcha, .g-recaptcha')) {
                return { active: true, reason: 'Captcha interaktif terdeteksi' };
            }
        } catch { /* ignore */ }
        return { active: false, reason: '' };
    }

    function checkHygienicAutoReload() {
        if (!CONFIG.autoReloadTabEnabled) return;
        if (!state.running) return;
        if (state.workInFlight || state.circuitBreakerActive) return;

        const uptimeMs = Date.now() - state.scriptStartTime;
        // 12 jam nonstop (43,200,000 ms)
        if (uptimeMs >= 43200000) {
            const curEnergy = state.currentEnergy ?? 0;
            const remainingDelay = (state.nextWorkTimestamp || 0) - Date.now();
            // Hanya reload jika energi sangat rendah (< 20 EN) dan countdown kerja berikutnya masih > 20 menit
            if (curEnergy < 20 && remainingDelay > 1200000) {
                log('[Auto Refresh] Membersihkan memori tab setelah berjalan 12+ jam. Memuat ulang tab game...', 'info');
                saveLiveStatus(state, CONFIG, true);
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        }
    }

    function scanDomForFoodToast() {
        const maxFood = CONFIG.maxFoodDaily || 10;
        if (state.foodEatenToday >= maxFood) return;
        try {
            const candidates = document.querySelectorAll('[role="alert"], [role="status"], .toast, [class*="toast" i], [class*="alert" i], [data-radix-popper-content-wrapper], [data-sonner-toast]');
            for (const el of candidates) {
                if (el.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast')) continue;
                const txt = el.textContent || '';
                if (/batas roti harian tercapai|daily bread limit/i.test(txt)) {
                    state.foodEatenToday = maxFood;
                    setValue('aw_foodEatenToday', maxFood.toString());
                    saveLiveStatus(state, CONFIG, true);
                    safePostTabMessage({
                        type: 'FOOD_UPDATED',
                        foodEatenToday: maxFood,
                        timestamp: Date.now()
                    });
                    log(`Notifikasi game: Batas konsumsi roti harian tercapai (${maxFood}/${maxFood}).`, 'info');
                    updatePanel();
                    return;
                }
            }
        } catch { /* ignore */ }
    }

    function setupDomToastObserver() {
        scanDomForFoodToast();

        let debounceTimer = null;
        if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
            const observer = new MutationObserver(() => {
                if (isDashboardPage()) {
                    readBreadQuotaFromDom(state, CONFIG, log);
                }
                const maxFood = CONFIG.maxFoodDaily || 10;
                if (state.foodEatenToday >= maxFood) return;
                if (debounceTimer) return;
                debounceTimer = setTimeout(() => {
                    debounceTimer = null;
                    scanDomForFoodToast();
                    if (isDashboardPage()) {
                        readBreadQuotaFromDom(state, CONFIG, log);
                        updatePanel();
                    }
                }, 400);
            });

            try {
                observer.observe(document.body || document.documentElement, {
                    childList: true,
                    subtree: true
                });
            } catch { /* ignore */ }
        }

        // Also scan after user clicks in the document (e.g. eating bread in inventory or dashboard)
        document.addEventListener('click', (e) => {
            if (e.target?.closest?.('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal')) return;
            setTimeout(() => {
                if (isDashboardPage()) {
                    readBreadQuotaFromDom(state, CONFIG, log);
                    updatePanel();
                }
                scanDomForFoodToast();
            }, 300);
            setTimeout(() => {
                if (isDashboardPage()) {
                    readBreadQuotaFromDom(state, CONFIG, log);
                    updatePanel();
                }
            }, 1000);
        }, { passive: true });
    }

    function setupTrainingModalObserver() {
        if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;

        let debounce = false;
        const observer = new MutationObserver((mutations) => {
            if (!CONFIG.autoTrainEnabled) return;
            if (debounce) return;

            let hasModalMutation = false;
            for (const m of mutations) {
                if (m.addedNodes && m.addedNodes.length > 0) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1) {
                            if (node.matches?.('[data-testid*="train-confirm"], [role="dialog"], dialog, div.fixed.inset-0') ||
                                node.querySelector?.('[data-testid*="confirm"], [role="dialog"], button.btn-gold')) {
                                hasModalMutation = true;
                                break;
                            }
                        }
                    }
                }
                if (hasModalMutation) break;
            }

            if (hasModalMutation || getTrainingConfirmStartButton()) {
                debounce = true;
                setTimeout(() => { debounce = false; }, 400);
                autoConfirmTrainingModal(ctx);
            }
        });

        try {
            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
            });
        } catch { /* ignore */ }
    }

    async function runWorkerLoop() {
        while (true) {
            try {
                if (!chrome.runtime?.id) {
                    console.log('[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih. Silakan refresh tab game (F5).');
                    return;
                }

                // Yield lock if a dashboard tab requested leadership
                if (state.shouldYieldLock) {
                    state.shouldYieldLock = false;
                    _setTabLockOwner(state, false, ctx);
                    return;
                }

                // Circuit Breaker: tangkal Cloudflare, Maintenance, atau Captcha
                const cb = checkCircuitBreaker();
                if (cb.active) {
                    if (!state.circuitBreakerActive) {
                        state.circuitBreakerActive = true;
                        state.circuitBreakerReason = cb.reason;
                        log(`[Circuit Breaker] ${cb.reason}. Worker dijeda otomatis demi keamanan akun.`, 'warn');
                        updatePanel();
                    }
                    await waitForScheduledWork(30000);
                    continue;
                } else if (state.circuitBreakerActive) {
                    state.circuitBreakerActive = false;
                    state.circuitBreakerReason = '';
                    log('[Circuit Breaker] Halaman game kembali normal. Melanjutkan jadwal kerja...', 'info');
                    updatePanel();
                }

                // Auto-refresh higienis untuk mencegah memory leak peramban
                checkHygienicAutoReload();

                // Deteksi notifikasi batas makanan game jika muncul di DOM
                scanDomForFoodToast();

                // Pause gracefully if offline
                if (typeof navigator !== 'undefined' && (navigator.onLine === false || state.isOffline)) {
                    await waitForScheduledWork(5000);
                    continue;
                }

                checkDailyReset();
                if (state.running) {
                    if (isDashboardPage() && !state.hasInitialDomEnergyRead) {
                        await waitForScheduledWork(1000);
                        continue;
                    }
                    state.isEnergyFlushActive = isEnergyFlushActive(CONFIG);
                    const effectiveThreshold = getEffectiveEnergyThreshold(state, CONFIG);

                    // Continuous energy synchronization: ensure background tabs always calculate fresh energy
                    const synced = getSyncedEnergy(state);
                    if (synced) {
                        state.currentEnergy = synced.current;
                        state.maxEnergy = synced.max;
                    }

                    // 1. Check if server cooldown or scheduled wait is active in the future
                    if (state.serverCooldownUntil && Date.now() < state.serverCooldownUntil) {
                        state.nextWorkTimestamp = Math.max(state.nextWorkTimestamp || 0, state.serverCooldownUntil);
                    }

                    // If energy has already regenerated to threshold and no server cooldown is active,
                    // reset stale hours-long countdowns from when energy was previously empty!
                    if (state.currentEnergy >= effectiveThreshold && (!state.serverCooldownUntil || Date.now() >= state.serverCooldownUntil)) {
                        if (state.nextWorkTimestamp && state.nextWorkTimestamp - Date.now() > 30000) {
                            state.nextWorkTimestamp = 0;
                        }
                    }

                    if (state.nextWorkTimestamp && state.nextWorkTimestamp > Date.now()) {
                        const delay = Math.max(1000, state.nextWorkTimestamp - Date.now());
                        await waitForScheduledWork(delay);
                        continue;
                    }

                    // 2. Check if energy is below effective threshold
                    if (state.currentEnergy < effectiveThreshold) {
                        const delay = getNextWorkDelay(state, CONFIG);
                        state.nextWorkTimestamp = Date.now() + delay;
                        await waitForScheduledWork(delay);
                        continue;
                    }

                    // 3. Ready to work
                    const result = await doWork(ctx);
                    if (result === 'retrySoon') {
                        await waitForScheduledWork(5000);
                    } else if (result === 'retry') {
                        errCount++;
                        const backoff = Math.min(300000, 10000 * Math.pow(2, errCount - 1));
                        log(`Retry dalam ${(backoff / 1000).toFixed(0)}s (percobaan ke-${errCount})...`, 'warn');
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
                    console.log('[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih.');
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
        // If this tab is NOT on dashboard and an active dashboard tab exists, do NOT compete for the lock!
        // Let the dashboard tab be the authoritative worker leader.
        if (!isDashboardPage() && state.hasActiveDashboardTab) {
            state.waitedForTabLock = true;
            _setTabLockOwner(state, false, ctx);
            await new Promise(r => setTimeout(r, 3000));
            continue;
        }

        let acquired = false;
        try {
            await navigator.locks.request('parlamentum-auto-worker', { ifAvailable: true }, async lock => {
                if (!lock) return;
                acquired = true;
                reloadStateFromStorage(state, () => { workHistory = loadWorkHistory(state, CONFIG); });
                setRunningUI(state.running);
                if (getValue('aw_workResultUncertain', 'false') === 'true') {
                    state.workResultUncertain = true;
                    state.running = false;
                    setValue('aw_worker_running', 'false');
                    setRunningUI(false);
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
            await new Promise(r => setTimeout(r, 3000));
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
        console.log('[Init] Estimasi energi masa lalu diterapkan (migrasi sekali jalan).');
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
            state.pausedForToken = true;
            state.tokenExpired = true;
            let attempts = 0;
            try {
                attempts = parseInt(sessionStorage.getItem('aw_token_reload_attempts') || '0', 10);
            } catch { /* ignore */ }
            if (attempts < 1) {
                try { sessionStorage.setItem('aw_token_reload_attempts', (attempts + 1).toString()); } catch {}
                log('Token sesi kedaluwarsa. Me-reload tab otomatis sekali untuk memperbarui sesi...', 'warn');
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                state.running = false;
                setValue('aw_worker_running', 'false');
                ctx?.setRunningUI?.(false);
                log('Token sesi telah kedaluwarsa. Auto Worker dijeda. Silakan login kembali.', 'error');
            }
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
    log('Auto Worker v5.12.0 (Gaussian & Route-Throttled) aktif.', 'success', false);
    log(`Energy Threshold: ${CONFIG.energyThreshold} EN`, 'info', false);
    log(`History: simpan ${CONFIG.historyMaxDays} hari terakhir`, 'info', false);
    log(`Quiet mode: ${CONFIG.quietModeEnabled ? 'ON' : 'OFF'}`, 'info', false);
    log(`Shortcuts: ${Object.values(CONFIG.shortcuts).map(s => s.display).join(', ')}`, 'info', false);
    log(`Script uptime: ${uptime}s`, 'info', false);
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
            origPushState.apply(history, args);
            check();
        };
        const origReplaceState = history.replaceState;
        history.replaceState = function(...args) {
            origReplaceState.apply(history, args);
            check();
        };
    } catch { /* ignore */ }
    window.addEventListener('popstate', check);
    safeSetInterval(check, 1000);
}
