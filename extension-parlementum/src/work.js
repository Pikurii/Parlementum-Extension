/**
 * work.js — Core doWork() action: calls the Parlamentum API and updates state
 */

import { getCurrentEnergy, getSyncedEnergy, getNextWorkDelay, isSleepTime, getMsUntilSleepEnd, patchPageVisualEnergy, getEffectiveEnergyThreshold, isEnergyFlushActive } from './energy.js';
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
        if (state.currentEnergy < effectiveThreshold) {
            log(`Energi belum mencapai target (${state.currentEnergy}/${state.maxEnergy} EN • Target: ${effectiveThreshold} EN).`, 'warn');
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

    // 1. Primary Work Method: Native Page Button Click (ONLY when tab is in foreground)
    // Clicking the game's actual button lets React handle animations, XP toast, navbar,
    // progress bar, and component states natively when the user is actively viewing the page.
    // When tab is hidden/backgrounded, React throttles synthetic events, so we bypass directly to API fetch!
    const isTabForeground = typeof document !== 'undefined' && !document.hidden;
    const domBtn = isTabForeground ? _getDomWorkButton() : null;

    if (domBtn && _isButtonUsable(domBtn)) {
        state.workTriggeredViaDom = true;
        state.workInFlight = true;
        state.workInFlightAt = Date.now();

        const workCompletionPromise = new Promise(resolve => {
            const onMsg = (event) => {
                if (event?.data?.source === 'PARLAMENTUM_INTERCEPTOR') {
                    if (event.data.type === 'WORK_SUCCESS' || event.data.type === 'WORK_REJECTED') {
                        window.removeEventListener('message', onMsg);
                        resolve(event.data);
                    }
                }
            };
            window.addEventListener('message', onMsg);
            setTimeout(() => {
                window.removeEventListener('message', onMsg);
                resolve(null);
            }, 4000);
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

        // If timed out (res === null), the DOM click was delayed/ignored by React scheduler.
        // Seamlessly proceed to Method 2 (Direct API fetch) instead of falsely reporting success!
        log('Tombol game tidak merespon (tab background/idle). Beralih ke direct API fetch...', 'info');
    }

    // 2. Direct API Fetch (Background Tab & Resilient Fallback)
    // 100% reliable in background tabs, unfocused windows, and off-dashboard pages
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
        } else if (response.status === 404 || response.status === 405) {
            const clicked = _clickDomWorkButton();
            if (clicked) {
                log('Endpoint API tidak merespon (HTTP 404), mengeksekusi klik tombol kerja di halaman...', 'info');
                return 'worked';
            }
            log(`Error HTTP: ${response.status}`, 'error');
            return 'retry';
        } else {
            log(`Error HTTP: ${response.status}`, 'error');
            return 'retry';
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            return _handleTimeout(ctx, energyBefore);
        }
        console.error('[doWork] Error:', error);
        const clicked = _clickDomWorkButton();
        if (clicked) {
            log('Mengeksekusi klik tombol kerja di halaman (fallback)...', 'info');
            return 'worked';
        }
        log(`Gagal koneksi: ${error.message}`, 'error');
        return 'retry';
    } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
        state.workInFlight = false;
    }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _getDomWorkButton() {
    if (typeof document === 'undefined') return null;
    // Priority 1: Exact data-testid attribute from the game
    const testIdBtn = document.querySelector('button[data-testid="work"], button[data-tutorial-target="work"]');
    if (testIdBtn) return testIdBtn;

    // Priority 2: Text matching
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        const txt = (btn.textContent || '').trim();
        if (/KERJAKAN\s+SATU\s+GILIRAN/i.test(txt)) {
            return btn;
        }
    }
    // Priority 3: aria-label / title
    const candidates = document.querySelectorAll('button, [role="button"]');
    for (const el of candidates) {
        const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
        if (/KERJAKAN\s+SATU\s+GILIRAN/i.test(label)) {
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
        // Randomized click coordinates within button boundaries (35% to 65% area to avoid robotic center-only clicks)
        const offsetX = Math.floor(rect.width * (0.35 + Math.random() * 0.3));
        const offsetY = Math.floor(rect.height * (0.35 + Math.random() * 0.3));
        const clientX = Math.round(rect.left + offsetX);
        const clientY = Math.round(rect.top + offsetY);

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

function _clickDomWorkButton() {
    const btn = _getDomWorkButton();
    if (btn && _isButtonUsable(btn)) {
        return _triggerDomWorkClick(btn);
    }
    return false;
}

async function _handleSuccess(ctx, response, energy, energyBefore) {
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
        log(`Shift selesai tapi menghasilkan 0 XP (energi game saat ini: ${state.currentEnergy}/${state.maxEnergy} EN). Menunggu energi pulih...`, 'warn');
        state.nextWorkTimestamp = Date.now() + waitMs;
        updatePanel();
        return 'waiting';
    }

    const startingEnergy = (energyBefore && typeof energyBefore.current === 'number')
        ? energyBefore.current
        : ((energy && typeof energy.current === 'number') ? energy.current : (state.currentEnergy || 0));

    const available = Math.floor(startingEnergy / 10) * 10;
    const energySpent = hasReportedEnergy
        ? parsedEnergyUsed
        : (available > 0 ? available : 10);

    const calculatedXp = Math.max(4, Math.floor(energySpent / 10) * 4);
    const xpGained = Number.isSafeInteger(parsedXp) && parsedXp > 0
        ? parsedXp
        : calculatedXp;
    const units = Number(data?.workerUnits) || Number(data?.produced) || 0;

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

    // Optimistic energy update based on startingEnergy (never double subtract!)
    if (data?.energy != null && typeof data.energy === 'number') {
        state.currentEnergy = Math.max(0, Math.round(data.energy));
    } else {
        state.currentEnergy = Math.max(0, startingEnergy - energySpent);
    }
    state.energySyncBase = { current: state.currentEnergy, max: state.maxEnergy, updatedAt: Date.now() };
    state.lastWorkTimestamp = Date.now();
    state.domEnergyStale = true;

    // Instantly patch host page visual DOM so user doesn't see old pre-shift energy
    patchPageVisualEnergy(state.currentEnergy, state.maxEnergy, true);

    // Trigger native revalidation in Next.js / SWR / React Query
    try {
        window.dispatchEvent(new Event('focus'));
    } catch { /* ignore */ }

    // Fresh re-read of ground-truth page energy after UI updates
    setTimeout(() => {
        const fresh = getCurrentEnergy();
        if (fresh) {
            state.currentEnergy = fresh.current;
            state.maxEnergy = fresh.max;
            state.energySyncBase = { current: fresh.current, max: fresh.max, updatedAt: Date.now() };
            state.domEnergyStale = false;
            updatePanel?.();
        }
    }, 600);

    saveState(state);
    const unitsPart = units > 0 ? ` | +${units} unit` : '';
    log(`Kerja sukses! +${xpGained} XP${unitsPart}`, 'success');
    playNotificationSound(CONFIG, 'success');
    sendNotification(CONFIG, 'Parlamentum', `Kerja sukses! +${xpGained} XP${unitsPart}`);
    state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
    updatePanel();
    wakePendingWork?.();
    return 'worked';
}

function _handleUnauthorized(ctx) {
    const { state, CONFIG, log, setRunningUI, sendNotification, playNotificationSound, updatePanel } = ctx;
    log('Sesi token kedaluwarsa (401). Me-reload tab game dalam 2 detik untuk memperbarui token...', 'warn');
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
        log('Majikan Kehabisan Saldo! Kas perusahaan tidak cukup untuk membayar upah. Script dijeda.', 'error');
        state.running = false;
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
        const curEnergy = Math.max(0, Number(state.currentEnergy) || 0);
        const needed = Math.max(1, (CONFIG.energyThreshold || 90) - curEnergy);
        const rate = state.regenRate || 1.0;
        const waitMs = Math.max(60000, Math.round((needed / rate) * 60000));
        const waitMins = Math.round(waitMs / 60000);
        log(`Server menolak kerja (HTTP ${response.status}): ${serverMessage || 'Energi di server belum cukup'}. Menunggu target ${CONFIG.energyThreshold} EN (~${waitMins} mnt)...`, 'warn');
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
