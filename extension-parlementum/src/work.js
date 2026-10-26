/**
 * work.js — Core doWork() action: calls the Parlamentum API and updates state
 */

import { getCurrentEnergy, getSyncedEnergy, getNextWorkDelay, isSleepTime, getMsUntilSleepEnd, getEffectiveEnergyThreshold, isEnergyFlushActive, isDashboardPage } from './energy.js';
import { getTokenFromStorage } from './token.js';
import { saveState, saveLiveStatus } from './state.js';
import { saveWorkHistory } from './history.js';
import { setValue } from './storage.js';
import { getSavedCredentials } from './autologin.js';
import { broadcastTabMessage } from './broadcast.js';
import { calculateExponentialBackoff, checkMicroBreak } from './humanizer.js';

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

    if (!manual) {
        const brk = checkMicroBreak(state, CONFIG);
        if (brk.inBreak) {
            const m = Math.ceil(brk.remainingMs / 60000);
            if (brk.startingNow) {
                log(`[Micro-Break] Memulai jeda istirahat santai selama ${m} menit untuk naturalisasi bot...`, 'info');
            }
            state.nextWorkTimestamp = state.microBreakUntil;
            updatePanel?.();
            return 'waiting';
        }
        if (state.backoffUntil && Date.now() < state.backoffUntil) {
            state.nextWorkTimestamp = state.backoffUntil;
            return 'waiting';
        }
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
    if (!manual && isDashboardPage() && !state.hasInitialDomEnergyRead) return 'waiting';

    if (manual) {
        log('Menjalankan shift kerja manual...', 'info');
    }

    const energy = getSyncedEnergy(state);
    if (!energy) {
        log('Gagal membaca energi dari halaman. Mencoba lagi dalam 5 detik.', 'warn');
        state.nextWorkTimestamp = Date.now() + 5000;
        return 'retrySoon';
    }

    state.currentEnergy = energy.current;
    state.maxEnergy     = energy.max;

    if (!manual && state.serverCooldownUntil && Date.now() < state.serverCooldownUntil) {
        state.nextWorkTimestamp = state.serverCooldownUntil;
        updatePanel();
        return 'waiting';
    }

    if (!manual && state.lastWorkTimestamp && (Date.now() - state.lastWorkTimestamp < 45000)) {
        return 'waiting';
    }

    if (!manual && isSleepTime(CONFIG)) {
        const msUntilWake = getMsUntilSleepEnd(CONFIG);
        const wakeHour = String(CONFIG.sleepEndHour ?? 6).padStart(2, '0') + ':00';
        log(`Jam istirahat aktif (${CONFIG.sleepStartHour ?? 1}:00 - ${CONFIG.sleepEndHour ?? 6}:00 WIB). Auto Worker istirahat sampai pukul ${wakeHour}...`, 'info');
        state.nextWorkTimestamp = Date.now() + msUntilWake;
        updatePanel();
        return 'waiting';
    }

    const effectiveThreshold = getEffectiveEnergyThreshold(state, CONFIG);
    const isFlush = isEnergyFlushActive(CONFIG);

    if (manual) {
        if (state.currentEnergy < 10) {
            log(`Energi saat ini (${state.currentEnergy}/${state.maxEnergy} EN) belum cukup! Butuh minimal 10 EN untuk giliran kerja.`, 'warn');
            return 'waiting';
        }
    } else {
        if (state.currentEnergy < effectiveThreshold) {
            // Passive waiting in automated mode: do not pollute activity log with repeated warnings
            state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
            return 'waiting';
        }
        if (isFlush && state.currentEnergy >= 10 && (!state._lastLoggedFlushTime || Date.now() - state._lastLoggedFlushTime > 1800000)) {
            state._lastLoggedFlushTime = Date.now();
            log(`[Energy Flush 00:00 UTC] Jam emas aktif: Menguras sisa energi (${state.currentEnergy} EN) sebelum reset server.`, 'info');
        }
    }

    const energyBefore = getCurrentEnergy() || energy;

    // 1. Primary Work Method: Native Page Button Click on Dashboard
    // Clicking the game's actual button lets React handle animations, XP toast, navbar,
    // progress bar, and component states natively with 100% server reliability!
    const isTabForeground = typeof document !== 'undefined' && !document.hidden;
    const domBtn = (isDashboardPage() && isTabForeground) ? _getDomWorkButton() : null;

    if (domBtn && _isButtonUsable(domBtn)) {
        state.workTriggeredViaDom = true;
        state.workInFlight = true;
        state.workInFlightAt = Date.now();

        const workCompletionPromise = new Promise(resolve => {
            const onMsg = (event) => {
                if (!event || event.source !== window) return;
                const msg = event.data;
                if (!msg || msg.source !== 'PARLAMENTUM_INTERCEPTOR') return;
                if (msg.type === 'WORK_SUCCESS' || msg.type === 'WORK_REJECTED') {
                    window.removeEventListener('message', onMsg);
                    resolve(msg);
                }
            };
            window.addEventListener('message', onMsg);
            setTimeout(() => {
                window.removeEventListener('message', onMsg);
                resolve(null);
            }, 4500);
        });

        _triggerDomWorkClick(domBtn);
        if (manual) {
            log('Shift kerja manual dikirim via tombol game...', 'info');
        }

        const res = await workCompletionPromise;
        state.workInFlight = false;
        state.workTriggeredViaDom = false;

        if (res && res.type === 'WORK_SUCCESS') {
            state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
            updatePanel?.();
            return 'worked';
        }
        if (res && res.type === 'WORK_REJECTED') {
            updatePanel?.();
            return 'waiting';
        }

        // If timed out (res === null), seamlessly proceed to Direct API fetch
        log('Tombol game tidak merespons, beralih ke direct API request...', 'info');
    }

    // 2. Direct API Fetch (Background Tab & Resilient Fallback)
    state.workTriggeredViaDom = false;
    state.workInFlight = true;
    state.workInFlightAt = Date.now();
    let timeoutId = null;

    try {
        if (!state.currentToken) {
            getTokenFromStorage(state, (raw, src) => {
                return ctx.handleNewToken(raw, src);
            });
            if (!state.currentToken) {
                const storedToken = getValue('aw_auth_token');
                if (storedToken) {
                    ctx.handleNewToken(storedToken, 'storage');
                }
            }
            if (!state.currentToken) {
                log('Token tidak ditemukan! Pastikan sudah login di akun Parlementum.', 'error');
                return 'retry';
            }
        }

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
            return _handleSuccess(ctx, response, energy, energyBefore);
        } else if (response.status === 401) {
            return _handleUnauthorized(ctx);
        } else if (response.status === 400 || response.status === 422) {
            return _handleRejected(ctx, response);
        } else if (response.status >= 500 && response.status <= 504) {
            state.consecutiveErrors = (state.consecutiveErrors || 0) + 1;
            const backoffMs = calculateExponentialBackoff(state.consecutiveErrors);
            state.backoffUntil = Date.now() + backoffMs;
            state.nextWorkTimestamp = state.backoffUntil;
            log(`Gangguan server (HTTP ${response.status}). Percobaan ulang adaptif ke-${state.consecutiveErrors} dalam ${Math.round(backoffMs / 1000)} detik...`, 'warn');
            saveState(state);
            saveLiveStatus(state, CONFIG, true);
            updatePanel();
            return 'waiting';
        } else {
            log(`Error HTTP: ${response.status}`, 'error');
            return 'retry';
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            return _handleTimeout(ctx, energyBefore);
        }
        state.consecutiveErrors = (state.consecutiveErrors || 0) + 1;
        const backoffMs = calculateExponentialBackoff(state.consecutiveErrors);
        state.backoffUntil = Date.now() + backoffMs;
        state.nextWorkTimestamp = state.backoffUntil;
        console.error('[doWork] Error:', error);
        log(`Gagal koneksi: ${error.message}. Percobaan ulang adaptif ke-${state.consecutiveErrors} dalam ${Math.round(backoffMs / 1000)} detik...`, 'warn');
        updatePanel?.();
        return 'waiting';
    } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
        state.workInFlight = false;
    }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _getDomWorkButton() {
    if (typeof document === 'undefined') return null;

    const isExcluded = el => Boolean(
        !el || el.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast')
    );

    // Priority 1: Exact data-testid attribute from the game
    const testIdBtn = document.querySelector('button[data-testid="work"], button[data-tutorial-target="work"]');
    if (testIdBtn && !isExcluded(testIdBtn)) return testIdBtn;

    // Priority 2: Text matching ("KERJAKAN SATU GILIRAN", "KERJAKAN", "BEKERJA")
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        if (isExcluded(btn)) continue;
        const txt = (btn.textContent || '').trim();
        if (/KERJAKAN\s+SATU\s+GILIRAN/i.test(txt)) return btn;
    }
    for (const btn of buttons) {
        if (isExcluded(btn)) continue;
        const txt = (btn.textContent || '').trim();
        if (/(?:^|\b)(?:KERJAKAN|BEKERJA)(?:\b|$)/i.test(txt) && txt.length <= 25) return btn;
    }

    // Priority 3: aria-label / title
    const candidates = document.querySelectorAll('button, [role="button"]');
    for (const el of candidates) {
        if (isExcluded(el)) continue;
        const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
        if (/KERJAKAN\s+SATU\s+GILIRAN|BEKERJA/i.test(label)) {
            return el;
        }
    }
    return null;
}

