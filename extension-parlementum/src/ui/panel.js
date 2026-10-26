/**
 * ui/panel.js — Main floating panel injected into the page
 *
 * Extracted from createPanel(), updatePanel(), setupDragAndDrop(),
 * setupPanelControls(), setupResponsiveBehavior() in Extension.js.
 * All logic is identical — only imports replace global variable references.
 */

import { getLiveCountdown, getTimeToFullEnergy, getTimeToFullEnergy as ttfe, getGameEnergyFullText, isEnergyFlushActive, getEffectiveEnergyThreshold, isDashboardPage, readBreadQuotaFromDom } from '../energy.js';
import { getTimeUntilExpiry } from '../token.js';
import { getValue, setValue } from '../storage.js';
import { saveState, saveLiveStatus } from '../state.js';
import { broadcastTabMessage } from '../broadcast.js';
import { ICONS } from './icons.js';
import { getTrainingStatusDisplay, readTrainingStatsFromDom, readWalletGoldFromDom, getTrainingProgressPercentage } from '../training.js';
import { showInPageNotification } from '../notifications.js';

const HEADER_BTN_STYLE = `
    background: transparent; border: none; cursor: pointer; padding: 0;
    border-radius: 6px; display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; min-width: 24px; max-width: 24px; flex-shrink: 0 !important;
    transition: all 0.15s ease; color: #8892b0; line-height: 1; box-sizing: border-box;
`;

function _injectGoogleFonts() {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('aw-google-fonts')) {
        const link1 = document.createElement('link');
        link1.rel = 'preconnect';
        link1.href = 'https://fonts.googleapis.com';
        document.head.appendChild(link1);

        const link2 = document.createElement('link');
        link2.rel = 'preconnect';
        link2.href = 'https://fonts.gstatic.com';
        link2.crossOrigin = 'anonymous';
        document.head.appendChild(link2);

        const link3 = document.createElement('link');
        link3.id = 'aw-google-fonts';
        link3.rel = 'stylesheet';
        link3.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';
        document.head.appendChild(link3);
    }
}

function _injectPanelStyles() {
    if (typeof document === 'undefined' || document.getElementById('aw-panel-styles')) return;
    _injectGoogleFonts();
    const style = document.createElement('style');
    style.id = 'aw-panel-styles';
    style.textContent = `
        :root, #aw-panel, #aw-full-container, #aw-pill-container {
            --bg-abyss: #0a0e1a;
            --surface-card: rgba(22, 27, 42, 0.75);
            --surface-elevated: rgba(30, 39, 59, 0.82);
            --surface-inner: rgba(13, 18, 30, 0.72);
            --border-subtle: rgba(255, 255, 255, 0.08);
            --border-highlight: rgba(56, 189, 248, 0.32);
        }

        #aw-panel {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            color: #f1f5f9 !important;
            letter-spacing: -0.01em;
        }

        .tabular-nums, .paw-mono {
            font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace !important;
            font-variant-numeric: tabular-nums !important;
            letter-spacing: -0.02em !important;
        }

        /* Argon Cyber Glass Shell */
        .paw-shell {
            background: rgba(13, 18, 30, 0.88) !important;
            backdrop-filter: blur(20px) saturate(160%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: 
                0 24px 48px -12px rgba(0, 0, 0, 0.75),
                0 0 0 1px rgba(56, 189, 248, 0.06),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.12) !important;
            border-radius: 16px !important;
        }

        #aw-pill-container {
            border-radius: 999px !important;
            min-width: 250px !important;
            background: rgba(13, 18, 30, 0.94) !important;
            backdrop-filter: blur(20px) saturate(160%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
            border: 1px solid rgba(56, 189, 248, 0.35) !important;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 14px rgba(56, 189, 248, 0.25) !important;
        }

        /* Modular Inner Glass Card */
        .paw-card {
            background: rgba(22, 27, 42, 0.75) !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.05) !important;
            border-radius: 12px !important;
            transition: border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease !important;
        }
        .paw-card:hover {
            border-color: rgba(56, 189, 248, 0.28) !important;
            background: rgba(26, 33, 52, 0.82) !important;
        }

        /* Recessed Well for Sub-Metrics */
        .paw-well {
            background: rgba(13, 18, 30, 0.72) !important;
            border: 1px solid rgba(255, 255, 255, 0.06) !important;
            border-radius: 8px !important;
        }

        /* Low-Profile Neutral OFF Badge */
        .badge-train-off {
            background: rgba(255, 255, 255, 0.03) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            color: #94a3b8 !important;
        }

        /* Pulse Animations for Status Dots */
        @keyframes pulseRing {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .status-dot-active {
            animation: pulseRing 2s infinite !important;
        }

        @keyframes pulseAmber {
            0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(245, 158, 11, 0.35); }
            50% { opacity: 0.72; box-shadow: 0 0 4px rgba(245, 158, 11, 0.1); }
        }
        .badge-flush-pulse {
            animation: pulseAmber 2.2s infinite ease-in-out !important;
        }

        @keyframes shimmerBar {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        @keyframes statGradientShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        .energy-progress-fill {
            background: linear-gradient(90deg, #0ea5e9 0%, #38bdf8 45%, #818cf8 85%, #38bdf8 100%) !important;
            background-size: 200% 100% !important;
            animation: shimmerBar 4s infinite linear !important;
            box-shadow: 0 0 14px rgba(56, 189, 248, 0.45) !important;
            border-radius: 999px !important;
            transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .stat-progress-fill {
            background: linear-gradient(90deg, #f43f5e 0%, #fb923c 45%, #fbbf24 85%, #f43f5e 100%) !important;
            background-size: 200% 100% !important;
            animation: statGradientShimmer 4s infinite linear !important;
            box-shadow: 0 0 10px rgba(244, 63, 94, 0.45) !important;
        }

        @keyframes aw-pulse-glow {
            0% {
                box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.75), 0 0 12px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 28px 54px -10px rgba(0, 0, 0, 0.85), 0 0 24px rgba(0, 255, 136, 0.65);
                border-color: rgba(0, 255, 136, 0.85);
            }
            100% {
                box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.75), 0 0 12px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        @keyframes aw-pill-pulse-glow {
            0% {
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.75), 0 0 18px rgba(0, 255, 136, 0.75);
                border-color: rgba(0, 255, 136, 0.9);
            }
            100% {
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        .aw-ready-glow {
            animation: aw-pulse-glow 2.2s infinite ease-in-out !important;
        }
        #aw-pill-container.aw-ready-glow {
            animation: aw-pill-pulse-glow 2.2s infinite ease-in-out !important;
        }

        .btn-cyber {
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            outline: none !important;
            user-select: none !important;
            cursor: pointer !important;
            -webkit-tap-highlight-color: transparent !important;
        }
        .btn-cyber:hover:not(:disabled) {
            filter: brightness(1.15) !important;
            transform: translateY(-1.5px) !important;
        }
        .btn-cyber:active:not(:disabled) {
            transform: translateY(0.5px) scale(0.985) !important;
        }

        .aw-btn-action {
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            outline: none !important;
            user-select: none !important;
            -webkit-tap-highlight-color: transparent !important;
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
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            border-radius: 8px !important;
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
        }
        .aw-header-btn:hover {
            background: rgba(255, 255, 255, 0.12) !important;
            color: #fff !important;
            border-color: rgba(255, 255, 255, 0.2) !important;
        }
        .aw-pill-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            outline: none !important;
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            user-select: none !important;
            padding: 0 !important;
            -webkit-tap-highlight-color: transparent !important;
        }
        .aw-pill-btn:hover:not(:disabled) {
            filter: brightness(1.2) !important;
            transform: scale(1.08) !important;
        }
        .aw-pill-btn:active:not(:disabled) {
            transform: scale(0.94) !important;
        }
        .aw-pill-box:hover {
            border-color: rgba(56, 189, 248, 0.45) !important;
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.75), 0 0 16px rgba(56, 189, 248, 0.28) !important;
        }
        .aw-badge-btn {
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .aw-badge-btn:hover {
            filter: brightness(1.15) !important;
            transform: translateY(-0.5px) !important;
        }
        .aw-badge-btn:active {
            transform: scale(0.97) !important;
        }
        .aw-mini-stat-pill {
            background: rgba(13, 18, 30, 0.72) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-radius: 8px !important;
            padding: 6px 10px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            cursor: pointer !important;
            user-select: none !important;
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .aw-mini-stat-pill:hover {
            transform: translateY(-1.5px) !important;
            filter: brightness(1.15) !important;
        }
        .aw-mini-stat-pill:active {
            transform: scale(0.97) !important;
        }
        .aw-mini-stat-pill .pill-lbl {
            font-size: 11.5px !important;
            font-weight: 700 !important;
            transition: color 0.2s ease !important;
        }
        .aw-mini-stat-pill .stat-val {
            font-size: 13.5px !important;
            font-weight: 700 !important;
            color: #ffffff !important;
            transition: color 0.2s ease !important;
        }

        /* Active / Selected Pills (Gambar 3): Show color indicator border & colored label */
        .aw-mini-stat-pill.pill-str:not(.dimmed) {
            border-left: 2.5px solid #f43f5e !important;
        }
        .aw-mini-stat-pill.pill-str:not(.dimmed) .pill-lbl {
            color: #f43f5e !important;
        }

        .aw-mini-stat-pill.pill-edu:not(.dimmed) {
            border-left: 2.5px solid #38bdf8 !important;
        }
        .aw-mini-stat-pill.pill-edu:not(.dimmed) .pill-lbl {
            color: #38bdf8 !important;
        }

        .aw-mini-stat-pill.pill-eko:not(.dimmed) {
            border-left: 2.5px solid #10b981 !important;
        }
        .aw-mini-stat-pill.pill-eko:not(.dimmed) .pill-lbl {
            color: #10b981 !important;
        }

        /* Unselected / Dimmed Pills (Gambar 2): Border turns gray (NO red/blue/green), text turns gray */
        .aw-mini-stat-pill.dimmed {
            opacity: 0.55 !important;
            background: rgba(13, 18, 30, 0.45) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-left: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        .aw-mini-stat-pill.dimmed .pill-lbl,
        .aw-mini-stat-pill.dimmed span {
            color: #64748b !important;
        }
        .aw-mini-stat-pill.dimmed .stat-val,
        .aw-mini-stat-pill.dimmed div {
            color: #64748b !important;
        }
        #aw-training-body {
            transition: max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, margin-top 0.25s ease !important;
        }
        #aw-training-body.collapsed {
            max-height: 0px !important;
            opacity: 0 !important;
            margin-top: 0px !important;
            padding-top: 0px !important;
            padding-bottom: 0px !important;
            overflow: hidden !important;
            pointer-events: none !important;
        }
        #aw-training-body.expanded {
            max-height: 180px !important;
            opacity: 1 !important;
            margin-top: 8px !important;
            overflow: hidden !important;
            pointer-events: auto !important;
        }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
        }
        /* Battery & GPU Saving: suspend all animations when tab is hidden */
        .aw-tab-hidden *, .aw-tab-hidden *::before, .aw-tab-hidden *::after {
            animation-play-state: paused !important;
        }
        input[type="number"] {
            -moz-appearance: textfield !important;
        }
    `;
    document.head.appendChild(style);

    if (typeof document !== 'undefined' && !window.__AW_VISIBILITY_ATTACHED__) {
        window.__AW_VISIBILITY_ATTACHED__ = true;
        document.addEventListener('visibilitychange', () => {
            const panel = document.getElementById('aw-panel');
            if (panel) {
                if (document.hidden) {
                    panel.classList.add('aw-tab-hidden');
                } else {
                    panel.classList.remove('aw-tab-hidden');
                }
            }
        });
    }
}

