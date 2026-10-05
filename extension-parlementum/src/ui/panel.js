/**
 * ui/panel.js — Main floating panel injected into the page
 *
 * Extracted from createPanel(), updatePanel(), setupDragAndDrop(),
 * setupPanelControls(), setupResponsiveBehavior() in Extension.js.
 * All logic is identical — only imports replace global variable references.
 */

import { getLiveCountdown, getTimeToFullEnergy, getTimeToFullEnergy as ttfe, patchPageVisualEnergy } from '../energy.js';
import { getTimeUntilExpiry } from '../token.js';
import { getValue, setValue } from '../storage.js';
import { saveState, saveLiveStatus } from '../state.js';
import { ICONS } from './icons.js';

const HEADER_BTN_STYLE = `
    background: transparent; border: none; cursor: pointer; padding: 0;
    border-radius: 6px; display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; min-width: 24px; max-width: 24px; flex-shrink: 0 !important;
    transition: all 0.15s ease; color: #8892b0; line-height: 1; box-sizing: border-box;
`;

function _injectPanelStyles() {
    if (typeof document === 'undefined' || document.getElementById('aw-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'aw-panel-styles';
    style.textContent = `
        @keyframes aw-pulse-glow {
            0% {
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 10px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 16px 44px rgba(0, 0, 0, 0.65), 0 0 20px rgba(0, 255, 136, 0.65);
                border-color: rgba(0, 255, 136, 0.85);
            }
            100% {
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 10px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        @keyframes aw-pill-pulse-glow {
            0% {
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 10px 28px rgba(0, 0, 0, 0.75), 0 0 18px rgba(0, 255, 136, 0.75);
                border-color: rgba(0, 255, 136, 0.9);
            }
            100% {
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        .aw-ready-glow {
            animation: aw-pulse-glow 2.2s infinite ease-in-out !important;
        }
        #aw-pill-container.aw-ready-glow {
            animation: aw-pill-pulse-glow 2.2s infinite ease-in-out !important;
        }
        .aw-btn-action {
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
            outline: none !important;
            user-select: none !important;
        }
        .aw-btn-action:hover:not(:disabled) {
            filter: brightness(1.15) !important;
            transform: translateY(-1.5px) !important;
        }
        .aw-btn-action:active:not(:disabled) {
            transform: translateY(0.5px) scale(0.97) !important;
            filter: brightness(0.92) !important;
        }
        .aw-header-btn {
            transition: all 0.15s ease !important;
            border-radius: 6px !important;
        }
        .aw-header-btn:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: #fff !important;
        }
        .aw-pill-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            outline: none !important;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
            user-select: none !important;
            padding: 0 !important;
        }
        .aw-pill-btn:hover:not(:disabled) {
            filter: brightness(1.2) !important;
            transform: scale(1.08) !important;
        }
        .aw-pill-btn:active:not(:disabled) {
            transform: scale(0.94) !important;
        }
        .aw-pill-box:hover {
            border-color: rgba(255, 255, 255, 0.25) !important;
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.75), 0 0 14px rgba(0, 217, 255, 0.22) !important;
        }
    `;
    document.head.appendChild(style);
}

export function isDashboardPage() {
    if (typeof window === 'undefined') return true;
    const pathname = window.location.pathname || '';
    const cleanPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    return cleanPath === '/dashboard' || cleanPath.startsWith('/dashboard/') || cleanPath === '/' || cleanPath === '';
}

export function shouldPanelBeVisible(state, CONFIG) {
    if (CONFIG.panelDashboardOnly && !isDashboardPage()) {
        return false;
    }
    if (CONFIG.panelLeaderOnly && state.tabLockManaged && !state.isTabLockOwner) {
        if (typeof document !== 'undefined' && document.hidden) {
            return false;
        }
    }
    if (state.panelVisible === false) {
        return false;
    }
    return true;
}

export function updatePanelVisibility(state, CONFIG) {
    const panel = document.getElementById('aw-panel');
    if (!panel) return;
    const visible = state.userManuallyToggledPanel ? Boolean(state.panelVisible) : shouldPanelBeVisible(state, CONFIG);
    panel.style.display = visible ? 'block' : 'none';
}

/** @param {object} state @param {object} CONFIG @param {object} ctx */
export function createPanel(state, CONFIG, ctx) {
    const old = document.getElementById('aw-panel');
    if (old) old.remove();

    _injectPanelStyles();

    state.userManuallyToggledPanel = false;
    if (CONFIG.panelDashboardOnly && isDashboardPage()) {
        state.panelVisible = true;
        setValue('panelVisible', 'true');
    }

    setTimeout(() => {
        const panel = document.createElement('div');
        panel.id = 'aw-panel';
        panel.style.cssText = `
            position: fixed; top: ${state.panelY}px; left: ${state.panelX}px;
            color: #e0e0e0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            z-index: 99999;
            box-sizing: border-box;
            user-select: none;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
            overflow: visible;
            display: ${shouldPanelBeVisible(state, CONFIG) ? 'block' : 'none'};
        `;
        panel.innerHTML = _buildPanelHTML(state, CONFIG);
        document.body.appendChild(panel);
        applyPanelMode(state, Boolean(state.panelMinimized));
        _setupDragAndDrop(panel, state, CONFIG);
        _setupPanelControls(panel, state, CONFIG, ctx);
        _setupResponsiveBehavior(panel, state, CONFIG);

        // Eco-Mode Wakeup: instantly re-render UI when tab is brought to foreground
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                ctx.updatePanel?.();
            }
        });

        ctx.log('Panel v5.11.0 siap!', 'success');
    }, 250);
}