function _isButtonUsable(btn) {
    if (!btn) return false;
    if (btn.disabled) return false;
    if (btn.getAttribute('aria-disabled') === 'true') return false;
    if (btn.classList.contains('disabled')) return false;
    if (btn.style.pointerEvents === 'none') return false;
    return true;
}

function _triggerDomWorkClick(btn) {
    if (!btn) return false;
    try {
        const rect = btn.getBoundingClientRect();
        const offsetX = Math.floor(rect.width * (0.35 + Math.random() * 0.3));
        const offsetY = Math.floor(rect.height * (0.35 + Math.random() * 0.3));
        const clientX = Math.round(rect.left + Math.max(1, offsetX));
        const clientY = Math.round(rect.top + Math.max(1, offsetY));

        const eventInit = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX,
            clientY,
            screenX: clientX + (window.screenX || 0),
            screenY: clientY + (window.screenY || 0),
            button: 0,
            buttons: 1
        };

        if (typeof PointerEvent !== 'undefined') {
            btn.dispatchEvent(new PointerEvent('pointerdown', eventInit));
        }
        btn.dispatchEvent(new MouseEvent('mousedown', eventInit));
        if (typeof PointerEvent !== 'undefined') {
            btn.dispatchEvent(new PointerEvent('pointerup', eventInit));
        }
        btn.dispatchEvent(new MouseEvent('mouseup', eventInit));
        btn.click();
        return true;
    } catch {
        btn.click();
        return true;
    }
}

