/**
 * history.js — Daily work history storage and management
 */

import { getValue, setValue } from './storage.js';
import { isPlainObject } from './config.js';
import { getStoredInteger } from './state.js';

/** @param {object} history @param {number} maxDays */
export function pruneOldHistory(history, maxDays = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (maxDays || 30));
    let pruned = false;
    for (const key of Object.keys(history)) {
        if (new Date(key) < cutoff) {
            delete history[key];
            pruned = true;
        }
    }
    return pruned;
}

/** @param {unknown} candidate @returns {object|null} */
export function normalizeWorkHistory(candidate) {
    if (!isPlainObject(candidate)) return null;

    const normalized = Object.create(null);
    for (const [key, entry] of Object.entries(candidate)) {
        const date = new Date(key);
        if (
            Number.isNaN(date.getTime()) || date.toDateString() !== key ||
            !isPlainObject(entry) ||
            !Number.isSafeInteger(entry.shifts) || entry.shifts < 0 ||
            !Number.isSafeInteger(entry.xp)     || entry.xp < 0
        ) return null;

        const hasEnergyData = ['energySpent', 'estimatedEnergySpent', 'energyDataShifts']
            .some(f => Object.prototype.hasOwnProperty.call(entry, f));

        if (hasEnergyData && (
            !Number.isSafeInteger(entry.energySpent)          || entry.energySpent < 0 ||
            !Number.isSafeInteger(entry.estimatedEnergySpent) || entry.estimatedEnergySpent < 0 ||
            !Number.isSafeInteger(entry.energyDataShifts)     || entry.energyDataShifts < 0 ||
            entry.energyDataShifts > entry.shifts
        )) return null;

        normalized[key] = { shifts: entry.shifts, xp: entry.xp };
        if (hasEnergyData) {
            normalized[key].energySpent          = entry.energySpent;
            normalized[key].estimatedEnergySpent = entry.estimatedEnergySpent;
            normalized[key].energyDataShifts     = entry.energyDataShifts;
        }
    }
    return normalized;
}

/** Migrates pre-5.9.8 history where energySpent included estimated amounts. */
export function migrateLegacyEnergyHistory(history) {
    for (const entry of Object.values(history)) {
        if (Object.prototype.hasOwnProperty.call(entry, 'energySpent')) {
            entry.energySpent = Math.max(0, entry.energySpent - entry.estimatedEnergySpent);
        }
    }
    return history;
}

/**
 * Loads work history from storage, runs migration if needed, syncs today's counters.
 * @param {object} state
 * @param {object} CONFIG
 * @returns {object} history
 */
export function loadWorkHistory(state = {}, CONFIG = {}) {
    try {
        const raw = getValue('aw_workHistory', null);
        const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
        let history = normalizeWorkHistory(parsed) || Object.create(null);

        if (getStoredInteger('aw_energySchemaVersion', 1, 1, 2) < 2) {
            migrateLegacyEnergyHistory(history);
            setValue('aw_energySchemaVersion', '2');
            setValue('aw_workHistory', JSON.stringify(history));
        }

        const workToday = getStoredInteger('workToday', 0);
        const xpToday   = getStoredInteger('xpToday', 0);
        const todayKey  = new Date().toDateString();
        const maxDays   = CONFIG?.historyMaxDays || 30;

        if (!history[todayKey] || history[todayKey].shifts !== workToday || history[todayKey].xp !== xpToday) {
            history[todayKey] = { shifts: workToday, xp: xpToday };
            pruneOldHistory(history, maxDays);
            setValue('aw_workHistory', JSON.stringify(history));
        } else if (pruneOldHistory(history, maxDays)) {
            setValue('aw_workHistory', JSON.stringify(history));
        }

        return history;
    } catch (e) {
        console.error('[History] Failed to load:', e);
        return {};
    }
}

/** Persists the history object to storage. @param {object} history */
export function saveWorkHistory(history) {
    setValue('aw_workHistory', JSON.stringify(history));
}