/** @param {object} state @param {object} CONFIG @param {object} workHistory @param {object} ctx */
export function updatePanel(state, CONFIG, workHistory, ctx) {
    if (!chrome.runtime?.id) return;
    const { getSyncedEnergy, getPlayerLevel, getMaxEnergyForLevel } = ctx;

    if (!state.userManuallyToggledPanel) {
        updatePanelVisibility(state, CONFIG);
    }

    // Reload state in standby tabs
    if (state.tabLockManaged && !state.isTabLockOwner) {
        const now = Date.now();
        if (now - (updatePanel._lastStandby || 0) >= 3000) {
            ctx.reloadStateFromStorage?.();
            updatePanel._lastStandby = now;
        }
    }

    const energy = ctx.getSyncedEnergy(state);
    if (energy) {
        state.currentEnergy = energy.current;
        state.maxEnergy = energy.max;
        if (state.domEnergyStale) {
            patchPageVisualEnergy(state.currentEnergy, state.maxEnergy);
        }
    }

    // Keep next work schedule accurately synchronized with current energy
    if (state.currentEnergy < CONFIG.energyThreshold) {
        const rate = state.regenRate || 1.0;
        const neededMs = Math.max(1, (CONFIG.energyThreshold - state.currentEnergy) / rate) * 60000;
        if (!state.nextWorkTimestamp) {
            state.nextWorkTimestamp = Date.now() + neededMs;
        } else if (state.nextWorkTimestamp > Date.now()) {
            const remaining = state.nextWorkTimestamp - Date.now();
            if (Math.abs(remaining - neededMs) > 120000) {
                state.nextWorkTimestamp = Date.now() + neededMs;
            }
        }
    } else if (state.running && state.isTabLockOwner && !state.workInFlight && !state.workResultUncertain) {
        if (!state.nextWorkTimestamp || Date.now() >= state.nextWorkTimestamp) {
            state.nextWorkTimestamp = Date.now();
            ctx.wakePendingWork?.();
        }
    }

    const newLevel = ctx.getPlayerLevel(state);
    if (newLevel !== state.playerLevel) {
        state.playerLevel = newLevel;
        if (!energy) {
            const max = getMaxEnergyForLevel(newLevel);
            if (max !== state.maxEnergy) state.maxEnergy = max;
        }
    }

    const energyFull = state.maxEnergy > 0 && state.currentEnergy >= state.maxEnergy;
    if (!energyFull) {
        state.energyFullAlertActive = false;
    } else if (CONFIG.energyFullAlertEnabled && !state.energyFullAlertActive) {
        state.energyFullAlertActive = true;
        if (!state.tabLockManaged || state.isTabLockOwner) {
            ctx.log(`Energi penuh (${state.currentEnergy}/${state.maxEnergy})! Mengeksekusi shift...`, 'warn');
            ctx.playEnergyFullAlarm?.(CONFIG);
            ctx.sendNotification?.(CONFIG, 'Energi Penuh', `Energi ${state.currentEnergy}/${state.maxEnergy}. Siap bekerja.`);
        }
        if (state.running && state.isTabLockOwner && !state.workInFlight && !state.workResultUncertain) {
            if (!state.nextWorkTimestamp || Date.now() >= state.nextWorkTimestamp) {
                state.nextWorkTimestamp = Date.now();
                ctx.wakePendingWork?.();
            }
        }
    }

    // Region & Buff auto-detection
    if (ctx.getRegionDetails) {
        const reg = ctx.getRegionDetails();
        if (reg) {
            if (reg.name && reg.name !== state.regionName) {
                state.regionName = reg.name;
            }
            if (reg.bonusPercent !== state.regionHealthBonusPercent) {
                state.regionHealthBonusPercent = reg.bonusPercent;
            }
            if (reg.bonusMultiplier && reg.bonusMultiplier !== state.regenRate) {
                state.regenRate = reg.bonusMultiplier;
            }
            _patchEl('aw-region-name', el => el.textContent = state.regionName || 'Wilayah');
            _patchEl('aw-region-buff', el => {
                el.textContent = state.regionHealthBonusPercent > 0
                    ? `+${state.regionHealthBonusPercent}% Regen`
                    : 'Normal (1.0x)';
            });
        }
    }

    // Eco-Mode: Skip all visual DOM modifications if tab is in the background
    // Conserves RAM and CPU while keeping timers and work scheduler 100% accurate
    const isHidden = typeof document !== 'undefined' && document.hidden;
    if (CONFIG.ecoModeEnabled !== false && isHidden) {
        if (!state.tabLockManaged || state.isTabLockOwner) {
            saveLiveStatus(state, CONFIG);
        }
        return;
    }

    const threshold = CONFIG.energyThreshold || 10;
    const isReadyToWork = state.currentEnergy >= threshold;

    // Dynamic glow on panel & pill when ready to work
    const panelEl = document.getElementById('aw-panel');
    const pillEl  = document.getElementById('aw-pill-container');
    if (panelEl) {
        if (isReadyToWork && state.running && !state.workInFlight) {
            panelEl.classList.add('aw-ready-glow');
            if (pillEl) pillEl.classList.add('aw-ready-glow');
        } else {
            panelEl.classList.remove('aw-ready-glow');
            if (pillEl) pillEl.classList.remove('aw-ready-glow');
        }
    }

    // DOM updates
    const safeMax = (state.maxEnergy && state.maxEnergy > 0) ? state.maxEnergy : 110;
    const energyPct = Math.max(0, Math.min(100, (state.currentEnergy / safeMax) * 100));
    _patchEl('aw-energy-text',   el => el.textContent = `${state.currentEnergy}/${state.maxEnergy}`);
    _patchEl('aw-energy-bar',    el => el.style.width  = `${energyPct}%`);
    const liveCountdown = getLiveCountdown(state, CONFIG);
    _patchEl('aw-next-work',     el => {
        el.textContent = liveCountdown;
        el.style.color = isReadyToWork ? '#00ff88' : '#00d9ff';
    });
    _patchEl('aw-full-energy',   el => el.textContent  = getTimeToFullEnergy(state));

    // Pill live updates
    _patchEl('aw-pill-energy', el => el.textContent = `${state.currentEnergy}/${state.maxEnergy}`);
    _patchEl('aw-pill-countdown', el => {
        el.textContent = isReadyToWork ? 'Siap!' : liveCountdown;
        el.style.color = isReadyToWork ? '#00ff88' : '#00d9ff';
    });
    _patchEl('aw-pill-countdown-icon', el => {
        el.textContent = isReadyToWork ? '⚡' : '⏳';
    });
    _patchEl('aw-pill-status-dot', el => {
        const dotColor = state.workResultUncertain ? '#ffaa00' : (state.running ? '#00ff88' : '#ff4757');
        el.style.background = dotColor;
        el.style.boxShadow  = `0 0 8px ${dotColor}`;
    });
    _patchEl('aw-pill-container', el => {
        const statusText = state.workResultUncertain
            ? '⚠️ Hasil kerja belum pasti!'
            : (state.running ? 'Sedang Berjalan' : 'Di-pause');
        el.title = `Auto Worker: ${statusText}\n⚡ Energi: ${state.currentEnergy}/${state.maxEnergy}\n⏳ Giliran: ${liveCountdown}\n📊 Hari ini: ${state.workToday}x (+${state.totalWorkXP} XP)\n\n(Seret untuk geser posisi • Klik 2x untuk perbesar)`;
    });

    // Clock time tooltips (Hover to see exact time)
    _patchEl('aw-next-wrap', el => {
        if (isReadyToWork) {
            el.title = '⚡ Energi sudah mencapai target! Siap bekerja.';
        } else if (state.nextWorkTimestamp && state.nextWorkTimestamp > Date.now()) {
            const d = new Date(state.nextWorkTimestamp);
            const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            el.title = `Estimasi giliran kerja: pk. ${timeStr} WIB`;
        } else {
            el.title = 'Menunggu energi pulih...';
        }
    });

    _patchEl('aw-full-wrap', el => {
        const needed = (state.maxEnergy || 115) - (state.currentEnergy || 0);
        if (needed <= 0) {
            el.title = '⚡ Energi sudah 100% penuh!';
        } else {
            const rate = state.regenRate || 1.0;
            const fullMs = Math.round((needed / rate) * 60000);
            const d = new Date(Date.now() + fullMs);
            const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            el.title = `Estimasi energi 100% penuh: pk. ${timeStr} WIB`;
        }
    });

    _patchEl('aw-today',         el => el.textContent  = `${state.workToday}x`);
    _patchEl('aw-worked',        el => el.textContent  = `${state.totalWorked}x`);
    _patchEl('aw-xp',            el => el.textContent  = `+${state.totalWorkXP} XP`);
    _patchEl('aw-token-status',  el => {
        const isExpired = Boolean(
            state.tokenExpired ||
            state.pausedForToken ||
            (state.tokenExpiry && Number(state.tokenExpiry) <= Date.now())
        );
        if (isExpired) {
            el.textContent = 'EXPIRED';
            el.style.color = '#ff4444';
        } else if (state.currentToken) {
            el.textContent = 'VALID';
            el.style.color = '#00ff88';
        } else {
            el.textContent = 'NOT FOUND';
            el.style.color = '#ffaa00';
        }
    });
    _patchEl('aw-token-expiry',  el => el.textContent = getTimeUntilExpiry(state));
    _patchEl('aw-uncertain-banner', el => el.style.display = state.workResultUncertain ? 'block' : 'none');
    _patchEl('aw-reconciliation-status', el => {
        el.textContent = state.uncertainReconciliation === 'energy_changed'
            ? 'Status rekonsiliasi: perubahan energi terdeteksi; konfirmasi manual tetap diperlukan.'
            : 'Status rekonsiliasi: menunggu pembacaan energi.';
    });

    const blocked = state.workResultUncertain || (state.tabLockManaged && !state.isTabLockOwner);
    _patchEl('aw-work-now', el => el.disabled = blocked);
    _patchEl('aw-toggle',   el => el.disabled = blocked);
    _patchEl('aw-pill-toggle', el => el.disabled = blocked);

    if (!state.tabLockManaged || state.isTabLockOwner || !document.hidden) {
        saveLiveStatus(state, CONFIG);
    }
}

