/**
 * work.js — Core doWork() action: calls the Parlamentum API and updates state
 */

import { getCurrentEnergy, getSyncedEnergy, getNextWorkDelay, isSleepTime, getMsUntilSleepEnd, patchPageVisualEnergy } from './energy.js';
import { getTokenFromStorage } from './token.js';
import { saveState, saveLiveStatus } from './state.js';
import { saveWorkHistory } from './history.js';
import { setValue } from './storage.js';
import { getSavedCredentials } from './autologin.js';

/**
 * @param {object} ctx - { state, CONFIG, workHistory, log, setRunningUI, sendNotification, playNotificationSound, updatePanel, wakePendingWork }
 * @param {boolean} manual
 * @returns {Promise<'worked'|'waiting'|'paused'|'retry'|'retrySoon'|'busy'|'uncertain'|'standby'>}
 */
export async function doWork(ctx, manual = false) {
    const { state, CONFIG, workHistory, log, setRunningUI, sendNotification, playNotificationSound, updatePanel, wakePendingWork } = ctx;

    if (!manual && state.tabLockManaged && !state.isTabLockOwner) return 'standby';
    if (state.workResultUncertain) {
        log('Hasil request kerja sebelumnya belum pasti. Muat ulang halaman untuk sinkronisasi sebelum mencoba lagi.', 'error');
        return 'paused';
    }
    if (state.workInFlight) {
        if (Date.now() - (state.workInFlightAt || 0) > 15000) {
            state.workInFlight = false;
        } else {
            return 'busy';
        }
    }

    // Guard: don't set workInFlight until after all cheap checks
    if (!state.running && !manual) return 'paused';

    if (manual) {
        log('⚡ Menjalankan shift kerja manual...', 'info');
    }

    state.workInFlight = true;
    state.workInFlightAt = Date.now();
    let timeoutId = null;
    let energyBefore = null;

    try {
        if (!state.currentToken) {
            getTokenFromStorage(state, (raw, src) => {
                // Import handleNewToken inline to avoid circular import
                return ctx.handleNewToken(raw, src);
            });
            if (!state.currentToken) {
                log('Token tidak ditemukan! Pastikan sudah login di akun Parlementum.', 'error');
                return 'retry';
            }
        }

        const energy = getSyncedEnergy(state);
        if (!energy) {
            log('Gagal membaca energi dari halaman. Mencoba lagi dalam 5 detik.', 'warn');
            state.nextWorkTimestamp = Date.now() + 5000;
            return 'retrySoon';
        }

        state.currentEnergy = energy.current;
        state.maxEnergy     = energy.max;

        if (!manual && isSleepTime(CONFIG)) {
            const msUntilWake = getMsUntilSleepEnd(CONFIG);
            const wakeHour = String(CONFIG.sleepEndHour ?? 6).padStart(2, '0') + ':00';
            log(`🌙 Jam istirahat aktif (${CONFIG.sleepStartHour ?? 1}:00 - ${CONFIG.sleepEndHour ?? 6}:00 WIB). Auto Worker tidur sampai pukul ${wakeHour}...`, 'info');
            state.nextWorkTimestamp = Date.now() + msUntilWake;
            updatePanel();
            return 'waiting';
        }

        if (state.currentEnergy < 10 && manual) {
            log(`⚠️ Energi saat ini (${state.currentEnergy}/${state.maxEnergy}⚡) belum cukup! Butuh minimal 10⚡ untuk giliran kerja.`, 'warn');
            return 'waiting';
        }

        if (state.currentEnergy < CONFIG.energyThreshold && !manual) {
            log(`Energi belum cukup (${state.currentEnergy}/${CONFIG.energyThreshold})`, 'warn');
            state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
            return 'waiting';
        }

        energyBefore = getCurrentEnergy() || energy;

        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch('https://parlamentum.org/api/player/work', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': state.currentToken,
                'Accept': '*/*'
            },
            credentials: 'include',
            signal: controller.signal,
            body: JSON.stringify({})
        });

        if (response.ok) {
            return _handleSuccess(ctx, response, energy);
        } else if (response.status === 401) {
            return _handleUnauthorized(ctx);
        } else if (response.status === 400 || response.status === 422) {
            return _handleRejected(ctx, response);
        } else {
            log(`Error HTTP: ${response.status}`, 'error');
            return 'retry';
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            return _handleTimeout(ctx, energyBefore);
        }
        console.error('[doWork] Error:', error);
        log(`Gagal koneksi: ${error.message}`, 'error');
        return 'retry';
    } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
        state.workInFlight = false;
    }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function _handleSuccess(ctx, response, energy) {
    const { state, CONFIG, workHistory, log, sendNotification, playNotificationSound, updatePanel, wakePendingWork } = ctx;

    let data = null;
    try { data = await response.json(); } catch (e) {
        if (e.name === 'AbortError') throw e;
        log('Respons kerja sukses, tetapi data tidak terbaca; memakai nilai fallback.', 'warn');
    }

    const parsedEnergyUsed = data?.energyUsed != null ? Number(data.energyUsed) : NaN;
    const isReportedZeroEnergy = Number.isSafeInteger(parsedEnergyUsed) && parsedEnergyUsed === 0;
    const hasReportedEnergy = Number.isSafeInteger(parsedEnergyUsed) && parsedEnergyUsed >= 10 && parsedEnergyUsed <= 350;

    const parsedXp = data?.xpEarned != null ? Number(data.xpEarned) : NaN;
    const isReportedZeroXp = Number.isSafeInteger(parsedXp) && parsedXp === 0;

    // Zero-gain shift: server gave 0 XP or 0 energy used (not enough energy to produce 1 unit or server energy is 0)
    if (isReportedZeroEnergy || isReportedZeroXp || data?.error || (typeof data?.message === 'string' && /energy|unit/i.test(data.message))) {
        const fresh = getCurrentEnergy();
        if (fresh) {
            state.currentEnergy = fresh.current;
            state.maxEnergy     = fresh.max;
            state.energySyncBase = { current: fresh.current, max: fresh.max, updatedAt: Date.now() };
        } else {
            state.currentEnergy = 0;
            state.energySyncBase = { current: 0, max: state.maxEnergy || 115, updatedAt: Date.now() };
        }
        const waitMs = Math.max(10 * 60000, getNextWorkDelay(state, CONFIG));
        const waitMins = Math.round(waitMs / 60000);
        log(`Shift selesai tapi menghasilkan 0 XP (energi game saat ini: ${state.currentEnergy}/${state.maxEnergy}⚡). Menunggu energi pulih...`, 'warn');
        state.nextWorkTimestamp = Date.now() + waitMs;
        updatePanel();
        return 'waiting';
    }

    const available = Math.floor(state.currentEnergy / 10) * 10;
    const fallbackBlocks = Math.floor(available / 10);
    const xpGained = Number.isSafeInteger(parsedXp) && parsedXp > 0
        ? parsedXp
        : (hasReportedEnergy ? Math.floor(parsedEnergyUsed / 10) * 4 : fallbackBlocks * 4);

    if (xpGained <= 0) {
        log(`Shift tidak menghasilkan XP. Energi saat ini: ${state.currentEnergy}/${state.maxEnergy}⚡.`, 'warn');
        updatePanel();
        return 'waiting';
    }

    const energySpent  = hasReportedEnergy ? parsedEnergyUsed : Math.max(10, available);

    // Update counters
    state.totalWorked++;
    state.workToday++;
    state.totalWorkXP  += xpGained;
    state.xpToday      += xpGained;
    state.totalEnergySpent          += energySpent;
    state.totalActualEnergySpent    += hasReportedEnergy ? parsedEnergyUsed : 0;
    state.totalEstimatedEnergySpent += hasReportedEnergy ? 0 : energySpent;
    state.lastWorkTime = new Date().toLocaleTimeString('id-ID');

    // Update daily history
    const todayKey = new Date().toDateString();
    let history = workHistory || ctx?.workHistory;
    if (typeof history === 'string') {
        try { history = JSON.parse(history); } catch { history = {}; }
    }
    if (!history || typeof history !== 'object') history = {};
    if (!history[todayKey]) history[todayKey] = { shifts: 0, xp: 0 };
    const today = history[todayKey];
    today.shifts = (today.shifts || 0) + 1;
    today.xp     = (today.xp || 0) + xpGained;
    today.energySpent           = (today.energySpent || 0) + (hasReportedEnergy ? energySpent : 0);
    today.estimatedEnergySpent  = (today.estimatedEnergySpent || 0) + (hasReportedEnergy ? 0 : energySpent);
    today.energyDataShifts      = (today.energyDataShifts || 0) + (hasReportedEnergy ? 1 : 0);
    saveWorkHistory(history);
    if (ctx) ctx.workHistory = history;

    // Optimistic energy update (prevents race conditions)
    state.currentEnergy = Math.max(0, state.currentEnergy - energySpent);
    state.energySyncBase = { current: state.currentEnergy, max: state.maxEnergy, updatedAt: Date.now() };
    state.lastWorkTimestamp = Date.now();
    state.domEnergyStale = true;

    // Instantly patch host page visual DOM so user doesn't see old pre-shift energy
    patchPageVisualEnergy(state.currentEnergy, state.maxEnergy, true);

    // Trigger native revalidation in Next.js / SWR / React Query
    try {
        window.dispatchEvent(new Event('focus'));
    } catch { /* ignore */ }

    saveState(state);
    log(`Kerja sukses! +${xpGained} XP | Sisa: ${state.currentEnergy}/${state.maxEnergy}⚡`, 'success');
    playNotificationSound(CONFIG, 'success');
    sendNotification(CONFIG, 'Parlamentum', `Kerja sukses! +${xpGained} XP`);
    state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
    updatePanel();
    wakePendingWork?.();
    return 'worked';
}