async function _handleSuccess(ctx, response, energy, energyBefore) {
    const { state, CONFIG, workHistory, log, sendNotification, playNotificationSound, updatePanel, wakePendingWork } = ctx;

    let data = null;
    try { data = await response.json(); } catch (e) {
        if (e.name === 'AbortError') throw e;
        log('Respons server bukan JSON valid.', 'warn');
        return 'retry';
    }

    // Unwrap payload if nested in data.data or data.payload
    const payload = (data && typeof data === 'object' && data.data && typeof data.data === 'object')
        ? { ...data, ...data.data }
        : (data || {});

    const serverMsg = typeof payload.message === 'string' ? payload.message
        : (typeof payload.error === 'string' ? payload.error : '');
    const isEnergyRejection = payload.success === false ||
        Boolean(payload.error) ||
        /(?:not enough energy|produce even one unit|insufficient|tidak cukup|kurang|error|gagal|failed)/i.test(serverMsg);

    // Check if server returned failure / insufficient energy inside HTTP 200
    if (isEnergyRejection) {
        const nowMs = Date.now();
        state.currentEnergy = 0;
        state.postShiftEnergy = 0;
        state.lastWorkTimestamp = nowMs;
        state.domEnergyStale = true;
        state.energySyncBase = {
            current: 0,
            max: state.maxEnergy || 115,
            updatedAt: nowMs,
            regenRate: state.regenRate || 1.0
        };
        const target = Math.max(20, CONFIG.energyThreshold || 90);
        const rate = state.regenRate || 1.0;
        const waitMs = Math.max(120000, Math.round((target / rate) * 60000));
        state.serverCooldownUntil = nowMs + waitMs;
        state.nextWorkTimestamp = state.serverCooldownUntil;
        log(`Server menolak kerja: ${serverMsg || payload.error || 'Energi belum cukup'}. Menunggu target ${target} EN (~${Math.round(waitMs / 60000)} mnt)...`, 'warn');
        saveState(state);
        saveLiveStatus(state, CONFIG, true);
        broadcastTabMessage({
            type: 'WORK_SHIFT_COMPLETED',
            currentEnergy: 0,
            maxEnergy: state.maxEnergy || 115,
            energySyncBase: state.energySyncBase,
            serverCooldownUntil: state.serverCooldownUntil,
            nextWorkTimestamp: state.nextWorkTimestamp,
            timestamp: nowMs
        });
        updatePanel();
        return 'waiting';
    }

    const rawEnergyUsed = Number(payload.energyUsed) || Number(payload.energy_used) || 0;
    const rawXp = Number(payload.xpEarned) || Number(payload.xp_earned) || 0;
    const hasReportedEnergy = rawEnergyUsed >= 10 && rawEnergyUsed <= 350;
    const hasReportedXp = rawXp > 0;

    // Zero-gain shift
    if (payload.energyUsed === 0 || payload.xpEarned === 0) {
        const nowMs = Date.now();
        state.currentEnergy = 0;
        state.postShiftEnergy = 0;
        state.lastWorkTimestamp = nowMs;
        state.domEnergyStale = true;
        state.energySyncBase = { current: 0, max: state.maxEnergy || 115, updatedAt: nowMs, regenRate: state.regenRate || 1.0 };
        const waitMs = Math.max(10 * 60000, getNextWorkDelay(state, CONFIG));
        log(`Shift selesai tapi menghasilkan 0 XP. Menunggu energi pulih (~${Math.round(waitMs / 60000)} mnt)...`, 'warn');
        state.nextWorkTimestamp = nowMs + waitMs;
        saveState(state);
        saveLiveStatus(state, CONFIG, true);
        updatePanel();
        return 'waiting';
    }

    // STRICT CHECK: Never fabricate 40 XP if the server did not confirm it!
    // Never return 'retry' here: returning 'retry' caused infinite 10s server hammering!
    if (!hasReportedEnergy && !hasReportedXp) {
        const nowMs = Date.now();
        const waitMs = Math.max(120000, getNextWorkDelay(state, CONFIG));
        log(`Respons server tidak mengonfirmasi perolehan kerja. Menunggu siklus berikutnya (~${Math.round(waitMs / 60000)} mnt)...`, 'warn');
        state.nextWorkTimestamp = nowMs + waitMs;
        saveLiveStatus(state, CONFIG, true);
        updatePanel();
        return 'waiting';
    }

    const energySpent = hasReportedEnergy ? rawEnergyUsed : Math.floor(rawXp / 4) * 10;
    const xpGained = hasReportedXp ? rawXp : Math.floor(energySpent / 10) * 4;
    const units = Number(payload.workerUnits) || Number(payload.worker_units) || Number(payload.produced) || 0;

    if (xpGained <= 0) {
        log(`Shift tidak menghasilkan XP. Energi saat ini: ${state.currentEnergy}/${state.maxEnergy} EN.`, 'warn');
        updatePanel();
        return 'waiting';
    }

    // Update counters
    state.totalWorked++;
    state.workToday++;
    state.totalWorkXP  += xpGained;
    state.xpToday      += xpGained;
    state.totalEnergySpent          += energySpent;
    state.totalActualEnergySpent    += hasReportedEnergy ? rawEnergyUsed : 0;
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

    // Remaining energy update
    if (payload.energy != null && typeof payload.energy === 'number') {
        state.currentEnergy = Math.max(0, Math.round(payload.energy));
    } else if (payload.remainingEnergy != null && typeof payload.remainingEnergy === 'number') {
        state.currentEnergy = Math.max(0, Math.round(payload.remainingEnergy));
    } else {
        state.currentEnergy = Math.max(0, (state.currentEnergy || 0) - energySpent);
    }

    const nowMs = Date.now();
    state.shiftExecutedInSession = true;
    state.postShiftEnergy = state.currentEnergy;
    state.lastWorkTimestamp = nowMs;
    state.energySyncBase = { current: state.currentEnergy, max: state.maxEnergy, updatedAt: nowMs, regenRate: state.regenRate || 1.0 };
    state.domEnergyStale = true;

    // Fresh re-read of ground-truth page energy ONLY if DOM has actually updated and tab is visible
    setTimeout(() => {
        state.shiftExecutedInSession = false;
        const isTabHidden = typeof document !== 'undefined' && document.hidden;
        if (!isTabHidden) {
            const fresh = getCurrentEnergy();
            // Only accept DOM if it actually reflects post-shift consumed energy!
            if (fresh && fresh.current <= (state.postShiftEnergy ?? 0) + 2) {
                state.currentEnergy = fresh.current;
                state.maxEnergy = fresh.max;
                state.energySyncBase = { current: fresh.current, max: fresh.max, updatedAt: Date.now(), regenRate: state.regenRate || 1.0 };
                state.domEnergyStale = false;
                saveLiveStatus(state, CONFIG, true);
                updatePanel?.();
            }
        }
    }, 1500);

    saveState(state);
    saveLiveStatus(state, CONFIG, true);
    broadcastTabMessage({
        type: 'WORK_SHIFT_COMPLETED',
        currentEnergy: state.currentEnergy,
        maxEnergy: state.maxEnergy,
        energySyncBase: state.energySyncBase,
        lastWorkTime: state.lastWorkTime,
        lastWorkTimestamp: state.lastWorkTimestamp,
        workToday: state.workToday,
        xpToday: state.xpToday,
        totalWorked: state.totalWorked,
        totalWorkXP: state.totalWorkXP,
        nextWorkTimestamp: state.nextWorkTimestamp,
        timestamp: Date.now()
    });
    state.consecutive400Errors = 0;
    state.consecutiveErrors = 0;
    state.backoffUntil = 0;
    state.serverCooldownUntil = 0;
    if (energySpent > 0) {
        state.unitEnergyCost = Math.max(state.unitEnergyCost || 10, energySpent);
    }
    const unitsPart = units > 0 ? ` | +${units} unit` : '';
    log(`Kerja sukses! +${xpGained} XP${unitsPart}`, 'success');
    playNotificationSound(CONFIG, 'success');
    sendNotification(CONFIG, 'Parlamentum', `Kerja sukses! +${xpGained} XP${unitsPart}`);
    state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
    updatePanel();
    return 'worked';
}