/** Updates only the running indicator buttons — called from doWork on pause/resume. */
export function setRunningUI(running) {
    _patchEl('aw-toggle', el => {
        el.textContent = running ? '⏸ Pause' : '▶ Resume';
        el.style.background = running
            ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
            : 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        el.style.boxShadow = `0 2px 8px ${running ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`;
    });
    _patchEl('aw-status-dot', el => {
        el.style.background = running ? '#00ff88' : '#ff4757';
        el.style.boxShadow  = `0 0 8px ${running ? '#00ff88' : '#ff4757'}`;
    });
    _patchEl('aw-pill-toggle', el => {
        el.textContent = running ? '⏸' : '▶';
        el.title = running ? 'Pause Worker' : 'Resume Worker';
        el.style.background = running
            ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
            : 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        el.style.boxShadow = `0 2px 6px ${running ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)'}`;
    });
    _patchEl('aw-pill-status-dot', el => {
        el.style.background = running ? '#00ff88' : '#ff4757';
        el.style.boxShadow  = `0 0 8px ${running ? '#00ff88' : '#ff4757'}`;
    });
}

export function setTabLockOwner(state, isOwner, ctx) {
    state.isTabLockOwner = isOwner;
    if (ctx?.CONFIG) {
        updatePanelVisibility(state, ctx.CONFIG);
    }
    ctx?.updatePanel?.();
}

