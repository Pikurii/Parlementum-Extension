/**
 * popup.js — Interactive Extension Toolbar Controller
 * Synchronized with the modernized dark-glassmorphic in-game floating panel.
 */

const SVGS = {
    zap: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    pause: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    play: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    terminal: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`,
    target: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>`,
    clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    shield: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`
};

let currentStatus = {
    running: true,
    currentEnergy: 0,
    maxEnergy: 100,
    nextWorkTimestamp: 0,
    hasToken: false,
    tokenExpiry: null,
    tokenExpired: false,
    pausedForToken: false,
    energyThreshold: 10,
    regionName: '',
    regionHealthBonusPercent: 0,
    regenRate: 1.0,
    lastLogMessage: '',
    updatedAt: Date.now()
};

let currentConfig = {
    energyThreshold: 10,
    sleepScheduleEnabled: false,
    sleepStartHour: 1,
    sleepEndHour: 6
};

function parseConfig(raw) {
    if (!raw) return { energyThreshold: 10 };
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return { energyThreshold: 10 }; }
    }
    return raw;
}

function _isSleepTime(cfg) {
    if (!cfg?.sleepScheduleEnabled) return false;
    const h = new Date().getHours();
    const start = cfg.sleepStartHour ?? 1;
    const end = cfg.sleepEndHour ?? 6;
    return start < end ? (h >= start && h < end) : (h >= start || h < end);
}

function getTimeUntilExpiry(tokenExpiry) {
    if (!tokenExpiry) return '--';
    const diff = Number(tokenExpiry) - Date.now();
    if (diff <= 0) return 'EXPIRED';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
}

function calculateLevelTrainingSeconds(targetLevel, educationLevel = 0) {
    const n = Math.max(1, parseInt(targetLevel, 10) || 1);
    const sedu = Math.max(0, parseInt(educationLevel, 10) || 0);
    const raw = 0.2894 * Math.pow(n, 2.5) * (1 / (1 + 0.01 * sedu));
    return Math.max(1, Math.round(raw));
}

function getTrainingProgressPercentage(activeTraining, trainingStats = null) {
    if (!activeTraining || !activeTraining.endsAt) return 0;
    if (typeof activeTraining.domProgressPct === 'number' && activeTraining.domProgressPct > 0 && activeTraining.domProgressPct <= 100) {
        return Math.max(0, Math.min(100, activeTraining.domProgressPct));
    }
    const endsMs = new Date(activeTraining.endsAt).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, endsMs - now);
    if (diffMs <= 0) return 100;

    const targetLevel = activeTraining.targetLevel || 1;
    const eduLevel = trainingStats?.education || 0;
    const formulaSec = calculateLevelTrainingSeconds(targetLevel, eduLevel);
    const totalSec = activeTraining.totalSeconds || formulaSec || 3600;
    const totalMs = totalSec * 1000;

    const effectiveTotalMs = Math.max(totalMs, diffMs + 1000);
    const elapsedMs = Math.max(0, effectiveTotalMs - diffMs);
    const pct = Math.round((elapsedMs / effectiveTotalMs) * 100);

    return Math.max(2, Math.min(100, pct));
}

function getTimeToFullEnergy(currentE, maxE, regenRate) {
    const safeMax = Math.max(50, maxE || 100);
    const cur = Math.max(0, currentE ?? 0);
    const needed = Math.max(0, safeMax - cur);
    if (needed <= 0) return 'Penuh!';

    const rate = Math.max(0.5, regenRate || 1.0);
    const exactMinutes = Math.max(1, Math.round(needed / rate));

    if (exactMinutes < 60) {
        return `~${exactMinutes} mnt`;
    }
    const h = Math.floor(exactMinutes / 60);
    const m = exactMinutes % 60;
    if (m === 0) return `~${h} j`;
    if (h < 24) return `~${h} j ${m} mnt`;
    const d = Math.floor(h / 24);
    return `~${d} hari ${h % 24} j`;
}

// ── DOM References ──────────────────────────────────────────────────────────
const elStatusDot     = document.getElementById('popup-status-dot');
const elStatusBadge   = document.getElementById('popup-status-badge');
const elStatusText    = document.getElementById('popup-status-text');

const elRegionRow     = document.getElementById('popup-region-row');
const elRegionText    = document.getElementById('popup-region-text');
const elRegionBuff    = document.getElementById('popup-region-buff');

const elUtcTime       = document.getElementById('popup-utc-time');
const elUtcReset      = document.getElementById('popup-utc-reset');
const elFlushBadge    = document.getElementById('popup-flush-badge');

const elFoodVal       = document.getElementById('popup-food-val');
const elFoodStatus    = document.getElementById('popup-food-status');
const elCbBanner      = document.getElementById('popup-cb-banner');

const elEnergyVal     = document.getElementById('popup-energy-val');
const elEnergyPct     = document.getElementById('popup-energy-pct');
const elBarFill       = document.getElementById('popup-bar-fill');
const elNextWork      = document.getElementById('popup-next-work');
const elFullEnergy    = document.getElementById('popup-full-energy');

const elModeBadge     = document.getElementById('popup-mode-badge');
const elModeIcon      = document.getElementById('popup-mode-icon');
const elModeTitle     = document.getElementById('popup-mode-title');
const elEnergyTarget  = document.getElementById('popup-energy-target');
const elShiftCountdown = document.getElementById('popup-shift-countdown');

const elTokenStatus   = document.getElementById('popup-token-status');
const elTokenExpiry   = document.getElementById('popup-token-expiry');

const btnSettings     = document.getElementById('btn-popup-settings');
const elTrainBadge    = document.getElementById('popup-train-badge');
const elTrainDot      = document.getElementById('popup-train-dot');
const elTrainText     = document.getElementById('popup-train-text');
const elTrainCount    = document.getElementById('popup-train-count');
const elTrainBody     = document.getElementById('popup-train-body');
const elTrainProgress = document.getElementById('popup-train-progress-bar');
const pillStr         = document.getElementById('popup-pill-str');
const pillEdu         = document.getElementById('popup-pill-edu');
const pillEko         = document.getElementById('popup-pill-eko');
const elTrainStr      = document.getElementById('popup-train-str');
const elTrainEdu      = document.getElementById('popup-train-edu');
const elTrainEko      = document.getElementById('popup-train-eko');
const elTrainStatus   = document.getElementById('popup-train-status');
const elTrainFocusLabel = document.getElementById('popup-train-focus-label');
const elTrainTimer    = document.getElementById('popup-train-timer');

const btnWork         = document.getElementById('btn-popup-work');
const btnWorkText     = document.getElementById('btn-work-text');
const btnToggle       = document.getElementById('btn-popup-toggle');
const btnToggleIcon   = document.getElementById('btn-toggle-icon');
const btnToggleText   = document.getElementById('btn-toggle-text');
const btnOpenLog      = document.getElementById('btn-open-log-modal');
const btnOpen         = document.getElementById('btn-popup-open');

const elTabDot        = document.getElementById('popup-tab-dot');
const elTabText       = document.getElementById('popup-tab-text');

// Modal Elements
const logModal        = document.getElementById('popup-log-modal');
const btnCloseLog     = document.getElementById('btn-close-log-modal');
const logFilterText   = document.getElementById('popup-log-filter-text');
const btnClearLogs    = document.getElementById('btn-clear-popup-logs');
const logEntries      = document.getElementById('popup-log-entries');
const logCount        = document.getElementById('popup-log-count');

let currentLogs = [];
let logFilter   = 'all';
let logSearch   = '';

function calculateProjectedEnergy(syncBase, now = Date.now()) {
    if (!syncBase || typeof syncBase.current !== 'number') return 0;
    const max = syncBase.max || 115;
    if (syncBase.current >= max) return max;
    const updatedAt = syncBase.updatedAt || now;
    const elapsedMs = Math.max(0, now - updatedAt);
    const rate = Math.max(0.5, syncBase.regenRate || 1.0);
    const gained = Math.floor((elapsedMs * rate) / 60000);
    return Math.min(max, syncBase.current + gained);
}

// ── Render UI from state ────────────────────────────────────────────────────
function renderUI() {
    const isRunning = Boolean(currentStatus.running);
    const threshold = currentConfig.energyThreshold || currentStatus.energyThreshold || 10;
    const maxE      = currentStatus.maxEnergy || 100;

    // Fixed-anchor mathematical projection: zero lost fractions across renders
    const syncBase = currentStatus.energySyncBase || {
        current: currentStatus.currentEnergy ?? 0,
        max: maxE,
        updatedAt: currentStatus.updatedAt || Date.now(),
        regenRate: currentStatus.regenRate || 1.0
    };
    const now = Date.now();
    const currentE = calculateProjectedEnergy(syncBase, now);
    const pct = Math.max(0, Math.min(100, Math.round((currentE / maxE) * 100)));

    const isExpired = Boolean(
        currentStatus.tokenExpired ||
        currentStatus.pausedForToken ||
        (currentStatus.tokenExpiry && Number(currentStatus.tokenExpiry) <= Date.now())
    );

    const isSleeping = _isSleepTime(currentConfig);
    const isReadyToWork = currentE >= threshold && (!currentStatus.serverCooldownUntil || Date.now() >= currentStatus.serverCooldownUntil);

    // 1. Status badge & Header Dot
    if (isExpired) {
        if (elStatusBadge) elStatusBadge.className = 'status-badge paused';
        if (elStatusText) elStatusText.textContent = 'EXPIRED';
        if (elStatusDot) {
            elStatusDot.style.background = '#ff4444';
            elStatusDot.style.boxShadow = '0 0 8px #ff4444';
        }
        if (btnToggle) {
            btnToggle.className = 'btn-cyber action-btn btn-resume';
            if (btnToggleIcon) btnToggleIcon.innerHTML = SVGS.play;
            if (btnToggleText) btnToggleText.textContent = 'Login';
        }
    } else if (isRunning) {
        if (elStatusBadge) elStatusBadge.className = 'status-badge';
        if (elStatusText) elStatusText.textContent = 'RUNNING';
        if (elStatusDot) {
            elStatusDot.style.background = '#00ff88';
            elStatusDot.style.boxShadow = '0 0 8px #00ff88';
        }
        if (btnToggle) {
            btnToggle.className = 'btn-cyber action-btn btn-pause';
            if (btnToggleIcon) btnToggleIcon.innerHTML = SVGS.pause;
            if (btnToggleText) btnToggleText.textContent = 'Jeda Bot';
        }
    } else {
        if (elStatusBadge) elStatusBadge.className = 'status-badge paused';
        if (elStatusText) elStatusText.textContent = 'PAUSED';
        if (elStatusDot) {
            elStatusDot.style.background = '#ff4757';
            elStatusDot.style.boxShadow = '0 0 8px #ff4757';
        }
        if (btnToggle) {
            btnToggle.className = 'btn-cyber action-btn btn-resume';
            if (btnToggleIcon) btnToggleIcon.innerHTML = SVGS.play;
            if (btnToggleText) btnToggleText.textContent = 'Lanjutkan';
        }
    }

    // 0. Circuit Breaker Warning
    if (elCbBanner) {
        if (currentStatus.circuitBreakerActive) {
            elCbBanner.style.display = 'block';
            elCbBanner.textContent = `Pemeriksaan keamanan aktif (${currentStatus.circuitBreakerReason || 'Cloudflare/Maintenance'}). Worker dijeda.`;
        } else {
            elCbBanner.style.display = 'none';
        }
    }

    // 2. Region & Buff
    if (elRegionRow && elRegionText && elRegionBuff) {
        if (currentStatus.regionName) {
            elRegionRow.style.display = 'flex';
            elRegionText.textContent = currentStatus.regionName;
            elRegionBuff.textContent = (currentStatus.regionHealthBonusPercent ?? 0) > 0
                ? `+${currentStatus.regionHealthBonusPercent}% Regen`
                : 'Normal (1.0x)';
        } else {
            elRegionRow.style.display = 'flex';
            elRegionText.textContent = 'Wilayah game';
            elRegionBuff.textContent = 'Normal (1.0x)';
        }
    }

    // 3. Server Time (UTC) & Daily Reset Countdown
    const nowUtc = new Date();
    const utcH = String(nowUtc.getUTCHours()).padStart(2, '0');
    const utcM = String(nowUtc.getUTCMinutes()).padStart(2, '0');
    const utcS = String(nowUtc.getUTCSeconds()).padStart(2, '0');
    if (elUtcTime) elUtcTime.textContent = `${utcH}:${utcM}:${utcS} UTC`;
    const minsToReset = (23 - nowUtc.getUTCHours()) * 60 + (59 - nowUtc.getUTCMinutes());
    const isFlush = Boolean(currentStatus.isEnergyFlushActive || (nowUtc.getUTCHours() === 23 && nowUtc.getUTCMinutes() >= 15));
    if (elFlushBadge) elFlushBadge.style.display = isFlush ? 'inline-block' : 'none';

    if (elUtcReset) {
        const resetH = Math.floor(minsToReset / 60);
        const resetM = minsToReset % 60;
        elUtcReset.textContent = `Reset: ${resetH}j ${resetM}m`;
        elUtcReset.title = `Reset harian server (00:00 UTC) dalam ${resetH} jam ${resetM} menit`;
    }

    // 3.5. Food Slots Tracker
    const maxFood = currentStatus.maxFoodDaily || currentConfig.maxFoodDaily || 10;
    const foodEaten = Math.max(0, Math.min(maxFood, currentStatus.foodEatenToday || 0));
    const foodLeft = Math.max(0, maxFood - foodEaten);
    if (elFoodVal) elFoodVal.textContent = `${foodEaten}/${maxFood}`;
    if (elFoodStatus) {
        if (foodLeft === 0) {
            elFoodStatus.textContent = 'Kuota habis';
            elFoodStatus.style.color = '#10b981';
            elFoodStatus.style.background = 'rgba(16, 185, 129, 0.15)';
            elFoodStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else if (minsToReset <= 240 && currentConfig.foodResetReminderEnabled !== false) {
            elFoodStatus.textContent = `Sisa ${foodLeft}!`;
            elFoodStatus.style.color = '#f59e0b';
            elFoodStatus.style.background = 'rgba(245, 158, 11, 0.15)';
            elFoodStatus.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        } else {
            elFoodStatus.textContent = `${foodLeft} sisa`;
            elFoodStatus.style.color = '#94a3b8';
            elFoodStatus.style.background = 'rgba(148, 163, 184, 0.12)';
            elFoodStatus.style.borderColor = 'rgba(148, 163, 184, 0.2)';
        }
    }

    // 4. Energy Card
    if (elEnergyVal) elEnergyVal.textContent = `${currentE}/${maxE}`;
    if (elEnergyPct) elEnergyPct.textContent = `(${pct}%)`;
    if (elBarFill) elBarFill.style.width = `${pct}%`;
    if (elFullEnergy) elFullEnergy.textContent = getTimeToFullEnergy(currentE, maxE, currentStatus.regenRate);

    // 5. Accurate Countdown Logic
    const rate = Math.max(0.5, currentStatus.regenRate || 1.0);
    const msToThreshold = Math.max(1, Math.round(((threshold - currentE) / rate) * 60000));
    let remaining = msToThreshold;
    if (currentStatus.serverCooldownUntil && currentStatus.serverCooldownUntil > now) {
        remaining = currentStatus.serverCooldownUntil - now;
    } else if (currentStatus.nextWorkTimestamp && currentStatus.nextWorkTimestamp > now) {
        const schedRemain = currentStatus.nextWorkTimestamp - now;
        if (schedRemain >= msToThreshold - 120000) {
            remaining = schedRemain;
        }
    }

    let countdownText = 'Menunggu...';
    let countdownColor = '#00d9ff';

    if (isExpired) {
        countdownText = 'Kadaluarsa';
        countdownColor = '#ff4444';
    } else if (!isRunning) {
        countdownText = 'Dijeda';
        countdownColor = '#ff6b6b';
    } else if (isSleeping) {
        countdownText = 'Istirahat';
        countdownColor = '#94a3b8';
    } else if (currentStatus.microBreakUntil && currentStatus.microBreakUntil > now) {
        const breakSec = Math.ceil((currentStatus.microBreakUntil - now) / 1000);
        countdownText = `Break ${Math.ceil(breakSec / 60)}m`;
        countdownColor = '#34d399';
    } else if (currentStatus.backoffUntil && currentStatus.backoffUntil > now) {
        const retrySec = Math.ceil((currentStatus.backoffUntil - now) / 1000);
        countdownText = `Retry ${retrySec}s`;
        countdownColor = '#fbbf24';
    } else if (isReadyToWork) {
        countdownText = isFlush ? 'Flush!' : 'Siap Kerja';
        countdownColor = '#00ff88';
    } else if (remaining > 0) {
        const sec = Math.ceil(remaining / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        countdownText = `${m}m ${String(s).padStart(2, '0')}s`;
        countdownColor = '#38bdf8';
    }

    if (elNextWork) {
        elNextWork.textContent = countdownText;
        elNextWork.style.color = countdownColor;
        if (currentStatus.nextWorkTimestamp && currentStatus.nextWorkTimestamp > now) {
            const d = new Date(currentStatus.nextWorkTimestamp);
            const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            elNextWork.title = `Estimasi kerja pukul ${timeStr} WIB`;
        } else {
            elNextWork.title = '';
        }
    }

    // 6. Focus Auto Work Status Card
    if (elEnergyTarget) elEnergyTarget.textContent = String(threshold);
    if (elShiftCountdown) {
        elShiftCountdown.textContent = countdownText;
        elShiftCountdown.style.color = countdownColor;
    }

    if (elModeBadge) {
        if (isExpired) {
            elModeBadge.textContent = 'Auto Kerja: EXPIRED';
            elModeBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            elModeBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            elModeBadge.style.color = '#f87171';
        } else if (!isRunning) {
            elModeBadge.textContent = 'Auto Kerja: DIJEDA';
            elModeBadge.style.background = 'rgba(244, 63, 94, 0.15)';
            elModeBadge.style.borderColor = 'rgba(244, 63, 94, 0.3)';
            elModeBadge.style.color = '#fda4af';
        } else if (isSleeping) {
            elModeBadge.textContent = 'Auto Kerja: ISTIRAHAT';
            elModeBadge.style.background = 'rgba(148, 163, 184, 0.15)';
            elModeBadge.style.borderColor = 'rgba(148, 163, 184, 0.3)';
            elModeBadge.style.color = '#94a3b8';
        } else {
            elModeBadge.textContent = 'Auto Kerja: AKTIF';
            elModeBadge.style.background = 'rgba(16, 185, 129, 0.15)';
            elModeBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            elModeBadge.style.color = '#34d399';
        }
    }

    if (elModeTitle && elModeIcon) {
        if (isExpired) {
            elModeTitle.textContent = 'Auto Kerja: EXPIRED';
            elModeTitle.style.color = '#ff4444';
            elModeIcon.innerHTML = SVGS.shield;
            elModeIcon.style.color = '#ff4444';
        } else if (!isRunning) {
            elModeTitle.textContent = 'Auto Kerja: DIJEDA';
            elModeTitle.style.color = '#ff4757';
            elModeIcon.innerHTML = SVGS.pause;
            elModeIcon.style.color = '#ff4757';
        } else if (isSleeping) {
            elModeTitle.textContent = 'Auto Kerja: ISTIRAHAT';
            elModeTitle.style.color = '#94a3b8';
            elModeIcon.innerHTML = SVGS.clock;
            elModeIcon.style.color = '#94a3b8';
        } else {
            elModeTitle.textContent = 'Auto Kerja: AKTIF';
            elModeTitle.style.color = '#00ff88';
            elModeIcon.innerHTML = SVGS.zap;
            elModeIcon.style.color = '#00ff88';
        }
    }

    // 7. Auth Session Row
    if (elTokenStatus) {
        if (isExpired) {
            elTokenStatus.textContent = 'EXPIRED';
            elTokenStatus.style.color = '#ff4444';
        } else if (currentStatus.hasToken) {
            elTokenStatus.textContent = 'VALID';
            elTokenStatus.style.color = '#00ff88';
        } else {
            elTokenStatus.textContent = 'NOT FOUND';
            elTokenStatus.style.color = '#ffaa00';
        }
    }
    if (elTokenExpiry) {
        elTokenExpiry.textContent = getTimeUntilExpiry(currentStatus.tokenExpiry);
    }

    // 7.5. Auto Training Status Card
    const stats = currentStatus.trainingStats || { strength: 0, education: 0, economy: 0 };
    if (elTrainStr) elTrainStr.textContent = String(stats.strength || '--');
    if (elTrainEdu) elTrainEdu.textContent = String(stats.education || '--');
    if (elTrainEko) elTrainEko.textContent = String(stats.economy || '--');

    const autoTrainEnabled = Boolean(currentConfig.autoTrainEnabled);
    const activeStatCount = (currentConfig.trainStrengthEnabled !== false ? 1 : 0) +
                           (currentConfig.trainEducationEnabled !== false ? 1 : 0) +
                           (currentConfig.trainEconomyEnabled !== false ? 1 : 0);

    if (elTrainCount) {
        if (!autoTrainEnabled) {
            elTrainCount.textContent = 'Nonaktif';
            elTrainCount.style.background = 'rgba(255, 255, 255, 0.05)';
            elTrainCount.style.color = '#94a3b8';
            elTrainCount.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        } else if (activeStatCount === 0) {
            elTrainCount.textContent = '0/3 Aktif';
            elTrainCount.style.background = 'rgba(244, 63, 94, 0.15)';
            elTrainCount.style.color = '#fda4af';
            elTrainCount.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        } else {
            elTrainCount.textContent = `${activeStatCount}/3 Aktif`;
            elTrainCount.style.background = 'rgba(244, 63, 94, 0.15)';
            elTrainCount.style.color = '#fda4af';
            elTrainCount.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        }
    }

    if (elTrainBody) {
        elTrainBody.className = autoTrainEnabled ? 'expanded' : 'collapsed';
    }

    if (pillStr) {
        pillStr.classList.toggle('dimmed', currentConfig.trainStrengthEnabled === false);
        pillStr.title = currentConfig.trainStrengthEnabled === false
            ? 'Kekuatan (STR) dilewati. Klik untuk mengaktifkan.'
            : 'Kekuatan (STR) aktif. Klik untuk melewati.';
    }
    if (pillEdu) {
        pillEdu.classList.toggle('dimmed', currentConfig.trainEducationEnabled === false);
        pillEdu.title = currentConfig.trainEducationEnabled === false
            ? 'Pendidikan (EDU) dilewati. Klik untuk mengaktifkan.'
            : 'Pendidikan (EDU) aktif. Klik untuk melewati.';
    }
    if (pillEko) {
        pillEko.classList.toggle('dimmed', currentConfig.trainEconomyEnabled === false);
        pillEko.title = currentConfig.trainEconomyEnabled === false
            ? 'Ekonomi (EKO) dilewati. Klik untuk mengaktifkan.'
            : 'Ekonomi (EKO) aktif. Klik untuk melewati.';
    }

    if (elTrainDot) {
        elTrainDot.style.background = autoTrainEnabled ? '#10b981' : '#64748b';
        elTrainDot.style.boxShadow = autoTrainEnabled ? '0 0 6px #10b981' : 'none';
    }
    if (elTrainText) {
        elTrainText.textContent = autoTrainEnabled ? 'AKTIF' : '• OFF';
    }
    if (elTrainBadge) {
        if (autoTrainEnabled) {
            elTrainBadge.className = 'btn-cyber px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[12px] font-bold tracking-wide flex items-center gap-1 shadow-sm';
            elTrainBadge.style.background = 'rgba(16, 185, 129, 0.2)';
            elTrainBadge.style.color = '#34d399';
            elTrainBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        } else {
            elTrainBadge.className = 'btn-cyber px-3 py-1 rounded-full badge-train-off text-[12px] font-bold tracking-wide flex items-center gap-1 shadow-sm';
            elTrainBadge.style.background = 'rgba(255, 255, 255, 0.03)';
            elTrainBadge.style.color = '#94a3b8';
            elTrainBadge.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        }
    }

    if (currentStatus.activeTraining && currentStatus.activeTraining.endsAt) {
        const endsMs = new Date(currentStatus.activeTraining.endsAt).getTime();
        const diffMs = endsMs - now;
        const statMap = { strength: 'Kekuatan', education: 'Pendidikan', economy: 'Ekonomi' };
        const statColorMap = { strength: '#fda4af', education: '#7dd3fc', economy: '#86efac' };
        const statName = statMap[currentStatus.activeTraining.stat] || currentStatus.activeTraining.stat;
        const targetLv = currentStatus.activeTraining.targetLevel ? ` Lv ${currentStatus.activeTraining.targetLevel}` : '';

        const textEl = document.getElementById('popup-train-focus-text') || elTrainFocusLabel;
        const iconEl = document.getElementById('popup-train-target-icon');
        let iconColor = '#fda4af';

        if (diffMs > 0) {
            if (textEl) {
                textEl.textContent = `Fokus: ${statName}${targetLv}`;
                iconColor = statColorMap[currentStatus.activeTraining.stat] || '#fda4af';
                if (elTrainFocusLabel) elTrainFocusLabel.style.color = iconColor;
            }
            if (iconEl) iconEl.style.color = iconColor;
            if (elTrainStatus) {
                elTrainStatus.textContent = `Latih ${statName}${targetLv}`;
                elTrainStatus.style.color = '#fbbf24';
            }
            if (elTrainTimer) {
                const totalSec = Math.floor(diffMs / 1000);
                const h = Math.floor(totalSec / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                const s = totalSec % 60;
                elTrainTimer.textContent = h > 0 ? `${h}j ${m}m` : `${m}m ${s}s`;
                elTrainTimer.style.color = '#00ff88';
            }
            if (elTrainProgress) {
                const pct = getTrainingProgressPercentage(currentStatus.activeTraining, currentStatus.trainingStats);
                elTrainProgress.style.width = `${pct}%`;
            }
        } else {
            if (textEl) {
                textEl.textContent = `Selesai: ${statName}${targetLv}`;
                iconColor = '#34d399';
                if (elTrainFocusLabel) elTrainFocusLabel.style.color = iconColor;
            }
            if (iconEl) iconEl.style.color = iconColor;
            if (elTrainStatus) {
                elTrainStatus.textContent = autoTrainEnabled ? 'Selesai, antre siklus berikutnya' : 'Latihan selesai';
                elTrainStatus.style.color = '#cbd5e1';
            }
            if (elTrainTimer) {
                elTrainTimer.textContent = '0s';
                elTrainTimer.style.color = '#38bdf8';
            }
            if (elTrainProgress) elTrainProgress.style.width = '100%';
        }
    } else {
        const textEl = document.getElementById('popup-train-focus-text') || elTrainFocusLabel;
        const iconEl = document.getElementById('popup-train-target-icon');
        let iconColor = '#64748b';
        if (textEl) {
            if (!autoTrainEnabled) {
                textEl.textContent = 'Auto Latihan Nonaktif';
                if (elTrainFocusLabel) elTrainFocusLabel.style.color = '#64748b';
                iconColor = '#64748b';
            } else if (activeStatCount === 0) {
                textEl.textContent = 'Semua stat nonaktif';
                if (elTrainFocusLabel) elTrainFocusLabel.style.color = '#f59e0b';
                iconColor = '#f59e0b';
            } else if (activeStatCount === 1) {
                let singleName = 'Kekuatan';
                let singleColor = '#fda4af';
                let curTarget = currentConfig.targetStrength || 100;
                iconColor = '#f43f5e';
                if (currentConfig.trainEducationEnabled !== false && currentConfig.trainStrengthEnabled === false) {
                    singleName = 'Pendidikan'; singleColor = '#7dd3fc'; iconColor = '#38bdf8';
                    curTarget = currentConfig.targetEducation || 100;
                } else if (currentConfig.trainEconomyEnabled !== false && currentConfig.trainStrengthEnabled === false && currentConfig.trainEducationEnabled === false) {
                    singleName = 'Ekonomi'; singleColor = '#86efac'; iconColor = '#10b981';
                    curTarget = currentConfig.targetEconomy || 100;
                }
                textEl.textContent = `Fokus: ${singleName} Lv ${curTarget}`;
                if (elTrainFocusLabel) elTrainFocusLabel.style.color = singleColor;
            } else {
                textEl.textContent = `Rotasi Multi-Stat (${activeStatCount} Stat Aktif)`;
                if (elTrainFocusLabel) elTrainFocusLabel.style.color = '#cbd5e1';
                iconColor = '#38bdf8';
            }
        }
        if (iconEl) iconEl.style.color = iconColor;
        if (elTrainStatus) {
            if (!autoTrainEnabled) {
                elTrainStatus.textContent = 'Auto Latihan Nonaktif';
                elTrainStatus.style.color = '#64748b';
            } else if (activeStatCount === 0) {
                elTrainStatus.textContent = 'Semua stat nonaktif';
                elTrainStatus.style.color = '#f59e0b';
            } else {
                elTrainStatus.textContent = 'Auto Latihan Siap';
                elTrainStatus.style.color = '#cbd5e1';
            }
        }
        if (elTrainTimer) {
            elTrainTimer.textContent = autoTrainEnabled ? 'Ready' : 'OFF';
            elTrainTimer.style.color = autoTrainEnabled ? '#38bdf8' : '#64748b';
        }
        if (elTrainProgress) elTrainProgress.style.width = '0%';
    }

    // 8. Open link text (Gambar 5)
    if (btnOpen) {
        const btnOpenText = document.getElementById('btn-open-text');
        if (btnOpenText) {
            btnOpenText.textContent = isExpired ? 'Buka & Login Game' : 'Buka Tab Dashboard Game';
        }
    }
}

// ── Tab Check ───────────────────────────────────────────────────────────────
function checkGameTab() {
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        if (tabs && tabs.length > 0) {
            if (elTabDot) elTabDot.className = 'footer-dot online';
            if (elTabText) elTabText.textContent = `Tab game aktif (${tabs.length} tab)`;
        } else {
            if (elTabDot) elTabDot.className = 'footer-dot';
            if (elTabText) elTabText.textContent = 'Background worker aktif';
        }
    });
}

function getBestGameTab(tabs) {
    if (!tabs || tabs.length === 0) return null;
    const isDashUrl = url => {
        if (!url) return false;
        try {
            const u = new URL(url);
            const p = u.pathname.toLowerCase().replace(/\/+$/, '');
            return p === '/dashboard' || p === '';
        } catch { return false; }
    };

    // Priority 1: Active tab on /dashboard
    const activeDash = tabs.find(t => t.active && isDashUrl(t.url));
    if (activeDash) return activeDash;

    // Priority 2: Any open tab on /dashboard
    const anyDash = tabs.find(t => isDashUrl(t.url));
    if (anyDash) return anyDash;

    // Priority 3: Active tab (even if not dashboard)
    const activeOther = tabs.find(t => t.active);
    if (activeOther) return activeOther;

    // Priority 4: Fallback to first tab
    return tabs[0];
}

// ── Load Initial State ──────────────────────────────────────────────────────
function loadData() {
    chrome.storage.local.get(['aw_live_status', 'aw_config', 'aw_state', 'aw_recent_logs', 'aw_worker_running'], res => {
        if (res.aw_live_status) {
            Object.assign(currentStatus, res.aw_live_status);
        }
        if (res.aw_worker_running !== undefined) {
            currentStatus.running = res.aw_worker_running !== 'false';
        }
        if (res.aw_config) {
            Object.assign(currentConfig, parseConfig(res.aw_config));
        }
        if (Array.isArray(res.aw_recent_logs)) {
            // Clean out old repetitive spam and lifecycle messages if present
            currentLogs = res.aw_recent_logs.filter(e =>
                e && typeof e.message === 'string' &&
                !/^Energi belum cukup \(\d+\/\d+\)/i.test(e.message) &&
                !/^Panel v[\d.]+\s+siap!/i.test(e.message) &&
                !/^Auto Worker v[\d.]+/i.test(e.message)
            );
            if (currentLogs.length !== res.aw_recent_logs.length) {
                chrome.storage.local.set({ aw_recent_logs: currentLogs });
            }
        }
        renderUI();
        renderLogList();
    });

    // Query active game tab directly for live, zero-lag status and activity logs
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        const targetTab = getBestGameTab(tabs);
        if (targetTab?.id) {
            chrome.tabs.sendMessage(targetTab.id, { type: 'POPUP_COMMAND', action: 'getStatus' }, response => {
                if (!chrome.runtime.lastError && response?.ok && response?.status) {
                    Object.assign(currentStatus, response.status);
                    renderUI();
                }
            });
            chrome.tabs.sendMessage(targetTab.id, { type: 'POPUP_COMMAND', action: 'getLogs' }, response => {
                if (!chrome.runtime.lastError && response?.ok && Array.isArray(response?.logs)) {
                    currentLogs = response.logs;
                    renderLogList();
                }
            });
        }
    });

    checkGameTab();
}

// ── Periodic Sync with Open Tab (Every 2s) ──────────────────────────────────
setInterval(() => {
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        const targetTab = getBestGameTab(tabs);
        if (targetTab?.id) {
            chrome.tabs.sendMessage(targetTab.id, { type: 'POPUP_COMMAND', action: 'getStatus' }, response => {
                if (!chrome.runtime.lastError && response?.ok && response?.status) {
                    Object.assign(currentStatus, response.status);
                    renderUI();
                }
            });
        }
    });
}, 4000);

// ── Unified Storage Changed Listener ─────────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let needsRender = false;

    if (changes.aw_worker_running) {
        currentStatus.running = changes.aw_worker_running.newValue !== 'false';
        needsRender = true;
    }
    if (changes.aw_live_status?.newValue) {
        Object.assign(currentStatus, changes.aw_live_status.newValue);
        if (changes.aw_worker_running) {
            currentStatus.running = changes.aw_worker_running.newValue !== 'false';
        }
        needsRender = true;
    }
    if (changes.aw_config?.newValue) {
        Object.assign(currentConfig, parseConfig(changes.aw_config.newValue));
        needsRender = true;
    }
    if (needsRender) {
        renderUI();
    }
    if (changes.aw_recent_logs?.newValue) {
        currentLogs = Array.isArray(changes.aw_recent_logs.newValue) ? changes.aw_recent_logs.newValue : [];
        renderLogList();
    }
});

// ── Interval for Smooth Countdown & Live Energy ─────────────────────────────
setInterval(() => {
    renderUI();
}, 1000);

// ── Event Handlers ──────────────────────────────────────────────────────────

// 1. Toggle Run / Pause
btnToggle?.addEventListener('click', () => {
    const newRunning = !currentStatus.running;
    currentStatus.running = newRunning;
    renderUI();

    chrome.runtime.sendMessage({
        type: 'POPUP_TO_TAB',
        action: 'toggleRunning',
        value: newRunning
    }, res => {
        if (res && res.running !== undefined) {
            currentStatus.running = res.running;
            renderUI();
        }
    });

    chrome.storage.local.set({
        aw_worker_running: String(newRunning),
        aw_live_status: { ...currentStatus, running: newRunning }
    });
});

// Settings button click: Open in game tab
btnSettings?.addEventListener('click', () => {
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        const targetTab = getBestGameTab(tabs);
        if (targetTab?.id) {
            chrome.tabs.update(targetTab.id, { active: true });
            if (targetTab.windowId) {
                chrome.windows.update(targetTab.windowId, { focused: true });
            }
            chrome.tabs.sendMessage(targetTab.id, { type: 'POPUP_COMMAND', action: 'openSettings' });
            window.close();
        } else {
            chrome.tabs.create({ url: 'https://parlamentum.org/dashboard' });
            window.close();
        }
    });
});

// Helper to save and sync config changes from popup
function updatePopupConfig(changes) {
    Object.assign(currentConfig, changes);
    renderUI();
    chrome.storage.local.get(['aw_config'], res => {
        const cfg = res.aw_config ? (typeof res.aw_config === 'string' ? JSON.parse(res.aw_config) : res.aw_config) : {};
        Object.assign(cfg, changes);
        chrome.storage.local.set({ aw_config: cfg });
    });
    // Notify active tab to reload config
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        const targetTab = getBestGameTab(tabs);
        if (targetTab?.id) {
            chrome.tabs.sendMessage(targetTab.id, { type: 'CONFIG_UPDATED', config: currentConfig });
        }
    });
}

// 1.5. Toggle Auto Training
elTrainBadge?.addEventListener('click', () => {
    updatePopupConfig({ autoTrainEnabled: !currentConfig.autoTrainEnabled });
});

// Mini Stat Pills Toggles
pillStr?.addEventListener('click', () => {
    updatePopupConfig({ trainStrengthEnabled: currentConfig.trainStrengthEnabled === false });
});
pillEdu?.addEventListener('click', () => {
    updatePopupConfig({ trainEducationEnabled: currentConfig.trainEducationEnabled === false });
});
pillEko?.addEventListener('click', () => {
    updatePopupConfig({ trainEconomyEnabled: currentConfig.trainEconomyEnabled === false });
});

// 2. Manual Work Now
btnWork?.addEventListener('click', () => {
    const isExpired = Boolean(
        currentStatus.tokenExpired ||
        currentStatus.pausedForToken ||
        !currentStatus.hasToken ||
        (currentStatus.tokenExpiry && Number(currentStatus.tokenExpiry) <= Date.now())
    );

    if (isExpired) {
        if (btnWorkText) btnWorkText.textContent = 'Token Expired!';
        btnWork.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
        setTimeout(() => {
            if (btnWorkText) btnWorkText.textContent = 'Kerja';
            btnWork.style.background = '';
        }, 2500);
        return;
    }

    btnWork.disabled = true;
    if (btnWorkText) btnWorkText.textContent = 'Kirim...';

    chrome.runtime.sendMessage({
        type: 'POPUP_TO_TAB',
        action: 'workNow'
    }, res => {
        if (res && res.ok) {
            if (btnWorkText) btnWorkText.textContent = 'Sukses!';
            btnWork.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            setTimeout(() => loadData(), 500);
        } else {
            let err = 'Gagal';
            if (res?.error === 'token_expired' || res?.error === 'no_token') {
                err = 'Token Expired';
            } else if (res?.error === 'insufficient_energy') {
                err = 'Energi Kurang';
            } else if (res?.error === 'busy') {
                err = 'Sedang Kerja';
            } else if (res?.error === 'waiting') {
                err = 'Menunggu...';
            } else if (res?.error === 'region_mismatch') {
                err = 'Lokasi Beda';
            } else if (res?.message) {
                err = res.message.slice(0, 16);
            }
            if (btnWorkText) btnWorkText.textContent = err;
            btnWork.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
            setTimeout(() => loadData(), 400);
        }
        setTimeout(() => {
            btnWork.disabled = false;
            if (btnWorkText) btnWorkText.textContent = 'Kerja';
            btnWork.style.background = '';
            loadData();
        }, 2200);
    });
});

// 3. Open or focus Parlamentum tab
btnOpen?.addEventListener('click', () => {
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        if (tabs && tabs.length > 0) {
            const target = tabs.find(t => t.active) || tabs[0];
            chrome.tabs.update(target.id, { active: true });
            if (target.windowId) {
                chrome.windows.update(target.windowId, { focused: true });
            }
            window.close();
        } else {
            chrome.tabs.create({ url: 'https://parlamentum.org/dashboard' });
            window.close();
        }
    });
});

// ── Activity Log Viewer Handlers ────────────────────────────────────────────

function getLogContext(entry) {
    const type = (entry?.type || 'info').toLowerCase();
    const msg = (entry?.message || '').toLowerCase();

    // 1. Error / Failure
    if (type === 'error' || /\b(error|gagal|timeout|menolak|kedaluwarsa|expired|rusak|kehabisan saldo)\b/i.test(msg)) {
        return {
            category: 'error',
            borderLeftColor: '#f43f5e',
            bg: 'rgba(244, 63, 94, 0.08)',
            tagText: 'ERROR',
            tagColor: '#fda4af',
            tagBg: 'rgba(244, 63, 94, 0.15)',
            tagBorder: 'rgba(244, 63, 94, 0.3)'
        };
    }

    // 2. Warning / Caution
    if (type === 'warn' || /\b(peringatan|darurat|dijeda|ditunda|belum cukup|tidak cukup|bukan json|menunggu)\b/i.test(msg)) {
        return {
            category: 'warn',
            borderLeftColor: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.08)',
            tagText: 'WARN',
            tagColor: '#fbbf24',
            tagBg: 'rgba(245, 158, 11, 0.15)',
            tagBorder: 'rgba(245, 158, 11, 0.3)'
        };
    }

    // 3. Success (Work / Training / Action Completed)
    if (type === 'success' || /\b(sukses|berhasil|\+xp|selesai\b)/i.test(msg)) {
        return {
            category: 'success',
            borderLeftColor: '#10b981',
            bg: 'rgba(16, 185, 129, 0.08)',
            tagText: 'SUKSES',
            tagColor: '#34d399',
            tagBg: 'rgba(16, 185, 129, 0.15)',
            tagBorder: 'rgba(16, 185, 129, 0.3)'
        };
    }

    // 4. Auto Training / Stat Target Context
    if (/\[auto latihan\]|latihan|target str|target edu|target eko|kekuatan|pendidikan|ekonomi/i.test(msg)) {
        return {
            category: 'training',
            borderLeftColor: '#818cf8',
            bg: 'rgba(129, 140, 248, 0.07)',
            tagText: 'LATIHAN',
            tagColor: '#a5b4fc',
            tagBg: 'rgba(129, 140, 248, 0.15)',
            tagBorder: 'rgba(129, 140, 248, 0.3)'
        };
    }

    // 5. Food / Roti Context
    if (/roti|makanan|kuota roti|slot makanan|makan/i.test(msg)) {
        return {
            category: 'food',
            borderLeftColor: '#f97316',
            bg: 'rgba(249, 115, 22, 0.07)',
            tagText: 'ROTI',
            tagColor: '#fdba74',
            tagBg: 'rgba(249, 115, 22, 0.15)',
            tagBorder: 'rgba(249, 115, 22, 0.3)'
        };
    }

    // 6. Work / Shift Context
    if (/shift|kerja|worker|ambang/i.test(msg)) {
        return {
            category: 'work',
            borderLeftColor: '#06b6d4',
            bg: 'rgba(6, 182, 212, 0.07)',
            tagText: 'KERJA',
            tagColor: '#67e8f9',
            tagBg: 'rgba(6, 182, 212, 0.15)',
            tagBorder: 'rgba(6, 182, 212, 0.3)'
        };
    }

    // 7. System / Server Reset Context
    if (/reset server|utc|hari berganti|token|auth|sesi|panel/i.test(msg)) {
        return {
            category: 'system',
            borderLeftColor: '#38bdf8',
            bg: 'rgba(56, 189, 248, 0.06)',
            tagText: 'SISTEM',
            tagColor: '#7dd3fc',
            tagBg: 'rgba(56, 189, 248, 0.15)',
            tagBorder: 'rgba(56, 189, 248, 0.3)'
        };
    }

    // 8. General Info Default
    return {
        category: 'info',
        borderLeftColor: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.06)',
        tagText: 'INFO',
        tagColor: '#7dd3fc',
        tagBg: 'rgba(56, 189, 248, 0.15)',
        tagBorder: 'rgba(56, 189, 248, 0.3)'
    };
}

function renderLogList() {
    if (!logEntries) return;

    // 1. Update filter pill counts (matching Image 2)
    const countAll = currentLogs.length;
    let countSuccess = 0, countWarn = 0, countError = 0, countInfo = 0;
    currentLogs.forEach(e => {
        const ctx = getLogContext(e);
        if (e.type === 'success' || ctx.category === 'success') countSuccess++;
        else if (e.type === 'warn' || ctx.category === 'warn') countWarn++;
        else if (e.type === 'error' || ctx.category === 'error') countError++;
        else countInfo++;
    });

    const elCountAll = document.getElementById('popup-count-all');
    const elCountSuccess = document.getElementById('popup-count-success');
    const elCountWarn = document.getElementById('popup-count-warn');
    const elCountError = document.getElementById('popup-count-error');
    const elCountInfo = document.getElementById('popup-count-info');

    if (elCountAll) elCountAll.textContent = String(countAll);
    if (elCountSuccess) elCountSuccess.textContent = String(countSuccess);
    if (elCountWarn) elCountWarn.textContent = String(countWarn);
    if (elCountError) elCountError.textContent = String(countError);
    if (elCountInfo) elCountInfo.textContent = String(countInfo);

    // 2. Filter logs
    const filtered = currentLogs.filter(e => {
        const ctx = getLogContext(e);
        let matchType = false;
        if (logFilter === 'all') {
            matchType = true;
        } else if (logFilter === 'success') {
            matchType = e.type === 'success' || ctx.category === 'success';
        } else if (logFilter === 'warn') {
            matchType = e.type === 'warn' || ctx.category === 'warn';
        } else if (logFilter === 'error') {
            matchType = e.type === 'error' || ctx.category === 'error';
        } else if (logFilter === 'info') {
            matchType = e.type === 'info' || ['info', 'training', 'food', 'work', 'system'].includes(ctx.category);
        }
        const matchSearch = !logSearch || (e.message && e.message.toLowerCase().includes(logSearch));
        return matchType && matchSearch;
    });

    if (logCount) logCount.textContent = String(filtered.length);

    if (filtered.length === 0) {
        logEntries.innerHTML = `<div class="log-empty">${currentLogs.length === 0 ? 'Belum ada riwayat aktivitas.' : 'Tidak ada log yang cocok.'}</div>`;
        return;
    }

    logEntries.replaceChildren(...filtered.map(entry => {
        const ctx = getLogContext(entry);
        const row = document.createElement('div');
        row.className = `log-row log-cat-${ctx.category}`;
        row.style.borderLeft = `3px solid ${ctx.borderLeftColor}`;
        row.style.background = ctx.bg;

        // Clean timestamp formatting
        const timeVal = entry.time || '--:--';
        const formattedTime = timeVal.startsWith('[') ? timeVal : `[${timeVal}]`;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = formattedTime;

        // Context Badge Tag
        const tag = document.createElement('span');
        tag.className = 'log-tag';
        tag.textContent = ctx.tagText;
        tag.style.background = ctx.tagBg;
        tag.style.color = ctx.tagColor;
        tag.style.border = `1px solid ${ctx.tagBorder}`;

        // Message text formatting: Clean duplicate timestamp prefix if message starts with [HH.MM.SS]
        let msgText = entry.message || '';
        msgText = msgText.replace(/^\[\d{2}[.:]\d{2}[.:]\d{2}\]\s*/, '');

        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-msg';
        msgSpan.textContent = msgText;

        row.append(timeSpan, tag, msgSpan);
        return row;
    }));
}

function openLogModal() {
    if (logModal) {
        logModal.style.display = 'flex';
        renderLogList();
        chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
            const targetTab = getBestGameTab(tabs);
            if (targetTab?.id) {
                chrome.tabs.sendMessage(targetTab.id, { type: 'POPUP_COMMAND', action: 'getLogs' }, response => {
                    if (!chrome.runtime.lastError && response?.ok && Array.isArray(response?.logs)) {
                        currentLogs = response.logs.filter(e => !/^Energi belum cukup \(\d+\/\d+\)/i.test(e.message || ''));
                        renderLogList();
                    }
                });
            }
        });
    }
}

function closeLogModal() {
    if (logModal) {
        logModal.style.display = 'none';
    }
}

btnOpenLog?.addEventListener('click', e => {
    e.stopPropagation();
    openLogModal();
});

btnCloseLog?.addEventListener('click', closeLogModal);

// Filter Pills setup
document.querySelectorAll('.log-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('.log-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        logFilter = pill.getAttribute('data-type') || 'all';
        renderLogList();
    });
});

logFilterText?.addEventListener('input', e => {
    logSearch = e.target.value.toLowerCase();
    renderLogList();
});

btnClearLogs?.addEventListener('click', () => {
    currentLogs = [];
    chrome.storage.local.set({ aw_recent_logs: [] });
    renderLogList();
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        tabs?.forEach(t => {
            chrome.tabs.sendMessage(t.id, { type: 'POPUP_COMMAND', action: 'clearLogs' }).catch(() => {});
        });
    });
});



// Initial load
loadData();

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        document.body.classList.add('aw-tab-hidden');
    } else {
        document.body.classList.remove('aw-tab-hidden');
        renderUI();
    }
});