function _handleUnauthorized(ctx) {
    const { state, CONFIG, log, setRunningUI, sendNotification, playNotificationSound, updatePanel } = ctx;
    log('🔄 Sesi token kedaluwarsa (401). Me-reload tab game dalam 2 detik untuk memperbarui token via session cookie...', 'warn');
    state.pausedForToken = true;
    setTimeout(() => {
        window.location.reload();
    }, 2000);
    return 'paused';
}

async function _handleRejected(ctx, response) {
    const { state, CONFIG, log, setRunningUI, sendNotification, updatePanel } = ctx;

    const errorText = await response.text();
    let serverMessage = '';
    try {
        const parsed = JSON.parse(errorText);
        if (typeof parsed === 'string') serverMessage = parsed;
        else if (parsed && typeof parsed === 'object') {
            serverMessage = [parsed.message, parsed.error, parsed.detail, parsed.reason]
                .find(v => typeof v === 'string') || '';
        }
    } catch { /* ignore */ }

    if (!serverMessage) serverMessage = errorText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    serverMessage = serverMessage.slice(0, 240);

    const combined = `${errorText} ${serverMessage}`;

    if (/wallet|wage/i.test(combined)) {
        log('❌ Majikan Kehabisan Saldo! Kas perusahaan tidak cukup untuk membayar upah. Script di-pause.', 'error');
        state.running = false;
        setRunningUI(false);
        sendNotification(CONFIG, 'Parlamentum', 'Kas majikan habis! Pindah lowongan di Job Board.');
        return 'paused';
    }

    if (/region|wilayah|transit|travel|penerbangan/i.test(combined)) {
        log(`⚠️ ${serverMessage || 'Anda harus berada di wilayah perusahaan untuk bekerja (sedang dalam perjalanan)'}. Menunggu 3 menit...`, 'warn');
        state.nextWorkTimestamp = Date.now() + 3 * 60000;
        updatePanel();
        return 'waiting';
    }

    const isEnergyError = /(insufficient[_ ]energy|not enough energy|energi.{0,40}(?:tidak|belum|kurang)|produce even one unit)/i.test(combined);

    if (isEnergyError) {
        // Server indicates insufficient energy for unit production
        const curEnergy = Math.max(0, Number(state.currentEnergy) || 0);
        const needed = Math.max(1, (CONFIG.energyThreshold || 90) - curEnergy);
        const rate = state.regenRate || 1.0;
        const waitMs = Math.max(60000, Math.round((needed / rate) * 60000));
        const waitMins = Math.round(waitMs / 60000);
        log(`Server menolak kerja (HTTP ${response.status}): ${serverMessage || 'Energi di server belum cukup'}. Menunggu target ${CONFIG.energyThreshold}⚡ (~${waitMins} mnt)...`, 'warn');
        state.nextWorkTimestamp = Date.now() + waitMs;
        saveState(state);
        saveLiveStatus(state, CONFIG, true);
        updatePanel();
        return 'waiting';
    }

    log(`Server menolak kerja (HTTP ${response.status})${serverMessage ? `: ${serverMessage}` : ''}`, 'error');
    state.running = false;
    setRunningUI(false);
    saveState(state);
    saveLiveStatus(state, CONFIG, true);
    updatePanel();
    sendNotification(CONFIG, 'Parlamentum Auto Worker dijeda', serverMessage || `Server menolak (HTTP ${response.status}).`);
    return 'paused';
}

function _handleTimeout(ctx, energyBefore) {
    const { state, log, setRunningUI, updatePanel, setValue } = ctx;
    state.workResultUncertain    = true;
    state.uncertainReconciliation = 'pending';
    ctx.uncertainEnergyBefore    = energyBefore;
    setValue('aw_workResultUncertain', 'true');
    setValue('aw_uncertainEnergyBefore', JSON.stringify(energyBefore));
    state.running = false;
    setRunningUI(false);
    log('Request kerja timeout (15 detik). Hasil belum pasti; script dijeda. Muat ulang halaman setelah memeriksa status kerja.', 'error');
    ctx.reconcileUncertainWork?.();
    updatePanel();
    return 'uncertain';
}