export function togglePanelVisibility(state, CONFIG) {
    const panel = document.getElementById('aw-panel');
    if (!panel) return;
    const isCurrentlyVisible = panel.style.display !== 'none';
    state.panelVisible = !isCurrentlyVisible;
    state.userManuallyToggledPanel = true;
    panel.style.display = state.panelVisible ? 'block' : 'none';
    setValue('panelVisible', state.panelVisible.toString());
}

// ─── Private ──────────────────────────────────────────────────────────────────

function _patchEl(id, fn) {
    const el = document.getElementById(id);
    if (el) fn(el);
}

export function applyPanelMode(state, isMin) {
    state.panelMinimized = Boolean(isMin);
    setValue('panelMinimized', state.panelMinimized.toString());

    const panel = document.getElementById('aw-panel');
    const fullContainer = document.getElementById('aw-full-container');
    const pillContainer = document.getElementById('aw-pill-container');
    const minimizeBtn = document.getElementById('aw-minimize');

    if (!panel) return;

    if (state.panelMinimized) {
        if (fullContainer) fullContainer.style.display = 'none';
        if (pillContainer) pillContainer.style.display = 'flex';
        panel.style.width = 'auto';
        panel.style.minWidth = '0';
        panel.style.maxWidth = 'none';
        panel.style.background = 'transparent';
        panel.style.backdropFilter = 'none';
        panel.style.webkitBackdropFilter = 'none';
        panel.style.border = 'none';
        panel.style.boxShadow = 'none';
        panel.style.borderRadius = '999px';
        panel.style.padding = '0';
        panel.style.overflow = 'visible';
        if (minimizeBtn) {
            minimizeBtn.innerHTML = ICONS.expand;
            minimizeBtn.title = 'Perbesar Panel';
        }
    } else {
        // Prevent overflowing the right viewport edge when expanding
        const maxX = window.innerWidth - 305;
        if (state.panelX > maxX && maxX > 0) {
            state.panelX = Math.max(10, maxX);
            panel.style.left = state.panelX + 'px';
            setValue('panelX', state.panelX.toString());
        }

        if (fullContainer) fullContainer.style.display = 'block';
        if (pillContainer) pillContainer.style.display = 'none';
        panel.style.width = '285px';
        panel.style.minWidth = '285px';
        panel.style.maxWidth = '295px';
        panel.style.background = 'rgba(18, 22, 34, 0.92)';
        panel.style.backdropFilter = 'blur(14px)';
        panel.style.webkitBackdropFilter = 'blur(14px)';
        panel.style.border = '1px solid rgba(255, 255, 255, 0.08)';
        panel.style.borderRadius = '12px';
        panel.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.55), 0 0 1px rgba(255, 255, 255, 0.15)';
        panel.style.padding = '0';
        panel.style.overflow = 'visible';
        if (minimizeBtn) {
            minimizeBtn.innerHTML = ICONS.minimize;
            minimizeBtn.title = 'Mode Ringkas (Pill)';
        }
    }
}