function _handleUnauthorized(ctx) {
    const { state, CONFIG, log, setRunningUI, sendNotification, playNotificationSound, updatePanel, setValue } = ctx;
    state.pausedForToken = true;
    state.tokenExpired = true;

    let attempts = 0;
    try {
        attempts = parseInt(sessionStorage.getItem('aw_auth_reload_attempts') || '0', 10);
    } catch { /* ignore */ }

    if (attempts < 1) {
        try { sessionStorage.setItem('aw_auth_reload_attempts', (attempts + 1).toString()); } catch {}
        log('Sesi token kedaluwarsa (401). Me-reload tab game sekali untuk memperbarui sesi...', 'warn');
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    } else {
        state.running = false;
        setValue?.('aw_worker_running', 'false');
        setRunningUI?.(false);
        log('Sesi login telah kedaluwarsa (401). Auto Worker dijeda. Silakan login kembali di game.', 'error');
        sendNotification?.(CONFIG, 'Sesi Kedaluwarsa', 'Silakan login kembali di Parlamentum.');
    }
    updatePanel?.();
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
        log('Majikan Kehabisan Saldo! Kas perusahaan tidak cukup untuk membayar upah. Script dijeda.', 'error');
        state.running = false;
        ctx.setValue?.('aw_worker_running', 'false');
        setRunningUI(false);
        sendNotification(CONFIG, 'Parlamentum', 'Kas majikan habis! Pindah lowongan di Job Board.');
        return 'paused';
    }

    if (/region|wilayah|transit|travel|penerbangan/i.test(combined)) {
        log(`${serverMessage || 'Anda harus berada di wilayah perusahaan untuk bekerja (sedang dalam perjalanan)'}. Menunggu 3 menit...`, 'warn');
        state.nextWorkTimestamp = Date.now() + 3 * 60000;
        updatePanel();
        return 'waiting';
    }

    const isEnergyError = /(insufficient[_ ]energy|not enough energy|energi.{0,40}(?:tidak|belum|kurang)|produce even one unit)/i.test(combined);

    if (isEnergyError) {
        // Server indicates insufficient energy for unit production
        const nowMs = Date.now();
        state.currentEnergy = 0;
        state.postShiftEnergy = 0;
        state.lastWorkTimestamp = nowMs;
        state.domEnergyStale = true;
        state.energySyncBase = {
            current: 0,
            max: state.maxEnergy || 115,
            updatedAt: nowMs,
            regenRate: state.regenRate || 1.0
        };

        // Learn that the current job requires at least 20 EN per unit if 1 unit couldn't be produced
        if (!state.unitEnergyCost || state.unitEnergyCost < 20) {
            state.unitEnergyCost = 20;
        }
        // Lockout low-energy flush retries for 15 minutes so it doesn't repeatedly retry at 10 EN
        state.energyFlushLockoutUntil = nowMs + 15 * 60000;

        const target = Math.max(20, CONFIG.energyThreshold || 90);
        const rate = state.regenRate || 1.0;
        const waitMs = Math.max(120000, Math.round((target / rate) * 60000));
        const waitMins = Math.round(waitMs / 60000);

        state.serverCooldownUntil = nowMs + waitMs;
        state.nextWorkTimestamp = state.serverCooldownUntil;

        state.consecutive400Errors = (state.consecutive400Errors || 0) + 1;
        if (state.consecutive400Errors >= 3) {
            const backoffMs = Math.min(600000, 180000 * Math.pow(1.5, state.consecutive400Errors - 3));
            state.serverCooldownUntil = Math.max(state.serverCooldownUntil, nowMs + backoffMs);
            state.nextWorkTimestamp = state.serverCooldownUntil;
            log(`[Cooldown Darurat] Terdeteksi ${state.consecutive400Errors} penolakan beruntun dari server. Jeda darurat aktif ${Math.round(backoffMs / 60000)} menit untuk melindungi akun.`, 'warn');
        } else {
            log(`Server menolak kerja (HTTP ${response.status}): ${serverMessage || 'Energi di server belum cukup'}. Menunggu target ${target} EN (~${waitMins} mnt)...`, 'warn');
        }

        saveState(state);
        saveLiveStatus(state, CONFIG, true);
        broadcastTabMessage({
            type: 'WORK_SHIFT_COMPLETED',
            currentEnergy: state.currentEnergy,
            maxEnergy: state.maxEnergy || 115,
            energySyncBase: state.energySyncBase,
            serverCooldownUntil: state.serverCooldownUntil,
            nextWorkTimestamp: state.nextWorkTimestamp,
            timestamp: nowMs
        });
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
    setValue('aw_worker_running', 'false');
    setRunningUI(false);
    log('Request kerja timeout (15 detik). Hasil belum pasti; script dijeda. Muat ulang halaman setelah memeriksa status kerja.', 'error');
    ctx.reconcileUncertainWork?.();
    updatePanel();
    return 'uncertain';
}