export { isDashboardPage };

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
        const maxX = Math.max(10, window.innerWidth - (state.panelMinimized ? 280 : 376));
        const maxY = Math.max(10, window.innerHeight - (state.panelMinimized ? 46 : 200));
        state.panelX = Math.max(10, Math.min(state.panelX ?? 10, maxX));
        state.panelY = Math.max(10, Math.min(state.panelY ?? 10, maxY));

        const panel = document.createElement('div');
        panel.id = 'aw-panel';
        panel.style.cssText = `
            position: fixed; top: ${state.panelY}px; left: ${state.panelX}px;
            color: #f1f5f9;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            font-size: 12px;
            z-index: 99999;
            box-sizing: border-box;
            user-select: none;
            overflow: visible;
            background: transparent;
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

        ctx.log('Panel v5.12.0 siap!', 'success', false);
    }, 250);
}

/** @param {object} state @param {object} CONFIG @param {object} workHistory @param {object} ctx */
export function updatePanel(state, CONFIG, workHistory, ctx) {
    if (!chrome.runtime?.id) {
        _patchEl('aw-circuit-breaker-banner', el => {
            el.style.display = 'block';
            el.style.background = 'rgba(239, 68, 68, 0.25)';
            el.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            el.style.color = '#fca5a5';
            el.style.cursor = 'pointer';
            el.textContent = 'Ekstensi telah di-reload. Klik di sini atau tekan F5 untuk menyambungkan kembali.';
            el.onclick = () => window.location.reload();
        });
        return;
    }
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
    }

    // Keep next work schedule accurately synchronized with current energy
    const effectiveThreshold = getEffectiveEnergyThreshold(state, CONFIG);
    if (state.currentEnergy < effectiveThreshold) {
        const rate = state.regenRate || 1.0;
        const neededMs = Math.max(1, (effectiveThreshold - state.currentEnergy) / rate) * 60000;
        if (!state.nextWorkTimestamp) {
            state.nextWorkTimestamp = Date.now() + neededMs;
        } else if (state.nextWorkTimestamp > Date.now()) {
            if (state.serverCooldownUntil && Date.now() < state.serverCooldownUntil) {
                state.nextWorkTimestamp = Math.max(state.nextWorkTimestamp, state.serverCooldownUntil);
            } else {
                const remaining = state.nextWorkTimestamp - Date.now();
                if (Math.abs(remaining - neededMs) > 120000) {
                    state.nextWorkTimestamp = Date.now() + neededMs;
                }
            }
        }
    } else if (state.running && state.isTabLockOwner && !state.workInFlight && !state.workResultUncertain) {
        if (state.serverCooldownUntil && Date.now() < state.serverCooldownUntil) {
            state.nextWorkTimestamp = Math.max(state.nextWorkTimestamp || 0, state.serverCooldownUntil);
        } else if (!state.nextWorkTimestamp || Date.now() >= state.nextWorkTimestamp) {
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
            if (reg.bonusMultiplier && Math.abs(reg.bonusMultiplier - (state.regenRate || 1.0)) > 0.01) {
                state.regenRate = reg.bonusMultiplier;
                if (state.currentEnergy < CONFIG.energyThreshold) {
                    const neededMs = Math.max(1, (CONFIG.energyThreshold - state.currentEnergy) / state.regenRate) * 60000;
                    state.nextWorkTimestamp = Date.now() + neededMs;
                }
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

    const threshold = getEffectiveEnergyThreshold(state, CONFIG);
    const isReadyToWork = state.currentEnergy >= threshold && (!state.serverCooldownUntil || Date.now() >= state.serverCooldownUntil);

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
    const isSyncing = isDashboardPage() && !state.hasInitialDomEnergyRead && (!state.currentEnergy || state.currentEnergy <= 0);
    const safeMax = (state.maxEnergy && state.maxEnergy > 0) ? state.maxEnergy : 110;
    const energyPct = Math.max(0, Math.min(100, (state.currentEnergy / safeMax) * 100));
    _patchEl('aw-energy-text',   el => el.textContent = isSyncing ? 'Sinkronisasi...' : `${state.currentEnergy}/${state.maxEnergy}`);
    _patchEl('aw-energy-pct',    el => el.textContent = isSyncing ? '(0%)' : `(${Math.round(energyPct)}%)`);
    _patchEl('aw-energy-bar',    el => el.style.width  = isSyncing ? '0%' : `${energyPct}%`);
    const liveCountdown = isSyncing ? 'Sinkronisasi...' : getLiveCountdown(state, CONFIG);
    _patchEl('aw-next-work',     el => {
        el.textContent = liveCountdown;
        el.style.color = isReadyToWork ? '#00ff88' : '#00d9ff';
        if (state.nextWorkTimestamp && state.nextWorkTimestamp > Date.now()) {
            const d = new Date(state.nextWorkTimestamp);
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            el.title = `Shift berikutnya diperkirakan pukul ${h}:${m} WIB`;
        } else {
            el.title = 'Energi target tercapai. Siap bekerja.';
        }
    });
    _patchEl('aw-full-energy',   el => el.textContent  = isSyncing ? 'Sinkronisasi...' : getTimeToFullEnergy(state));

    // Pill live updates
    _patchEl('aw-pill-energy', el => el.textContent = isSyncing ? '...' : `${state.currentEnergy}/${state.maxEnergy}`);
    _patchEl('aw-pill-countdown', el => {
        el.textContent = isSyncing ? 'Sinkronisasi...' : (isReadyToWork ? 'Siap' : liveCountdown);
        el.style.color = isReadyToWork ? '#00ff88' : '#00d9ff';
    });
    _patchEl('aw-pill-countdown-icon', el => {
        el.innerHTML = isReadyToWork ? ICONS.zap : ICONS.clock;
    });
    _patchEl('aw-pill-status-dot', el => {
        const dotColor = state.workResultUncertain ? '#ffaa00' : (state.running ? '#10b981' : '#f43f5e');
        el.style.background = dotColor;
        el.style.boxShadow  = `0 0 8px ${dotColor}`;
        el.className = state.running ? 'status-dot-active' : '';
    });
    // Live UTC Clock & Server Reset countdown
    const nowUtc = new Date();
    const utcH = String(nowUtc.getUTCHours()).padStart(2, '0');
    const utcM = String(nowUtc.getUTCMinutes()).padStart(2, '0');
    const utcS = String(nowUtc.getUTCSeconds()).padStart(2, '0');
    const utcTimeStr = `${utcH}:${utcM}:${utcS} UTC`;
    const minsToReset = (23 - nowUtc.getUTCHours()) * 60 + (59 - nowUtc.getUTCMinutes());
    const resetH = Math.floor(minsToReset / 60);
    const resetM = minsToReset % 60;
    const resetStr = `Reset: ${resetH}j ${resetM}m`;
    const isFlush = isEnergyFlushActive(CONFIG);

    _patchEl('aw-utc-time', el => el.textContent = utcTimeStr);
    _patchEl('aw-flush-badge', el => {
        el.style.display = isFlush ? 'inline-block' : 'none';
    });
    _patchEl('aw-utc-reset', el => {
        el.textContent = resetStr;
        el.title = `Reset harian server (jatah 10 slot makanan harian & bonus) terjadi pukul 00:00 UTC (${resetH} jam ${resetM} menit lagi)`;
    });

    // Circuit Breaker Warning Banner
    _patchEl('aw-circuit-breaker-banner', el => {
        if (state.circuitBreakerActive) {
            el.style.display = 'block';
            el.textContent = `Pemeriksaan keamanan aktif (${state.circuitBreakerReason || 'Cloudflare/Maintenance'}). Worker dijeda.`;
        } else {
            el.style.display = 'none';
        }
    });

    // Daily Food Slot Tracker
    const maxFood = CONFIG.maxFoodDaily || state.maxFoodDaily || 10;
    const foodEaten = Math.max(0, Math.min(maxFood, state.foodEatenToday || 0));
    const foodLeft = Math.max(0, maxFood - foodEaten);
    _patchEl('aw-food-slot-text', el => {
        el.textContent = `${foodEaten}/${maxFood}`;
    });
    _patchEl('aw-food-reminder', el => {
        if (foodLeft === 0) {
            el.textContent = 'Kuota habis';
            el.style.color = '#10b981';
            el.style.background = 'rgba(16, 185, 129, 0.15)';
            el.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else if (minsToReset <= 240 && CONFIG.foodResetReminderEnabled !== false) { // < 4 jam ke reset UTC
            el.textContent = `Sisa ${foodLeft}!`;
            el.style.color = '#f59e0b';
            el.style.background = 'rgba(245, 158, 11, 0.15)';
            el.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        } else {
            el.textContent = `${foodLeft} sisa`;
            el.style.color = '#94a3b8';
            el.style.background = 'rgba(148, 163, 184, 0.12)';
            el.style.borderColor = 'rgba(148, 163, 184, 0.2)';
        }
    });

    _patchEl('aw-pill-container', el => {
        const statusText = state.workResultUncertain
            ? 'Hasil kerja belum pasti'
            : (state.running ? 'Sedang Berjalan' : 'Dijeda');
        const flushNote = isFlush ? ' • [JAM EMAS UTC]' : '';
        el.title = `Auto Worker: ${statusText}${flushNote}\nEnergi: ${state.currentEnergy}/${state.maxEnergy}\nGiliran: ${liveCountdown}\nWaktu Server: ${utcTimeStr} (${resetStr})\nMakanan: ${foodEaten}/${maxFood} slot\n\n(Seret untuk geser • Klik 2x untuk perbesar)`;
    });

    // Clock time tooltips (Hover to see exact time)
    _patchEl('aw-next-wrap', el => {
        if (isReadyToWork) {
            el.title = `Energi saat ini (${state.currentEnergy} EN) sudah mencapai target shift (≥ ${threshold} EN). Siap bekerja.`;
        } else if (state.nextWorkTimestamp && state.nextWorkTimestamp > Date.now()) {
            const d = new Date(state.nextWorkTimestamp);
            const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            el.title = `Estimasi mencapai target shift (≥ ${threshold} EN): pk. ${timeStr} WIB`;
        } else {
            el.title = 'Menunggu energi pulih menuju target shift...';
        }
    });

    _patchEl('aw-full-wrap', el => {
        const needed = (state.maxEnergy || 115) - (state.currentEnergy || 0);
        if (needed <= 0) {
            el.title = 'Energi sudah 100% penuh.';
        } else {
            const rate = state.regenRate || 1.0;
            const fullMs = Math.round((needed / rate) * 60000);
            const d = new Date(Date.now() + fullMs);
            const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const gameText = getGameEnergyFullText();
            const gameNote = gameText ? ` | Sesuai game: Penuh dalam ${gameText}` : '';
            el.title = `Estimasi energi 100% penuh: pk. ${timeStr} WIB (~${Math.round(needed / rate)} mnt @ ${rate} EN/mnt)${gameNote}`;
        }
    });

    _patchEl('aw-mode-title', el => {
        el.textContent = state.running ? 'Auto Kerja: AKTIF' : 'Auto Kerja: DIJEDA';
        el.style.color = state.running ? '#00ff88' : '#ff7777';
    });
    _patchEl('aw-mode-title-badge', el => {
        el.textContent = state.running ? 'Auto Kerja: AKTIF' : 'Auto Kerja: DIJEDA';
        el.style.background = state.running ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
        el.style.borderColor = state.running ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)';
        el.style.color = state.running ? '#34d399' : '#f43f5e';
    });
    _patchEl('aw-mode-icon', el => {
        el.innerHTML = state.running ? ICONS.zap : ICONS.pause;
        el.style.color = state.running ? '#00ff88' : '#ff7777';
    });
    _patchEl('aw-target-threshold', el => {
        el.textContent = String(CONFIG.energyThreshold || 10);
    });
    _patchEl('aw-shift-countdown', el => {
        el.textContent = isReadyToWork ? 'Siap Kerja' : liveCountdown;
        el.style.color = isReadyToWork ? '#00ff88' : '#00d9ff';
    });

    // Auto Training, Bread Quota & Wallet Gold Live Status
    if (isDashboardPage()) {
        readTrainingStatsFromDom(state);
        readBreadQuotaFromDom(state, CONFIG);
    } else {
        readWalletGoldFromDom(state);
    }
    const trainStatus = getTrainingStatusDisplay(state, CONFIG);
    const activeStatCount = (CONFIG.trainStrengthEnabled !== false ? 1 : 0) +
                           (CONFIG.trainEducationEnabled !== false ? 1 : 0) +
                           (CONFIG.trainEconomyEnabled !== false ? 1 : 0);

    _patchEl('aw-train-count-badge', el => {
        if (!CONFIG.autoTrainEnabled) {
            el.textContent = 'Nonaktif';
            el.style.background = 'rgba(255, 255, 255, 0.05)';
            el.style.color = '#94a3b8';
            el.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        } else if (activeStatCount === 0) {
            el.textContent = '0/3 Aktif';
            el.style.background = 'rgba(244, 63, 94, 0.15)';
            el.style.color = '#fda4af';
            el.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        } else {
            el.textContent = `${activeStatCount}/3 Aktif`;
            el.style.background = 'rgba(244, 63, 94, 0.15)';
            el.style.color = '#fda4af';
            el.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        }
    });

    _patchEl('aw-training-body', el => {
        el.className = CONFIG.autoTrainEnabled ? 'expanded' : 'collapsed';
    });

    _patchEl('aw-pill-str', el => {
        el.classList.toggle('dimmed', CONFIG.trainStrengthEnabled === false);
        el.title = CONFIG.trainStrengthEnabled === false
            ? 'Kekuatan (STR) dilewati. Klik untuk mengaktifkan.'
            : 'Kekuatan (STR) aktif. Klik untuk melewati.';
    });
    _patchEl('aw-pill-edu', el => {
        el.classList.toggle('dimmed', CONFIG.trainEducationEnabled === false);
        el.title = CONFIG.trainEducationEnabled === false
            ? 'Pendidikan (EDU) dilewati. Klik untuk mengaktifkan.'
            : 'Pendidikan (EDU) aktif. Klik untuk melewati.';
    });
    _patchEl('aw-pill-eko', el => {
        el.classList.toggle('dimmed', CONFIG.trainEconomyEnabled === false);
        el.title = CONFIG.trainEconomyEnabled === false
            ? 'Ekonomi (EKO) dilewati. Klik untuk mengaktifkan.'
            : 'Ekonomi (EKO) aktif. Klik untuk melewati.';
    });

    _patchEl('aw-train-str-val', el => el.textContent = String(state.trainingStats?.strength ?? '--'));
    _patchEl('aw-train-edu-val', el => el.textContent = String(state.trainingStats?.education ?? '--'));
    _patchEl('aw-train-eko-val', el => el.textContent = String(state.trainingStats?.economy ?? '--'));

    _patchEl('aw-train-focus-label', el => {
        const textEl = document.getElementById('aw-train-focus-text') || el;
        const iconEl = document.getElementById('aw-train-target-icon');
        let iconColor = '#fda4af';
        if (!CONFIG.autoTrainEnabled) {
            textEl.textContent = 'Auto Latihan Nonaktif';
            el.style.color = '#64748b';
            iconColor = '#64748b';
        } else if (activeStatCount === 0) {
            textEl.textContent = 'Semua stat nonaktif (Pilih di kartu)';
            el.style.color = '#f59e0b';
            iconColor = '#f59e0b';
        } else if (state.activeTraining?.stat) {
            const statMap = { strength: 'Kekuatan', education: 'Pendidikan', economy: 'Ekonomi' };
            const statColorMap = { strength: '#f43f5e', education: '#38bdf8', economy: '#10b981' };
            const statName = statMap[state.activeTraining.stat] || state.activeTraining.stat;
            const targetLv = state.activeTraining.targetLevel ? ` Lv ${state.activeTraining.targetLevel}` : '';
            textEl.textContent = `Fokus: ${statName}${targetLv}`;
            iconColor = statColorMap[state.activeTraining.stat] || '#f43f5e';
            el.style.color = iconColor;
        } else if (trainStatus.timerText === 'MAX') {
            if (activeStatCount === 1) {
                const targetStat = CONFIG.trainStrengthEnabled !== false ? 'Kekuatan' : (CONFIG.trainEducationEnabled !== false ? 'Pendidikan' : 'Ekonomi');
                const targetLv = CONFIG.trainStrengthEnabled !== false ? (CONFIG.targetStrength || 100) : (CONFIG.trainEducationEnabled !== false ? (CONFIG.targetEducation || 100) : (CONFIG.targetEconomy || 100));
                textEl.textContent = `Target ${targetStat} Lv ${targetLv} Tercapai!`;
            } else {
                textEl.textContent = 'Semua Target Tercapai (MAX)';
            }
            el.style.color = '#34d399';
            iconColor = '#34d399';
        } else {
            if (activeStatCount === 1) {
                if (CONFIG.trainStrengthEnabled !== false) {
                    textEl.textContent = `Fokus: Kekuatan Lv ${CONFIG.targetStrength || 83}`;
                    el.style.color = '#fda4af';
                    iconColor = '#f43f5e';
                } else if (CONFIG.trainEducationEnabled !== false) {
                    textEl.textContent = `Fokus: Pendidikan Lv ${CONFIG.targetEducation || 100}`;
                    el.style.color = '#7dd3fc';
                    iconColor = '#38bdf8';
                } else {
                    textEl.textContent = `Fokus: Ekonomi Lv ${CONFIG.targetEconomy || 100}`;
                    el.style.color = '#6ee7b7';
                    iconColor = '#10b981';
                }
            } else {
                textEl.textContent = `Rotasi Multi-Stat (${activeStatCount} Stat Aktif)`;
                el.style.color = '#38bdf8';
                iconColor = '#38bdf8';
            }
        }
        if (iconEl) iconEl.style.color = iconColor;
    });

    _patchEl('aw-train-timer-text', el => {
        el.textContent = trainStatus.timerText;
        el.style.color = trainStatus.isActive ? '#ffffff' : (trainStatus.timerText === 'MAX' ? '#34d399' : (CONFIG.autoTrainEnabled ? '#38bdf8' : '#64748b'));
    });

    _patchEl('aw-train-progress-bar', el => {
        if (!state.activeTraining?.endsAt) {
            el.style.width = '0%';
        } else {
            const pct = getTrainingProgressPercentage(state.activeTraining, state.trainingStats);
            el.style.width = `${pct}%`;
        }
    });

    _patchEl('aw-train-badge-dot', el => {
        el.style.background = CONFIG.autoTrainEnabled ? '#10b981' : '#64748b';
        el.style.boxShadow = CONFIG.autoTrainEnabled ? '0 0 6px #10b981' : 'none';
    });
    _patchEl('aw-train-badge-text', el => {
        el.textContent = CONFIG.autoTrainEnabled ? 'AKTIF' : '• OFF';
    });
    _patchEl('aw-training-toggle-badge', el => {
        if (CONFIG.autoTrainEnabled) {
            el.className = 'btn-cyber';
            el.style.background = 'rgba(16, 185, 129, 0.2)';
            el.style.color = '#34d399';
            el.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        } else {
            el.className = 'btn-cyber badge-train-off';
            el.style.background = '';
            el.style.color = '';
            el.style.borderColor = '';
        }
    });
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

    if (!state.tabLockManaged || state.isTabLockOwner || isDashboardPage()) {
        if (state.hasInitialDomEnergyRead || state.currentEnergy > 0 || state.postShiftEnergy === 0) {
            saveLiveStatus(state, CONFIG);
        }
    }
}

/** Updates only the running indicator buttons — called from doWork on pause/resume. */
export function setRunningUI(running) {
    _patchEl('aw-toggle-text', el => el.textContent = running ? 'Jeda Bot' : 'Lanjutkan');
    _patchEl('aw-toggle-icon', el => el.innerHTML = running ? ICONS.pause : ICONS.play);
    _patchEl('aw-toggle', el => {
        el.style.background = running
            ? 'rgba(244, 63, 94, 0.2)'
            : 'rgba(16, 185, 129, 0.2)';
        el.style.borderColor = running
            ? 'rgba(244, 63, 94, 0.45)'
            : 'rgba(16, 185, 129, 0.45)';
        el.style.color = running ? '#fda4af' : '#6ee7b7';
    });
    _patchEl('aw-status-dot', el => {
        el.className = running ? 'status-dot-active' : '';
        el.style.background = running ? '#10b981' : '#f43f5e';
    });
    _patchEl('aw-mode-title-badge', el => {
        el.textContent = running ? 'Auto Kerja: AKTIF' : 'Auto Kerja: DIJEDA';
        el.style.background = running ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
        el.style.borderColor = running ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)';
        el.style.color = running ? '#34d399' : '#f43f5e';
    });
    _patchEl('aw-pill-toggle', el => {
        el.innerHTML = running ? ICONS.pause : ICONS.play;
        el.title = running ? 'Jeda Worker' : 'Lanjutkan Worker';
        el.style.background = running
            ? 'rgba(244, 63, 94, 0.2)'
            : 'rgba(16, 185, 129, 0.2)';
        el.style.borderColor = running
            ? 'rgba(244, 63, 94, 0.4)'
            : 'rgba(16, 185, 129, 0.4)';
        el.style.color = running ? '#fda4af' : '#6ee7b7';
    });
    _patchEl('aw-pill-status-dot', el => {
        el.className = running ? 'status-dot-active' : '';
        el.style.background = running ? '#10b981' : '#f43f5e';
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

    if (!state.panelVisible) {
        showInPageNotification(
            'Panel Auto Worker Disembunyikan',
            'Tekan ' + (CONFIG?.shortcuts?.showHide?.display || 'Ctrl+Shift+A') + ' atau buka Pengaturan (' + (CONFIG?.shortcuts?.openSettings?.display || 'Ctrl+Shift+S') + ') untuk memunculkan kembali.'
        );
    } else {
        showInPageNotification('Panel Auto Worker Aktif', 'Panel in-game berhasil dimunculkan kembali.');
    }
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

    // Ensure the panel itself is visible when switching modes
    state.panelVisible = true;
    state.userManuallyToggledPanel = false;
    setValue('panelVisible', 'true');
    panel.style.display = 'block';

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

        // Clamp coordinates within visible viewport so pill never gets lost
        const maxX = Math.max(10, window.innerWidth - 300);
        const maxY = Math.max(10, window.innerHeight - 46);
        if (state.panelX > maxX || state.panelX < 10) {
            state.panelX = Math.max(10, Math.min(state.panelX || 10, maxX));
            panel.style.left = state.panelX + 'px';
            setValue('panelX', state.panelX.toString());
        }
        if (state.panelY > maxY || state.panelY < 10) {
            state.panelY = Math.max(10, Math.min(state.panelY || 10, maxY));
            panel.style.top = state.panelY + 'px';
            setValue('panelY', state.panelY.toString());
        }

        if (minimizeBtn) {
            minimizeBtn.innerHTML = ICONS.expand;
            minimizeBtn.title = 'Perbesar Panel';
        }
    } else {
        // Prevent overflowing the viewport edge when expanding
        const maxX = Math.max(10, window.innerWidth - 376);
        const maxY = Math.max(10, window.innerHeight - 100);
        if (state.panelX > maxX && maxX > 0) {
            state.panelX = Math.max(10, maxX);
            panel.style.left = state.panelX + 'px';
            setValue('panelX', state.panelX.toString());
        }
        if (state.panelY > maxY && maxY > 0) {
            state.panelY = Math.max(10, maxY);
            panel.style.top = state.panelY + 'px';
            setValue('panelY', state.panelY.toString());
        }

        if (fullContainer) fullContainer.style.display = 'flex';
        if (pillContainer) pillContainer.style.display = 'none';

        panel.style.width = '356px';
        panel.style.minWidth = '356px';
        panel.style.maxWidth = '356px';
        panel.style.background = 'transparent';
        panel.style.backdropFilter = 'none';
        panel.style.webkitBackdropFilter = 'none';
        panel.style.border = 'none';
        panel.style.boxShadow = 'none';
        panel.style.borderRadius = '16px';
        panel.style.padding = '0';
        panel.style.overflow = 'visible';
        if (minimizeBtn) {
            minimizeBtn.innerHTML = ICONS.shrink;
            minimizeBtn.title = 'Mode Ringkas (Pill)';
        }
    }
}

function _buildPanelHTML(state, CONFIG) {
    const isMin    = Boolean(state.panelMinimized);
    const isPinned = CONFIG.panelPinned;
    const running  = state.running;
    const safeMax  = (state.maxEnergy && state.maxEnergy > 0) ? state.maxEnergy : 110;
    const energyPct = Math.max(0, Math.min(100, Math.round(((state.currentEnergy || 0) / safeMax) * 100)));

    return `
        <!-- Full Panel View (Argon Surface A - 356px Cyber Abyss Glass Shell) -->
        <div id="aw-full-container" class="paw-shell" style="
            display: ${isMin ? 'none' : 'flex'};
            flex-direction: column;
            gap: 10px;
            width: 356px;
            border-radius: 16px;
            padding: 14px;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
        ">
            <!-- Top Subtle Accent Cyan Glow Line -->
            <div style="position: absolute; top: 0; left: 24px; right: 24px; height: 1px; background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.6), transparent); pointer-events: none;"></div>

            <!-- 1. Header Bar -->
            <div id="aw-header" style="
                display: flex; align-items: center; justify-content: space-between;
                padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                cursor: ${isPinned ? 'default' : 'move'}; user-select: none;
            ">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); display: flex; align-items: center; justify-content: center; color: #38bdf8; flex-shrink: 0;">
                        ${ICONS.robot}
                    </div>
                    <span style="font-size: 13px; font-weight: 700; letter-spacing: 0.6px; color: #ffffff; text-transform: uppercase;">AUTO WORKER</span>
                    <span id="aw-status-dot" class="${running ? 'status-dot-active' : ''}" style="
                        width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0;
                        background: ${running ? '#10b981' : '#f43f5e'};
                    "></span>
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button id="aw-minimize" class="btn-cyber aw-header-btn" title="Mode Ringkas (Floating Pill)" style="
                        width: 28px; height: 28px; border-radius: 8px; background: rgba(30, 41, 59, 0.8);
                        border: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e1; display: flex;
                        align-items: center; justify-content: center; cursor: pointer;
                    ">${isMin ? ICONS.expand : ICONS.shrink}</button>
                    <button id="aw-pin" class="btn-cyber aw-header-btn" title="${isPinned ? 'Lepas Kunci (Unpin)' : 'Kunci Posisi (Pin)'}" style="
                        width: 28px; height: 28px; border-radius: 8px;
                        background: ${isPinned ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.8)'};
                        border: 1px solid ${isPinned ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.1)'};
                        color: ${isPinned ? '#38bdf8' : '#cbd5e1'}; display: flex;
                        align-items: center; justify-content: center; cursor: pointer;
                    ">${isPinned ? ICONS.lockClosed : ICONS.lockOpen}</button>
                    <button id="aw-settings" class="btn-cyber aw-header-btn" title="Pengaturan" style="
                        width: 28px; height: 28px; border-radius: 8px; background: rgba(30, 41, 59, 0.8);
                        border: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e1; display: flex;
                        align-items: center; justify-content: center; cursor: pointer;
                    ">${ICONS.settings}</button>
                    <button id="aw-hide" class="btn-cyber aw-header-btn" title="Sembunyikan (${CONFIG.shortcuts.showHide.display})" style="
                        width: 28px; height: 28px; border-radius: 8px; background: rgba(30, 41, 59, 0.8);
                        border: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e1; display: flex;
                        align-items: center; justify-content: center; cursor: pointer;
                    ">${ICONS.close}</button>
                </div>
            </div>

            <!-- Banners -->
            <div id="aw-circuit-breaker-banner" style="display: ${state.circuitBreakerActive ? 'block' : 'none'}; padding: 8px 12px; background: rgba(244, 63, 94, 0.18); border: 1px solid rgba(244, 63, 94, 0.4); border-radius: 8px; color: #fca5a5; font-size: 11.5px; line-height: 1.4; text-align: center; font-weight: 600;">
                Pemeriksaan keamanan aktif (${state.circuitBreakerReason || 'Cloudflare/Maintenance'}). Worker dijeda.
            </div>
            <div id="aw-uncertain-banner" style="display: ${state.workResultUncertain ? 'block' : 'none'}; padding: 9px 12px; background: rgba(244, 63, 94, 0.14); border: 1px solid rgba(244, 63, 94, 0.5); border-radius: 8px; color: #fecdd3; font-size: 11.5px; line-height: 1.4;">
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #f43f5e; margin-bottom: 3px;">
                    <span style="display: flex; align-items: center;">${ICONS.alert}</span> Hasil kerja belum pasti
                </div>
                <div>Periksa halaman game sebelum melanjutkan.</div>
                <div id="aw-reconciliation-status" style="margin-top: 3px; color: #fcd34d;">Status rekonsiliasi: menunggu pembacaan energi.</div>
                <button id="aw-confirm-uncertain" class="btn-cyber" style="margin-top: 6px; padding: 5px 9px; background: #991b1b; color: #fff; border: 1px solid #dc2626; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;">Saya sudah memeriksa, lanjutkan</button>
            </div>

            <!-- 2. Location & Buff + Server UTC Row (in 1 .paw-card) -->
            <div class="paw-card" style="padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                <!-- Location & Buff -->
                <div id="aw-region-badge" style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 7px; overflow: hidden;">
                        <span style="color: #38bdf8; display: flex; align-items: center; flex-shrink: 0;">${ICONS.mapPin}</span>
                        <span style="color: #94a3b8; font-size: 11.5px;">Lokasi:</span>
                        <span id="aw-region-name" style="font-weight: 600; color: #ffffff; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${state.regionName || 'Memuat wilayah...'}</span>
                    </div>
                    <span id="aw-region-buff" class="tabular-nums" style="
                        background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);
                        padding: 2px 7px; border-radius: 6px; font-weight: 600; font-size: 11px; white-space: nowrap;
                    ">${state.regionHealthBonusPercent ? `+${state.regionHealthBonusPercent}% Regen` : 'Normal (1.0x)'}</span>
                </div>

                <div style="height: 1px; background: rgba(255, 255, 255, 0.06);"></div>

                <!-- Server UTC & Reset -->
                <div id="aw-utc-bar" style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="color: #818cf8; display: flex; align-items: center; flex-shrink: 0;">${ICONS.clock}</span>
                        <span id="aw-utc-time" class="tabular-nums" style="color: #e2e8f0; font-weight: 600; font-size: 12.5px;">00:00:00 UTC</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span id="aw-utc-reset" class="tabular-nums" style="font-size: 11.5px; color: #94a3b8;">Reset: --j --m</span>
                        <span id="aw-flush-badge" class="badge-flush-pulse tabular-nums" style="display: none; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 4px; padding: 1px 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.3px;">FLUSH</span>
                    </div>
                </div>
            </div>

            <!-- 3. Food Tracker (Roti) -->
            <div id="aw-food-bar" class="paw-card" style="padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.25); display: flex; align-items: center; justify-content: center; color: #f59e0b; flex-shrink: 0;">
                        ${ICONS.utensils}
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #94a3b8; font-weight: 500;">Kuota Roti Harian</div>
                        <div style="font-size: 10.5px; color: #64748b;">Sinkron Otomatis</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="aw-food-slot-text" class="tabular-nums" style="font-size: 13.5px; font-weight: 700; color: #ffffff;">${state.foodEatenToday || 0}/${CONFIG.maxFoodDaily || 10}</span>
                    <span id="aw-food-reminder" class="tabular-nums" style="font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: ${(CONFIG.maxFoodDaily || 10) - (state.foodEatenToday || 0) === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; border: 1px solid ${(CONFIG.maxFoodDaily || 10) - (state.foodEatenToday || 0) === 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}; color: ${(CONFIG.maxFoodDaily || 10) - (state.foodEatenToday || 0) === 0 ? '#10b981' : '#fbbf24'};">${(CONFIG.maxFoodDaily || 10) - (state.foodEatenToday || 0) === 0 ? 'Kuota habis' : `${(CONFIG.maxFoodDaily || 10) - (state.foodEatenToday || 0)} sisa`}</span>
                </div>
            </div>

            <!-- 4. Live Energy Card -->
            <div class="paw-card" style="padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="color: #38bdf8; display: flex; align-items: center;">${ICONS.zap}</span>
                        <span style="font-size: 11.5px; font-weight: 700; letter-spacing: 0.5px; color: #cbd5e1; text-transform: uppercase;">ENERGI</span>
                    </div>
                    <div style="display: flex; align-items: baseline; gap: 4px;">
                        <span id="aw-energy-text" class="tabular-nums" style="font-size: 19px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">${(isDashboardPage() && !state.hasInitialDomEnergyRead && (!state.currentEnergy || state.currentEnergy <= 0)) ? 'Sinkronisasi...' : `${state.currentEnergy}/${state.maxEnergy}`}</span>
                        <span id="aw-energy-pct" class="tabular-nums" style="font-size: 12px; color: #38bdf8; font-family: 'JetBrains Mono', monospace;">(${energyPct}%)</span>
                    </div>
                </div>
                <div style="width: 100%; height: 9px; border-radius: 999px; background: rgba(10, 14, 26, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden; padding: 1px; box-sizing: border-box;">
                    <div id="aw-energy-bar" class="energy-progress-fill" style="height: 100%; width: ${energyPct}%;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: #94a3b8; padding-top: 1px;">
                    <span id="aw-next-wrap" style="cursor: help;">Next: <span id="aw-next-work" class="tabular-nums" style="color: #38bdf8; font-weight: 600;">Now</span></span>
                    <span id="aw-full-wrap" style="cursor: help;">Full: <span id="aw-full-energy" class="tabular-nums" style="color: #cbd5e1; font-weight: 600;">${getTimeToFullEnergy(state)}</span></span>
                </div>
            </div>

            <!-- 5. Focused Auto Work Status Card -->
            <div class="paw-card rounded-xl" style="padding: 11px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span id="aw-mode-title-badge" style="width: fit-content; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; background: ${running ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)'}; border: 1px solid ${running ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}; color: ${running ? '#34d399' : '#f43f5e'};">
                        ${running ? 'Auto Kerja: AKTIF' : 'Auto Kerja: DIJEDA'}
                    </span>
                    <div style="font-size: 11.5px; color: #94a3b8; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                        <span>Target Ambang:</span>
                        <span class="tabular-nums" style="padding: 1px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-weight: 600;">≥ <span id="aw-target-threshold">${CONFIG.energyThreshold || 10}</span> EN</span>
                    </div>
                </div>
                <div class="paw-well" style="padding: 6px 12px; border-radius: 10px; text-align: right;">
                    <div style="font-size: 11px; color: #94a3b8;">Hitung Mundur</div>
                    <div id="aw-shift-countdown" class="tabular-nums" style="font-size: 17px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">${(isDashboardPage() && !state.hasInitialDomEnergyRead && (!state.currentEnergy || state.currentEnergy <= 0)) ? 'Sinkronisasi...' : getLiveCountdown(state, CONFIG)}</div>
                </div>
            </div>

            <!-- 6. Latihan Stats Card -->
            <div id="aw-training-card" class="paw-card" style="padding: 11px 12px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; min-height: 28px;">
                    <div style="display: flex; align-items: center; gap: 7px;">
                        <span style="color: #818cf8; display: flex; align-items: center;">${ICONS.dumbbell}</span>
                        <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.5px; color: #cbd5e1; text-transform: uppercase;">LATIHAN STATS</span>
                        <span id="aw-train-count-badge" class="tabular-nums" style="font-size: 11px; font-weight: 600; padding: 1.5px 7px; border-radius: 4px; background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.3); color: #fda4af;">${CONFIG.autoTrainEnabled ? `${(CONFIG.trainStrengthEnabled !== false ? 1 : 0) + (CONFIG.trainEducationEnabled !== false ? 1 : 0) + (CONFIG.trainEconomyEnabled !== false ? 1 : 0)}/3 Aktif` : 'Nonaktif'}</span>
                    </div>
                    <button id="aw-training-toggle-badge" type="button" class="btn-cyber ${CONFIG.autoTrainEnabled ? '' : 'badge-train-off'}" style="
                        font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px;
                        ${CONFIG.autoTrainEnabled ? 'background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);' : ''}
                        cursor: pointer; display: flex; align-items: center; gap: 5px;
                    " title="Aktifkan / Sembunyikan Latihan Stats">
                        <span id="aw-train-badge-dot" style="width: 6px; height: 6px; border-radius: 50%; background: ${CONFIG.autoTrainEnabled ? '#10b981' : '#64748b'}; display: inline-block;"></span>
                        <span id="aw-train-badge-text">${CONFIG.autoTrainEnabled ? 'AKTIF' : '• OFF'}</span>
                    </button>
                </div>

                <!-- Collapsible Training Body -->
                <div id="aw-training-body" class="${CONFIG.autoTrainEnabled ? 'expanded' : 'collapsed'}">
                    <!-- 3 Mini Stat Pills (Interactive Click to toggle) -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 8px;">
                        <div id="aw-pill-str" class="aw-mini-stat-pill pill-str ${CONFIG.trainStrengthEnabled !== false ? '' : 'dimmed'}" title="Klik untuk toggle latihan STR">
                            <span class="pill-lbl">STR</span>
                            <span id="aw-train-str-val" class="stat-val tabular-nums">${state.trainingStats?.strength || '--'}</span>
                        </div>
                        <div id="aw-pill-edu" class="aw-mini-stat-pill pill-edu ${CONFIG.trainEducationEnabled !== false ? '' : 'dimmed'}" title="Klik untuk toggle latihan EDU">
                            <span class="pill-lbl">EDU</span>
                            <span id="aw-train-edu-val" class="stat-val tabular-nums">${state.trainingStats?.education || '--'}</span>
                        </div>
                        <div id="aw-pill-eko" class="aw-mini-stat-pill pill-eko ${CONFIG.trainEconomyEnabled !== false ? '' : 'dimmed'}" title="Klik untuk toggle latihan EKO">
                            <span class="pill-lbl">EKO</span>
                            <span id="aw-train-eko-val" class="stat-val tabular-nums">${state.trainingStats?.economy || '--'}</span>
                        </div>
                    </div>

                    <!-- Focus Sub-well matching Gambar 2 -->
                    <div class="paw-well" style="padding: 8px 10px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px;">
                            <span id="aw-train-focus-label" style="font-weight: 600; color: #fda4af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; display: flex; align-items: center; gap: 6px;">
                                <span id="aw-train-target-icon" style="display: flex; align-items: center; color: #f43f5e; flex-shrink: 0;">${ICONS.target}</span>
                                <span id="aw-train-focus-text">Fokus: Kekuatan Lv ${CONFIG.targetStrength || 83}</span>
                            </span>
                            <span id="aw-train-timer-text" class="tabular-nums" style="font-weight: 700; color: #ffffff; white-space: nowrap;">1j 13m</span>
                        </div>
                        <div style="width: 100%; height: 6px; border-radius: 999px; background: rgba(10, 14, 26, 0.95); overflow: hidden;">
                            <div id="aw-train-progress-bar" class="stat-progress-fill" style="height: 100%; width: 64%; border-radius: 999px; transition: width 0.35s ease;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 7. Sesi Auth Row -->
            <div class="paw-card" style="padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 7px;">
                    <span style="color: #10b981; display: flex; align-items: center;">${ICONS.shield}</span>
                    <span style="color: #94a3b8; font-size: 12px;">Sesi Token Auth:</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="aw-token-status" style="font-weight: 700; color: #34d399; font-size: 11.5px; padding: 1.5px 7px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3);">VALID</span>
                    <span id="aw-token-expiry" class="tabular-nums" style="font-size: 12.5px; color: #e2e8f0; font-weight: 600;">--</span>
                </div>
            </div>

            <!-- 8. 3 Action Buttons (Gambar 3) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding-top: 2px;">
                <button id="aw-work-now" class="btn-cyber aw-btn-action" style="
                    background: linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%);
                    color: #020617; border: 1px solid rgba(56, 189, 248, 0.5);
                    padding: 9px 0; border-radius: 12px; cursor: pointer;
                    font-weight: 700; font-size: 12px; box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                ">
                    ${ICONS.zap}
                    <span>Kerja</span>
                </button>
                <button id="aw-toggle" class="btn-cyber aw-btn-action" style="
                    background: ${running ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)'};
                    color: ${running ? '#fda4af' : '#6ee7b7'};
                    border: 1px solid ${running ? 'rgba(244, 63, 94, 0.45)' : 'rgba(16, 185, 129, 0.45)'};
                    padding: 9px 0; border-radius: 12px; cursor: pointer;
                    font-weight: 600; font-size: 12px;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                ">
                    <span id="aw-toggle-icon" style="display: flex; align-items: center;">${running ? ICONS.pause : ICONS.play}</span>
                    <span id="aw-toggle-text">${running ? 'Jeda Bot' : 'Lanjutkan'}</span>
                </button>
                <button id="aw-logs" class="btn-cyber aw-btn-action" style="
                    background: rgba(30, 41, 59, 0.9);
                    color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 9px 0; border-radius: 12px; cursor: pointer;
                    font-weight: 600; font-size: 12px;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                ">
                    <span style="display: flex; align-items: center; color: #94a3b8;">${ICONS.terminal}</span>
                    <span>Log Bot</span>
                </button>
            </div>
        </div>

        <!-- Mode Ringkas: Floating Pill Capsule (Height: 36px) -->
        <div id="aw-pill-container" class="paw-shell aw-pill-box" style="
            display: ${isMin ? 'flex' : 'none'};
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            height: 36px;
            padding: 0 10px;
            border-radius: 999px;
            border: 1px solid rgba(56, 189, 248, 0.25);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65);
            cursor: ${isPinned ? 'default' : 'move'};
            box-sizing: border-box;
            white-space: nowrap;
        " title="Auto Worker • Seret untuk pindah • Klik 2x untuk perbesar">
            <div style="display: flex; align-items: center; gap: 7px; flex-shrink: 0;">
                <span style="color: #38bdf8; display: flex; align-items: center;">${ICONS.robot}</span>
                <span id="aw-pill-status-dot" class="${running ? 'status-dot-active' : ''}" style="
                    width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0;
                    background: ${running ? '#10b981' : '#f43f5e'};
                "></span>
            </div>

            <!-- Energy Badge -->
            <div id="aw-pill-energy-badge" class="tabular-nums" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(56, 189, 248, 0.15);
                border: 1px solid rgba(56, 189, 248, 0.25);
                border-radius: 999px;
                padding: 2px 8px;
                font-size: 12px;
                font-weight: 600;
                color: #7dd3fc;
                flex-shrink: 0;
            " title="Energi Saat Ini">
                <span style="display: flex; align-items: center; color: #38bdf8;">${ICONS.zap}</span>
                <span id="aw-pill-energy">${state.currentEnergy || 0}/${state.maxEnergy || 110}</span>
            </div>

            <!-- Countdown Badge -->
            <div id="aw-pill-countdown-badge" class="tabular-nums" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(30, 41, 59, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 999px;
                padding: 2px 8px;
                font-size: 12px;
                font-weight: 500;
                color: #e2e8f0;
                flex-shrink: 0;
            " title="Countdown Giliran Kerja">
                <span id="aw-pill-countdown-icon" style="display: flex; align-items: center; color: #818cf8;">${ICONS.clock}</span>
                <span id="aw-pill-countdown">Memuat...</span>
            </div>

            <!-- Mini Actions -->
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                <button id="aw-pill-toggle" class="btn-cyber aw-pill-btn" style="
                    width: 24px; height: 24px; border-radius: 50%;
                    background: ${running ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)'};
                    border: 1px solid ${running ? 'rgba(244, 63, 94, 0.4)' : 'rgba(16, 185, 129, 0.4)'};
                    color: ${running ? '#fda4af' : '#6ee7b7'}; font-size: 9.5px; font-weight: 700;
                    display: flex; align-items: center; justify-content: center; cursor: pointer;
                " title="${running ? 'Jeda Worker' : 'Lanjutkan Worker'}">${running ? ICONS.pause : ICONS.play}</button>

                <button id="aw-pill-expand" class="btn-cyber aw-pill-btn" style="
                    width: 24px; height: 24px; border-radius: 50%;
                    background: rgba(30, 41, 59, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #cbd5e1; display: flex; align-items: center; justify-content: center; cursor: pointer;
                " title="Perbesar ke Mode Penuh">${ICONS.expand}</button>
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
        const currentWidth = state.panelMinimized ? 280 : 376;
        const currentHeight = state.panelMinimized ? 40 : 300;
        const maxX = Math.max(0, window.innerWidth - currentWidth);
        const maxY = Math.max(0, window.innerHeight - currentHeight);
        state.panelX = Math.max(0, Math.min(origX + e.clientX - startX, maxX));
        state.panelY = Math.max(0, Math.min(origY + e.clientY - startY, maxY));
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
    const { openSettings, openLogViewer, doWork } = ctx;

    const minimizeBtn   = document.getElementById('aw-minimize');
    const pinBtn        = document.getElementById('aw-pin');
    const hideBtn       = document.getElementById('aw-hide');
    const toggleBtn     = document.getElementById('aw-toggle');
    const workNowBtn    = document.getElementById('aw-work-now');
    const logsBtn       = document.getElementById('aw-logs');
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
        if (!chrome?.runtime?.id) {
            window.location.reload();
            return;
        }
        state.running = !state.running;
        setValue('aw_worker_running', state.running.toString());
        setRunningUI(state.running);
        ctx.log(state.running ? 'Auto Worker dilanjutkan' : 'Auto Worker dijeda (Status disimpan)', 'info');
        if (state.running) ctx.wakePendingWork?.();
        saveState(state);
        const summary = saveLiveStatus(state, CONFIG, true);
        ctx.updatePanel?.();

        try {
            chrome.storage.local.set({
                aw_live_status: summary,
                aw_worker_running: state.running.toString()
            });
            broadcastTabMessage({
                type: 'TOGGLE_RUNNING',
                running: state.running,
                timestamp: Date.now()
            });
            chrome.runtime.sendMessage({
                type: 'POPUP_TO_TAB',
                action: 'toggleRunning',
                value: state.running
            }).catch(() => {});
        } catch { /* context invalidated */ }
    }

    // Quick pause/resume from pill
    pillToggleBtn?.addEventListener('click', toggleRunningState);

    settingsBtn?.addEventListener('click', () => ctx.openSettings?.());
    hideBtn?.addEventListener('click', () => togglePanelVisibility(state, CONFIG));

    toggleBtn?.addEventListener('click', toggleRunningState);

    workNowBtn?.addEventListener('click', () => {
        if (!chrome?.runtime?.id) {
            window.location.reload();
            return;
        }
        ctx.log('Manual work triggered!', 'info');
        ctx.doWork?.(true);
    });
    logsBtn?.addEventListener('click', () => ctx.openLogViewer?.());



    // Training quick toggle handler
    const trainBadge = document.getElementById('aw-training-toggle-badge');
    trainBadge?.addEventListener('click', (e) => {
        e.stopPropagation();
        CONFIG.autoTrainEnabled = !CONFIG.autoTrainEnabled;
        ctx.saveConfig?.(CONFIG);
        ctx.log?.(`Auto Latihan Stats ${CONFIG.autoTrainEnabled ? 'diaktifkan' : 'dinonaktifkan'}.`, 'info');
        ctx.updatePanel?.();
        if (CONFIG.autoTrainEnabled) {
            ctx.executeAutoTrain?.();
        }
    });

    // Mini stat pills toggle handlers
    const pillStr = document.getElementById('aw-pill-str');
    const pillEdu = document.getElementById('aw-pill-edu');
    const pillEko = document.getElementById('aw-pill-eko');

    pillStr?.addEventListener('click', (e) => {
        e.stopPropagation();
        CONFIG.trainStrengthEnabled = CONFIG.trainStrengthEnabled === false;
        ctx.saveConfig?.(CONFIG);
        ctx.log?.(`Target STR ${CONFIG.trainStrengthEnabled ? 'diaktifkan' : 'dilewati'}.`, 'info');
        ctx.updatePanel?.();
        if (CONFIG.autoTrainEnabled) ctx.executeAutoTrain?.();
    });

    pillEdu?.addEventListener('click', (e) => {
        e.stopPropagation();
        CONFIG.trainEducationEnabled = CONFIG.trainEducationEnabled === false;
        ctx.saveConfig?.(CONFIG);
        ctx.log?.(`Target EDU ${CONFIG.trainEducationEnabled ? 'diaktifkan' : 'dilewati'}.`, 'info');
        ctx.updatePanel?.();
        if (CONFIG.autoTrainEnabled) ctx.executeAutoTrain?.();
    });

    pillEko?.addEventListener('click', (e) => {
        e.stopPropagation();
        CONFIG.trainEconomyEnabled = CONFIG.trainEconomyEnabled === false;
        ctx.saveConfig?.(CONFIG);
        ctx.log?.(`Target EKO ${CONFIG.trainEconomyEnabled ? 'diaktifkan' : 'dilewati'}.`, 'info');
        ctx.updatePanel?.();
        if (CONFIG.autoTrainEnabled) ctx.executeAutoTrain?.();
    });

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
        setValue('aw_worker_running', 'true');
        setRunningUI(true);
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