function _buildPanelHTML(state, CONFIG) {
    const isMin    = Boolean(state.panelMinimized);
    const isPinned = CONFIG.panelPinned;
    const running  = state.running;

    return `
        <!-- Full Panel View -->
        <div id="aw-full-container" style="display: ${isMin ? 'none' : 'block'}; width: 100%;">
            <div id="aw-header" style="
                background: linear-gradient(135deg, rgba(26, 32, 53, 0.98) 0%, rgba(18, 22, 34, 0.98) 100%);
                padding: 9px 12px; cursor: ${isPinned ? 'default' : 'move'};
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex; justify-content: space-between; align-items: center;
                border-radius: 12px 12px 0 0;
                gap: 8px; box-sizing: border-box; width: 100%;
            ">
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;min-width:0;">
                    <span style="color:#00d9ff;display:flex;align-items:center;flex-shrink:0;">${ICONS.robot}</span>
                    <span style="font-weight:700;color:#fff;font-size:12.5px;letter-spacing:0.2px;white-space:nowrap;">Auto Worker</span>
                    <span id="aw-status-dot" style="
                        width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0;
                        background:${running ? '#00ff88' : '#ff4757'};
                        box-shadow:0 0 8px ${running ? '#00ff88' : '#ff4757'};
                    "></span>
                </div>
                <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">
                    <button id="aw-minimize"  class="aw-header-btn" title="Mode Ringkas (Pill)" style="${HEADER_BTN_STYLE}">${ICONS.minimize}</button>
                    <button id="aw-pin"       class="aw-header-btn" title="${isPinned ? 'Unpin' : 'Pin'}" style="${HEADER_BTN_STYLE} background:${isPinned ? 'rgba(0, 136, 255, 0.2)' : 'transparent'};color:${isPinned ? '#00d9ff' : '#8892b0'};border:${isPinned ? '1px solid rgba(0, 136, 255, 0.4)' : 'none'};">${isPinned ? ICONS.lockClosed : ICONS.lockOpen}</button>
                    <button id="aw-analytics" class="aw-header-btn" title="Statistik & Riwayat" style="${HEADER_BTN_STYLE}">${ICONS.chart}</button>
                    <button id="aw-settings"  class="aw-header-btn" title="Pengaturan" style="${HEADER_BTN_STYLE}">${ICONS.settings}</button>
                    <button id="aw-hide"      class="aw-header-btn" title="Sembunyikan (${CONFIG.shortcuts.showHide.display})" style="${HEADER_BTN_STYLE}color:#ff5252;margin-left:2px;">${ICONS.close}</button>
                </div>
            </div>
            <div id="aw-body" style="padding: 12px; display: block;">
                <div id="aw-uncertain-banner" style="display:${state.workResultUncertain ? 'block' : 'none'};margin-bottom:10px;padding:9px;background:rgba(255,68,68,0.12);border:1px solid rgba(255,68,68,0.55);border-radius:6px;color:#ffb3b3;font-size:11px;line-height:1.4;">
                    <div style="font-weight:700;color:#ff7777;margin-bottom:4px;">Hasil kerja terakhir belum pasti</div>
                    <div>Periksa halaman game sebelum melanjutkan.</div>
                    <div id="aw-reconciliation-status" style="margin-top:4px;color:#ffd166;">Status rekonsiliasi: menunggu pembacaan energi.</div>
                    <button id="aw-confirm-uncertain" style="margin-top:7px;padding:5px 8px;background:#8f3030;color:#fff;border:1px solid #b44;border-radius:4px;cursor:pointer;font-size:10px;">Saya sudah memeriksa, lanjutkan</button>
                </div>

                <!-- Region & Buff Badge -->
                <div id="aw-region-badge" style="
                    display: flex; align-items: center; justify-content: space-between;
                    background: linear-gradient(135deg, rgba(0, 217, 255, 0.08) 0%, rgba(0, 255, 136, 0.05) 100%);
                    border: 1px solid rgba(0, 217, 255, 0.2);
                    border-radius: 8px;
                    padding: 5px 9px;
                    margin-bottom: 9px;
                    font-size: 11px;
                ">
                    <div style="display:flex;align-items:center;gap:5px;overflow:hidden;">
                        <span style="font-size:12px;">📍</span>
                        <span id="aw-region-name" style="font-weight:600;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">${state.regionName || 'Memuat wilayah...'}</span>
                    </div>
                    <span id="aw-region-buff" style="
                        background: rgba(0, 255, 136, 0.12);
                        color: #00ff88;
                        border: 1px solid rgba(0, 255, 136, 0.25);
                        padding: 1px 6px;
                        border-radius: 4px;
                        font-weight: 700;
                        font-size: 9.5px;
                        white-space: nowrap;
                    ">${state.regionHealthBonusPercent ? `+${state.regionHealthBonusPercent}% Regen` : 'Normal (1.0x)'}</span>
                </div>

                <!-- Energy Card -->
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);padding:9px 11px;border-radius:9px;margin-bottom:9px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px;">
                        <span style="color:#a0aec0;font-weight:600;">⚡ Energi</span>
                        <span id="aw-energy-text" style="color:#00ff88;font-weight:700;letter-spacing:0.3px;">${state.currentEnergy}/${state.maxEnergy}</span>
                    </div>
                    <div style="background:rgba(0,0,0,0.5);height:7px;border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);padding:1px;">
                        <div id="aw-energy-bar" style="height:100%;width:${(state.currentEnergy / state.maxEnergy) * 100}%;background:linear-gradient(90deg, #00d9ff, #00ff88);border-radius:999px;transition:width 0.3s ease;box-shadow:0 0 8px rgba(0,255,136,0.35);"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:10px;color:#718096;margin-top:6px;">
                        <span id="aw-next-wrap" style="cursor:help;">Next: <span id="aw-next-work" style="color:#00ff88;font-weight:600;">Now!</span></span>
                        <span id="aw-full-wrap" style="cursor:help;">Full: <span id="aw-full-energy" style="color:#00d9ff;font-weight:500;">${getTimeToFullEnergy(state)}</span></span>
                    </div>
                </div>

                <!-- Stats 3-Col Grid -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:9px;">
                    <div style="background:rgba(255,255,255,0.03);padding:7px 5px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
                        <div style="font-size:9px;color:#718096;margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Hari Ini</div>
                        <div id="aw-today" style="font-size:13.5px;font-weight:700;color:#00d9ff;">${state.workToday}x</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03);padding:7px 5px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
                        <div style="font-size:9px;color:#718096;margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total Shift</div>
                        <div id="aw-worked" style="font-size:13.5px;font-weight:700;color:#f7fafc;">${state.totalWorked}x</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03);padding:7px 5px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
                        <div style="font-size:9px;color:#718096;margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Work XP</div>
                        <div id="aw-xp" style="font-size:13.5px;font-weight:700;color:#00ff88;">+${state.totalWorkXP} XP</div>
                    </div>
                </div>

                <!-- Token & Expiry Row -->
                <div style="font-size:10.5px;color:#718096;margin-bottom:9px;padding:6px 9px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:5px;">
                        <span>🔑</span>
                        <span style="color:#a0aec0;">Token:</span>
                        <span id="aw-token-status" style="font-weight:700;color:#00ff88;">VALID</span>
                    </div>
                    <span id="aw-token-expiry" style="font-size:10px;color:#718096;">N/A</span>
                </div>

                <!-- Action Buttons -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                    <button id="aw-work-now" class="aw-btn-action" style="
                        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px; box-shadow: 0 2px 6px rgba(245,158,11,0.25);
                    ">⚡ Work</button>
                    <button id="aw-toggle" class="aw-btn-action" style="
                        background: ${running ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'};
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px;
                        box-shadow: 0 2px 6px ${running ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'};
                    ">${running ? '⏸ Pause' : '▶ Resume'}</button>
                    <button id="aw-logs" class="aw-btn-action" style="
                        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px; box-shadow: 0 2px 6px rgba(99,102,241,0.25);
                    ">📋 Log</button>
                </div>
            </div>
        </div>

        <!-- Mini Floating Pill Container (Mode Ringkas) -->
        <div id="aw-pill-container" class="aw-pill-box" style="
            display: ${isMin ? 'flex' : 'none'};
            align-items: center;
            gap: 7px;
            background: linear-gradient(135deg, rgba(20, 25, 42, 0.95) 0%, rgba(13, 16, 26, 0.98) 100%);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 999px;
            padding: 4px 8px 4px 10px;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);
            cursor: ${isPinned ? 'default' : 'move'};
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            box-sizing: border-box;
            white-space: nowrap;
        " title="Auto Worker • Seret untuk pindah • Klik 2x untuk perbesar">

            <!-- Robot Icon & Live Status Dot -->
            <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
                <span style="color: #00d9ff; display: flex; align-items: center;">${ICONS.robot}</span>
                <span id="aw-pill-status-dot" style="
                    width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0;
                    background: ${running ? '#00ff88' : '#ff4757'};
                    box-shadow: 0 0 8px ${running ? '#00ff88' : '#ff4757'};
                "></span>
            </div>

            <!-- Energy Badge -->
            <div id="aw-pill-energy-badge" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(0, 255, 136, 0.08);
                border: 1px solid rgba(0, 255, 136, 0.22);
                border-radius: 6px;
                padding: 2px 7px;
                font-size: 11px;
                font-weight: 700;
                color: #00ff88;
                letter-spacing: 0.2px;
                flex-shrink: 0;
            " title="Energi Saat Ini">
                <span style="font-size: 11px;">⚡</span>
                <span id="aw-pill-energy">${state.currentEnergy || 0}/${state.maxEnergy || 110}</span>
            </div>

            <!-- Next Work / Countdown Badge -->
            <div id="aw-pill-countdown-badge" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(0, 217, 255, 0.08);
                border: 1px solid rgba(0, 217, 255, 0.22);
                border-radius: 6px;
                padding: 2px 7px;
                font-size: 11px;
                font-weight: 700;
                color: #00d9ff;
                letter-spacing: 0.2px;
                flex-shrink: 0;
            " title="Countdown Giliran Kerja">
                <span id="aw-pill-countdown-icon" style="font-size: 11px;">⏳</span>
                <span id="aw-pill-countdown">Memuat...</span>
            </div>

            <!-- Subtle Divider -->
            <div style="width: 1px; height: 16px; background: rgba(255, 255, 255, 0.12); flex-shrink: 0; margin: 0 1px;"></div>

            <!-- Mini Quick Actions -->
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                <button id="aw-pill-toggle" class="aw-pill-btn" style="
                    width: 22px; height: 22px; border-radius: 50%; border: none;
                    background: ${running ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'};
                    color: #fff; font-size: 9.5px; font-weight: 700;
                    box-shadow: 0 2px 6px ${running ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)'};
                " title="${running ? 'Pause Worker' : 'Resume Worker'}">${running ? '⏸' : '▶'}</button>

                <button id="aw-pill-expand" class="aw-pill-btn" style="
                    width: 22px; height: 22px; border-radius: 50%;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    color: #cbd5e1;
                " title="Perbesar ke Panel Penuh">${ICONS.expand}</button>
            </div>
        </div>
    `;
}

