/**
 * config.js — Extension configuration with validation
 */

import { getValue, setValue } from './storage.js';

export const DEFAULT_CONFIG = {
    sendNotification: true,
    tokenRefreshInterval: 3600000,
    tokenExpiryThreshold: 300000,
    panelDefaultX: 10,
    panelDefaultY: 10,
    soundNotificationEnabled: true,
    soundNotificationVolume: 0.3,
    energyFullAlertSoundEnabled: true,
    energyFullAlertVolume: 0.3,
    panelPinned: false,
    panelFollowViewport: true,
    panelReturnToOriginal: false,
    panelDashboardOnly: true,
    panelLeaderOnly: true,
    maxLogEntries: 200,
    quietModeEnabled: true,
    quietModeInterval: 120000,
    energyThreshold: 10,
    energyFullAlertEnabled: true,
    historyMaxDays: 30,
    stealthJitterEnabled: true,
    sleepScheduleEnabled: false,
    sleepStartHour: 1,
    sleepEndHour: 6,
    autoReloginEnabled: false,
    ecoModeEnabled: true,
    shortcuts: {
        showHide:     { keys: ['Control', 'Shift', 'KeyA'], display: 'Ctrl+Shift+A' },
        workNow:      { keys: ['Alt', 'Shift', 'KeyW'],    display: 'Alt+Shift+W' },
        pauseResume:  { keys: ['Alt', 'Shift', 'KeyP'],    display: 'Alt+Shift+P' },
        openLog:      { keys: ['Control', 'Shift', 'KeyL'], display: 'Ctrl+Shift+L' },
        openSettings: { keys: ['Control', 'Shift', 'KeyS'], display: 'Ctrl+Shift+S' }
    }
};

const NUMERIC_BOUNDS = {
    tokenRefreshInterval:      [1000, 86400000],
    tokenExpiryThreshold:      [0,    86400000],
    panelDefaultX:             [0,    10000],
    panelDefaultY:             [0,    10000],
    soundNotificationVolume:   [0,    1],
    energyFullAlertVolume:     [0,    1],
    maxLogEntries:             [1,    1000],
    quietModeInterval:         [1000, 86400000],
    energyThreshold:           [10,   100],
    historyMaxDays:            [1,    365],
    sleepStartHour:            [0,    23],
    sleepEndHour:              [0,    23]
};

export function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeConfig(candidate, strict = false) {
    if (!isPlainObject(candidate)) {
        return strict ? null : { ...DEFAULT_CONFIG, shortcuts: { ...DEFAULT_CONFIG.shortcuts } };
    }

    const config = { ...DEFAULT_CONFIG, shortcuts: { ...DEFAULT_CONFIG.shortcuts } };

    for (const [key, value] of Object.entries(candidate)) {
        if (key === 'shortcuts' || value === undefined) continue;

        if (typeof DEFAULT_CONFIG[key] === 'boolean') {
            if (typeof value === 'boolean') config[key] = value;
            else if (strict) return null;
            continue;
        }

        const bounds = NUMERIC_BOUNDS[key];
        if (bounds) {
            const valid = typeof value === 'number' && Number.isFinite(value)
                && value >= bounds[0] && value <= bounds[1];
            if (valid) config[key] = value;
            else if (strict) return null;
        }
    }

    if (candidate.shortcuts !== undefined) {
        if (!isPlainObject(candidate.shortcuts)) {
            if (strict) return null;
        } else {
            for (const [action, shortcut] of Object.entries(candidate.shortcuts)) {
                if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG.shortcuts, action)) continue;
                const valid = isPlainObject(shortcut)
                    && Array.isArray(shortcut.keys)
                    && shortcut.keys.length >= 1 && shortcut.keys.length <= 3
                    && shortcut.keys.every(k => typeof k === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(k))
                    && typeof shortcut.display === 'string' && /^[A-Za-z0-9+ ]{1,64}$/.test(shortcut.display);
                if (valid) config.shortcuts[action] = { keys: [...shortcut.keys], display: shortcut.display };
                else if (strict) return null;
            }
        }
    }

    return config;
}

export function loadConfig() {
    const saved = getValue('aw_config', null);
    if (!saved) return normalizeConfig(DEFAULT_CONFIG);
    try {
        const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
        return normalizeConfig(parsed);
    } catch (e) {
        console.error('[Config] Failed to parse config:', e);
        return normalizeConfig(DEFAULT_CONFIG);
    }
}

export function saveConfig(config) {
    setValue('aw_config', config);
}

