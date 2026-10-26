/**
 * state.js — Central mutable application state
 *
 * One single object, imported by reference everywhere.
 * Initialized in main.js after storage is ready.
 */

import { getValue, setValue } from './storage.js';
import { calculateProjectedEnergy } from './energy.js';

/** @param {string} key @param {number} fallback @param {number} min @param {number} max */
export function getStoredInteger(key, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const raw = getValue(key, fallback.toString());
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

/**
 * Creates the initial state from persisted storage values.
 * Call AFTER initStorage() and AFTER migration checks in main.js.
 * @param {object} CONFIG
 * @param {number} savedStartTime
 * @param {boolean} hasUncertainWorkResult
 */
export function createInitialState(CONFIG, savedStartTime, hasUncertainWorkResult) {
    const savedRunning = getValue('aw_worker_running', 'true');
    const isRunning = !hasUncertainWorkResult && savedRunning !== 'false';

    // Pre-seed energy from stored live status & mathematical projection immediately at object creation
    let initCurrentEnergy = 0;
    let initMaxEnergy = 100;
    let initSyncBase = null;
    let initRegenRate = 1.0;
    let initRegionName = '';
    let initRegionHealthBonusPercent = 0;
    let initLastWorkTimestamp = 0;

    const cachedLive = getValue('aw_live_status');
    if (cachedLive && typeof cachedLive === 'object') {
        initMaxEnergy = cachedLive.maxEnergy || 100;
        if (cachedLive.regenRate != null) initRegenRate = cachedLive.regenRate;
        if (cachedLive.regionHealthBonusPercent != null) initRegionHealthBonusPercent = cachedLive.regionHealthBonusPercent;
        if (cachedLive.regionName) initRegionName = cachedLive.regionName;
        if (cachedLive.lastWorkTimestamp) initLastWorkTimestamp = cachedLive.lastWorkTimestamp;

        if (cachedLive.energySyncBase && typeof cachedLive.energySyncBase.current === 'number') {
            initSyncBase = { ...cachedLive.energySyncBase };
            const projected = calculateProjectedEnergy(initSyncBase, Date.now());
            if (typeof projected === 'number' && projected > 0) {
                initCurrentEnergy = Math.min(initMaxEnergy, projected);
            } else if (typeof cachedLive.currentEnergy === 'number' && cachedLive.currentEnergy > 0) {
                initCurrentEnergy = Math.min(initMaxEnergy, cachedLive.currentEnergy);
            } else {
                initCurrentEnergy = Math.max(0, projected || 0);
            }
        } else if (cachedLive.currentEnergy != null) {
            initCurrentEnergy = Math.min(initMaxEnergy, cachedLive.currentEnergy);
            initSyncBase = {
                current: initCurrentEnergy,
                max: initMaxEnergy,
                updatedAt: cachedLive.updatedAt || Date.now(),
                regenRate: initRegenRate
            };
        }
    }

    return {
        running: isRunning,
        totalWorked:    getStoredInteger('totalWorked', 0),
        totalWorkXP:    getStoredInteger('totalWorkXP', 0),
        workToday:      getStoredInteger('workToday', 0),
        xpToday:        getStoredInteger('xpToday', 0),
        lastWorkDate:   getValue('lastWorkDate', new Date().toDateString()),
        lastWorkTime:   getValue('lastWorkTime', 'Belum pernah'),

        currentToken:   null,
        tokenExpiry:    null,
        storedTokenValue: '',
        pausedForToken: false,
        tokenExpired:   false,

        currentEnergy:  initCurrentEnergy,
        maxEnergy:      initMaxEnergy,
        hasInitialDomEnergyRead: false,
        energyFullAlertActive: false,
        energySyncBase: initSyncBase,

        workInFlight:   false,
        workResultUncertain: hasUncertainWorkResult,
        uncertainReconciliation: hasUncertainWorkResult ? 'pending' : 'none',
        postShiftEnergy: null,
        shiftExecutedInSession: false,

        playerLevel:    1,
        regionName:     initRegionName,
        regionHealthBonusPercent: initRegionHealthBonusPercent,
        regenRate:      initRegenRate,
        lastWorkTimestamp: initLastWorkTimestamp,

        panelMinimized: getValue('panelMinimized', 'false') === 'true',
        panelVisible:   getValue('panelVisible', 'true') === 'true',
        userManuallyToggledPanel: false,
        panelX:         getStoredInteger('panelX', CONFIG.panelDefaultX, 0, 10000),
        panelY:         getStoredInteger('panelY', CONFIG.panelDefaultY, 0, 10000),
        originalPanelX: getStoredInteger('panelX', CONFIG.panelDefaultX, 0, 10000),
        originalPanelY: getStoredInteger('panelY', CONFIG.panelDefaultY, 0, 10000),

        logs:           [],
        settingsOpen:   false,

        lastLowEnergyLogTime: 0,
        scriptStartTime: Date.now(),
        sessionStartTime: savedStartTime,

        nextWorkTimestamp: 0,

        isTabLockOwner: false,
        tabLockManaged: false,
        waitedForTabLock: false,

        totalEnergySpent:          getStoredInteger('totalEnergySpent', 0),
        totalActualEnergySpent:    getStoredInteger('totalActualEnergySpent', 0),
        totalEstimatedEnergySpent: getStoredInteger('totalEstimatedEnergySpent', 0),

        foodEatenToday:            (() => {
            const currentUtcDay = new Date().toISOString().slice(0, 10);
            const savedUtcDay = getValue('aw_foodUtcDate', '');
            if (savedUtcDay && savedUtcDay !== currentUtcDay) {
                setValue('aw_foodUtcDate', currentUtcDay);
                setValue('aw_foodEatenToday', '0');
                return 0;
            }
            if (!savedUtcDay) {
                setValue('aw_foodUtcDate', currentUtcDay);
            }
            return getStoredInteger('aw_foodEatenToday', 0, 0, 20);
        })(),
        maxFoodDaily:              getStoredInteger('aw_maxFoodDaily', 10, 10, 20),
        circuitBreakerActive:      false,
        circuitBreakerReason:      '',
        isEnergyFlushActive:       false,

        trainingStats: {
            strength:  getStoredInteger('aw_stat_strength', 0),
            education: getStoredInteger('aw_stat_education', 0),
            economy:   getStoredInteger('aw_stat_economy', 0)
        },
        walletGold: getStoredInteger('aw_wallet_gold', 0),
        activeTraining: (() => {
            const raw = getValue('aw_active_training', null);
            if (raw && typeof raw === 'object' && raw.endsAt && new Date(raw.endsAt).getTime() > Date.now()) {
                return raw;
            }
            return null;
        })(),
        nextTrainCheckTimestamp: 0,
        trainingInFlight: false,
        consecutiveErrors: 0,
        backoffUntil: 0,
        microBreakUntil: 0,
        microBreakReason: '',
        nextMicroBreakScheduledAt: 0,
    };
}

/**
 * Batch-writes all counter fields to storage.
 * @param {object} state
 */
export function saveState(state) {
    const entries = {
        totalWorked:               state.totalWorked.toString(),
        workToday:                 state.workToday.toString(),
        totalWorkXP:               state.totalWorkXP.toString(),
        xpToday:                   state.xpToday.toString(),
        totalEnergySpent:          state.totalEnergySpent.toString(),
        totalActualEnergySpent:    state.totalActualEnergySpent.toString(),
        totalEstimatedEnergySpent: state.totalEstimatedEnergySpent.toString(),
        lastWorkTime:              state.lastWorkTime,
        lastWorkDate:              state.lastWorkDate,
        aw_worker_running:         state.running.toString(),
    };
    for (const [k, v] of Object.entries(entries)) setValue(k, v);
}

/**
 * Reloads counter fields from storage (used by standby tabs).
 * @param {object} state
 * @param {function} loadWorkHistory
 */
let _lastLiveStatusJson = '';
let _lastLiveStatusAt = 0;

/**
 * Generates live status summary object representing current extension state.
 * @param {object} state
 * @param {object|null} CONFIG
 * @returns {object}
 */
export function getLiveStatusSummary(state, CONFIG = null) {
    const lastLog = state.lastLogMessage || (state.logs && state.logs.length > 0 ? state.logs[0].message : '');
    const isExpired = Boolean(
        state.tokenExpired ||
        state.pausedForToken ||
        !state.currentToken ||
        (state.tokenExpiry && Number(state.tokenExpiry) <= Date.now())
    );

    const threshold = CONFIG?.energyThreshold ?? 10;
    
    // Ensure state.energySyncBase is established
    if (!state.energySyncBase || typeof state.energySyncBase.current !== 'number') {
        state.energySyncBase = {
            current: state.currentEnergy ?? 0,
            max: state.maxEnergy || 115,
            updatedAt: Date.now(),
            regenRate: state.regenRate || 1.0
        };
    }
    if (state.regenRate && state.energySyncBase.regenRate !== state.regenRate) {
        state.energySyncBase.regenRate = state.regenRate;
    }

    let curEnergy = state.currentEnergy;
    if (curEnergy == null || state.domEnergyStale || !state.hasInitialDomEnergyRead) {
        const projected = calculateProjectedEnergy(state.energySyncBase, Date.now());
        if (typeof projected === 'number') {
            curEnergy = projected;
            state.currentEnergy = projected;
        }
    }
    let nextTimestamp = state.nextWorkTimestamp ?? 0;

    // Only initialize nextWorkTimestamp if it was never set (0)
    if (!nextTimestamp && curEnergy < threshold) {
        const rate = state.regenRate || 1.0;
        const neededMins = Math.max(1, (threshold - curEnergy) / rate);
        nextTimestamp = Date.now() + Math.round(neededMins * 60000);
        state.nextWorkTimestamp = nextTimestamp;
    }

    return {
        running: Boolean(state.running),
        currentEnergy: curEnergy,
        maxEnergy: state.maxEnergy ?? 100,
        energySyncBase: {
            current: state.energySyncBase.current,
            max: state.energySyncBase.max || state.maxEnergy || 115,
            updatedAt: state.energySyncBase.updatedAt,
            regenRate: state.energySyncBase.regenRate || state.regenRate || 1.0
        },
        nextWorkTimestamp: nextTimestamp,
        lastWorkTimestamp: state.lastWorkTimestamp || 0,
        workToday: state.workToday ?? 0,
        xpToday: state.xpToday ?? 0,
        totalWorked: state.totalWorked ?? 0,
        totalWorkXP: state.totalWorkXP ?? 0,
        hasToken: Boolean(state.currentToken),
        tokenExpiry: state.tokenExpiry ? new Date(state.tokenExpiry).getTime() : null,
        tokenExpired: isExpired,
        pausedForToken: Boolean(state.pausedForToken),
        lastWorkTime: state.lastWorkTime || 'Belum pernah',
        energyThreshold: threshold,
        playerLevel: state.playerLevel || 1,
        regionName: state.regionName || '',
        regionHealthBonusPercent: state.regionHealthBonusPercent || 0,
        regenRate: state.regenRate || 1.0,
        lastLogMessage: lastLog,
        isTabLockOwner: Boolean(state.isTabLockOwner),
        foodEatenToday: state.foodEatenToday ?? 0,
        maxFoodDaily: CONFIG?.maxFoodDaily || state.maxFoodDaily || 10,
        circuitBreakerActive: Boolean(state.circuitBreakerActive),
        circuitBreakerReason: state.circuitBreakerReason || '',
        isEnergyFlushActive: Boolean(state.isEnergyFlushActive),
        serverCooldownUntil: state.serverCooldownUntil || 0,
        microBreakUntil: state.microBreakUntil || 0,
        microBreakReason: state.microBreakReason || '',
        backoffUntil: state.backoffUntil || 0,
        trainingStats: state.trainingStats || { strength: 0, education: 0, economy: 0 },
        walletGold: state.walletGold || 0,
        activeTraining: state.activeTraining || null,
        updatedAt: Date.now()
    };
}

/**
 * Saves live status summary for popup and background badge.
 * Always returns the fresh summary object.
 * @param {object} state
 * @param {object|null} CONFIG
 * @param {boolean} [force=false]
 */
export function saveLiveStatus(state, CONFIG = null, force = false) {
    const summary = getLiveStatusSummary(state, CONFIG);

    // Multi-tab protection: non-dashboard tabs must NEVER overwrite leader/dashboard's live status when a dashboard tab is active
    const path = (typeof window !== 'undefined' ? window.location.pathname || '' : '').toLowerCase().replace(/\/+$/, '');
    const isDash = path === '/dashboard' || path.startsWith('/dashboard/') || path === '';

    if (!isDash && state.hasActiveDashboardTab) {
        return summary;
    }

    if (!isDash && !force && state.tabLockManaged && !state.isTabLockOwner) {
        return summary;
    }

    // Zero-Dip Safeguard: never overwrite a valid stored energy with 0 during initial bootstrap/hydration
    // before the DOM has been read, unless an actual work shift was executed (postShiftEnergy === 0)
    // or server rejected work due to insufficient energy.
    if (!state.hasInitialDomEnergyRead && summary.currentEnergy === 0 && state.postShiftEnergy !== 0) {
        const existing = getValue('aw_live_status');
        if (existing && typeof existing.currentEnergy === 'number' && existing.currentEnergy > 0) {
            summary.currentEnergy = existing.currentEnergy;
            summary.maxEnergy = existing.maxEnergy || summary.maxEnergy;
            summary.energySyncBase = existing.energySyncBase || summary.energySyncBase;
            state.currentEnergy = existing.currentEnergy;
            state.maxEnergy = existing.maxEnergy || state.maxEnergy;
            state.energySyncBase = existing.energySyncBase || state.energySyncBase;
            return summary;
        }
    }

    const nextWorkBucket = Math.round((summary.nextWorkTimestamp || 0) / 3000);
    const keyFields = `${summary.running}|${summary.currentEnergy}|${summary.maxEnergy}|${summary.workToday}|${summary.hasToken}|${summary.tokenExpired}|${summary.energyThreshold}|${nextWorkBucket}|${summary.lastLogMessage}`;
    const now = Date.now();
    if (!force && keyFields === _lastLiveStatusJson && (now - _lastLiveStatusAt < 3000)) {
        return summary;
    }

    _lastLiveStatusJson = keyFields;
    _lastLiveStatusAt = now;
    setValue('aw_live_status', summary);
    return summary;
}

export function reloadStateFromStorage(state, loadWorkHistory) {
    state.totalWorked =    getStoredInteger('totalWorked', 0);
    state.totalWorkXP =    getStoredInteger('totalWorkXP', 0);
    state.workToday =      getStoredInteger('workToday', 0);
    state.xpToday =        getStoredInteger('xpToday', 0);
    state.totalEnergySpent =          getStoredInteger('totalEnergySpent', 0);
    state.totalActualEnergySpent =    getStoredInteger('totalActualEnergySpent', 0);
    state.totalEstimatedEnergySpent = getStoredInteger('totalEstimatedEnergySpent', 0);
    const currentUtcDay = new Date().toISOString().slice(0, 10);
    const savedUtcDay = getValue('aw_foodUtcDate', '');
    if (savedUtcDay && savedUtcDay !== currentUtcDay) {
        state.foodEatenToday = 0;
        setValue('aw_foodUtcDate', currentUtcDay);
        setValue('aw_foodEatenToday', '0');
    } else {
        state.foodEatenToday = getStoredInteger('aw_foodEatenToday', 0, 0, 20);
    }
    state.maxFoodDaily = getStoredInteger('aw_maxFoodDaily', 10, 10, 20);
    state.lastWorkDate = getValue('lastWorkDate', new Date().toDateString());
    state.lastWorkTime = getValue('lastWorkTime', 'Belum pernah');
    const savedRunning = getValue('aw_worker_running', 'true');
    state.running = savedRunning !== 'false';
    loadWorkHistory();
}