function _setupDragAndDrop(panel, state, CONFIG) {
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;

    const onMouseDown = e => {
        if (CONFIG.panelPinned) return;
        if (e.target.closest('button')) return;
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        origX  = state.panelX; origY  = state.panelY;
        e.preventDefault();
    };

    const header = document.getElementById('aw-header');
    const pill = document.getElementById('aw-pill-container');

    if (header) header.addEventListener('mousedown', onMouseDown);
    if (pill) pill.addEventListener('mousedown', onMouseDown);

    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        state.panelX = Math.max(0, origX + e.clientX - startX);
        state.panelY = Math.max(0, origY + e.clientY - startY);
        panel.style.left = state.panelX + 'px';
        panel.style.top  = state.panelY + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        setValue('panelX', state.panelX.toString());
        setValue('panelY', state.panelY.toString());
    });
}

function _setupPanelControls(panel, state, CONFIG, ctx) {
    const { openSettings, openAnalytics, openLogViewer, doWork } = ctx;

    const minimizeBtn   = document.getElementById('aw-minimize');
    const pinBtn        = document.getElementById('aw-pin');
    const hideBtn       = document.getElementById('aw-hide');
    const toggleBtn     = document.getElementById('aw-toggle');
    const workNowBtn    = document.getElementById('aw-work-now');
    const logsBtn       = document.getElementById('aw-logs');
    const analyticsBtn  = document.getElementById('aw-analytics');
    const settingsBtn   = document.getElementById('aw-settings');
    const confirmBtn    = document.getElementById('aw-confirm-uncertain');
    const pillExpandBtn = document.getElementById('aw-pill-expand');
    const pillToggleBtn = document.getElementById('aw-pill-toggle');
    const header        = document.getElementById('aw-header');
    const pill          = document.getElementById('aw-pill-container');

    // Hover effects on header buttons
    panel.querySelectorAll('.aw-header-btn').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(255,255,255,0.12)';
            btn.style.color = '#fff';
        });
        btn.addEventListener('mouseleave', () => {
            if (btn.id === 'aw-pin' && CONFIG.panelPinned) {
                btn.style.background = 'rgba(0, 136, 255, 0.2)';
                btn.style.color = '#00d9ff';
            } else if (btn.id === 'aw-hide') {
                btn.style.background = 'transparent';
                btn.style.color = '#ff5252';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = '#8892b0';
            }
        });
    });

    // Minimize & Expand handlers
    minimizeBtn?.addEventListener('click', () => {
        applyPanelMode(state, !state.panelMinimized);
        ctx.updatePanel?.();
    });

    pillExpandBtn?.addEventListener('click', () => {
        applyPanelMode(state, false);
        ctx.updatePanel?.();
    });

    // Double-click to toggle mode: dblclick on header minimizes, dblclick on pill expands
    header?.addEventListener('dblclick', e => {
        if (e.target.closest('button')) return;
        applyPanelMode(state, true);
        ctx.updatePanel?.();
    });

    pill?.addEventListener('dblclick', e => {
        if (e.target.closest('button')) return;
        applyPanelMode(state, false);
        ctx.updatePanel?.();
    });

    pinBtn?.addEventListener('click', () => {
        CONFIG.panelPinned = !CONFIG.panelPinned;
        ctx.saveConfig?.(CONFIG);
        const hdr = document.getElementById('aw-header');
        const pillEl = document.getElementById('aw-pill-container');
        if (hdr) hdr.style.cursor = CONFIG.panelPinned ? 'default' : 'move';
        if (pillEl) pillEl.style.cursor = CONFIG.panelPinned ? 'default' : 'move';
        if (pinBtn) {
            pinBtn.style.background = CONFIG.panelPinned ? 'rgba(0, 136, 255, 0.2)' : 'transparent';
            pinBtn.style.color = CONFIG.panelPinned ? '#00d9ff' : '#8892b0';
            pinBtn.style.border = CONFIG.panelPinned ? '1px solid rgba(0, 136, 255, 0.4)' : 'none';
            pinBtn.title = CONFIG.panelPinned ? 'Unpin' : 'Pin';
        }
    });

    function toggleRunningState() {
        state.running = !state.running;
        setRunningUI(state.running);
        ctx.log(state.running ? 'Script dilanjutkan' : 'Script di-pause', 'info');
        if (state.running) ctx.wakePendingWork?.();
        saveState(state);
        const summary = saveLiveStatus(state, CONFIG, true);
        ctx.updatePanel?.();

        try {
            if (chrome?.runtime?.id) {
                chrome.storage.local.set({ aw_live_status: summary });
                chrome.runtime.sendMessage({
                    type: 'POPUP_TO_TAB',
                    action: 'toggleRunning',
                    value: state.running
                }).catch(() => {});
            }
        } catch { /* context invalidated */ }
    }

    // Quick pause/resume from pill
    pillToggleBtn?.addEventListener('click', toggleRunningState);

    settingsBtn?.addEventListener('click', () => ctx.openSettings?.());
    analyticsBtn?.addEventListener('click', () => ctx.openAnalytics?.());
    hideBtn?.addEventListener('click', () => togglePanelVisibility(state, CONFIG));

    toggleBtn?.addEventListener('click', toggleRunningState);

    workNowBtn?.addEventListener('click', () => { ctx.log('Manual work triggered!', 'info'); ctx.doWork?.(true); });
    logsBtn?.addEventListener('click', () => ctx.openLogViewer?.());

    confirmBtn?.addEventListener('click', () => {
        if (!state.workResultUncertain || !state.isTabLockOwner) return;
        if (!confirm('Pastikan sudah memeriksa halaman game. Lanjutkan worker?')) return;
        state.workResultUncertain = false;
        state.uncertainReconciliation = 'none';
        ctx.uncertainEnergyBefore = null;
        setValue('aw_workResultUncertain', 'false');
        setValue('aw_uncertainEnergyBefore', '');
        state.energySyncBase = null;
        const e = getCurrentEnergy();
        if (e) { state.currentEnergy = e.current; state.maxEnergy = e.max; }
        state.running = true;
        ctx.log('Worker dilanjutkan setelah hasil timeout diperiksa manual.', 'warn');
        ctx.updatePanel?.();
        ctx.wakePendingWork?.();
    });

    // Keyboard shortcuts
    document.removeEventListener('keydown', panel._keyHandler, true);
    panel._keyHandler = _makeKeyHandler(state, CONFIG, ctx, toggleRunningState);
    document.addEventListener('keydown', panel._keyHandler, true);
}

