/**
 * state.js — Central mutable application state
 *
 * One single object, imported by reference everywhere.
 * Initialized in main.js after storage is ready.
 */

import { getValue, setValue } from './storage.js';

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
    return {
        running: !hasUncertainWorkResult,
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

        currentEnergy:  0,
        maxEnergy:      100,
        energyFullAlertActive: false,
        energySyncBase: null,

        workInFlight:   false,
        workResultUncertain: hasUncertainWorkResult,
        uncertainReconciliation: hasUncertainWorkResult ? 'pending' : 'none',

        playerLevel:    1,
        regionName:     '',
        regionHealthBonusPercent: 0,

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
    const curEnergy = state.currentEnergy ?? 0;
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
        nextWorkTimestamp: nextTimestamp,
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

    // Multi-tab protection: standby tabs must NOT overwrite leader's storage unless active in foreground or forced
    if (!force && state.tabLockManaged && !state.isTabLockOwner && document.hidden) {
        return summary;
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
    state.lastWorkDate = getValue('lastWorkDate', new Date().toDateString());
    state.lastWorkTime = getValue('lastWorkTime', 'Belum pernah');
    loadWorkHistory();
}