function _makeKeyHandler(state, CONFIG, ctx, toggleRunningState) {
    return function handleGlobalKeydown(e) {
        if (state.settingsOpen) return;
        const target = e.target;
        if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName)) return;

        for (const [action, shortcut] of Object.entries(CONFIG.shortcuts)) {
            if (!shortcut?.keys || shortcut.keys.length === 0) continue;

            const reqCtrl  = shortcut.keys.includes('Control');
            const reqShift = shortcut.keys.includes('Shift');
            const reqAlt   = shortcut.keys.includes('Alt');

            // Exact modifier matching — prevents false triggers when extra modifiers are held
            if (Boolean(e.ctrlKey) !== reqCtrl) continue;
            if (Boolean(e.shiftKey) !== reqShift) continue;
            if (Boolean(e.altKey) !== reqAlt) continue;
            if (e.metaKey) continue; // Never hijack OS/Meta keys

            const nonModifierKeys = shortcut.keys.filter(k => k !== 'Control' && k !== 'Shift' && k !== 'Alt');
            if (nonModifierKeys.length > 0 && !nonModifierKeys.includes(e.code)) continue;

            if (action === 'pauseResume' && state.tabLockManaged && !state.isTabLockOwner) return;
            e.preventDefault(); e.stopPropagation();

            if (action === 'showHide')         togglePanelVisibility(state, CONFIG);
            else if (action === 'workNow')     { ctx.log('Manual work!', 'info'); ctx.doWork?.(true); }
            else if (action === 'pauseResume') toggleRunningState();
            else if (action === 'openLog')     ctx.openLogViewer?.();
            else if (action === 'openSettings') ctx.openSettings?.();
            return;
        }
    };
}

function _setupResponsiveBehavior(panel, state, CONFIG) {
    if (!CONFIG.panelFollowViewport) return;
    window.addEventListener('resize', () => {
        const maxX = window.innerWidth  - panel.offsetWidth  - 10;
        const maxY = window.innerHeight - panel.offsetHeight - 10;
        if (state.panelX > maxX || state.panelY > maxY) {
            if (CONFIG.panelReturnToOriginal) {
                state.panelX = state.originalPanelX;
                state.panelY = state.originalPanelY;
            } else {
                state.panelX = Math.max(0, Math.min(state.panelX, maxX));
                state.panelY = Math.max(0, Math.min(state.panelY, maxY));
            }
            panel.style.left = state.panelX + 'px';
            panel.style.top  = state.panelY + 'px';
        }
    });
}
