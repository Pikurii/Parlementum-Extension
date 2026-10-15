/**
 * popup.js — Interactive Extension Toolbar Controller
 * Synchronized with the modernized dark-glassmorphic in-game floating panel.
 */

const SVGS = {
    zap: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    pause: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    play: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
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
const elBarFill       = document.getElementById('popup-bar-fill');
const elNextWork      = document.getElementById('popup-next-work');
const elFullEnergy    = document.getElementById('popup-full-energy');

const elModeIcon      = document.getElementById('popup-mode-icon');
const elModeTitle     = document.getElementById('popup-mode-title');
const elEnergyTarget  = document.getElementById('popup-energy-target');
const elShiftCountdown = document.getElementById('popup-shift-countdown');

const elTokenStatus   = document.getElementById('popup-token-status');
const elTokenExpiry   = document.getElementById('popup-token-expiry');

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

// ── Render UI from state ────────────────────────────────────────────────────
function renderUI() {
    const isRunning = Boolean(currentStatus.running);
    const threshold = currentConfig.energyThreshold || currentStatus.energyThreshold || 10;
    let currentE    = currentStatus.currentEnergy ?? 0;
    const maxE      = currentStatus.maxEnergy || 100;

    // Client-side smooth regen interpolation between storage syncs
    if (currentStatus.updatedAt && currentE < maxE) {
        const elapsedMins = (Date.now() - currentStatus.updatedAt) / 60000;
        const rate = currentStatus.regenRate || 1.0;
        const gained = Math.floor(elapsedMins * rate);
        if (gained > 0) {
            currentE = Math.min(maxE, currentE + gained);
        }
    }
    const pct = Math.max(0, Math.min(100, Math.round((currentE / maxE) * 100)));

    const isExpired = Boolean(
        currentStatus.tokenExpired ||
        currentStatus.pausedForToken ||
        !currentStatus.hasToken ||
        (currentStatus.tokenExpiry && Number(currentStatus.tokenExpiry) <= Date.now())
    );

    const isSleeping = _isSleepTime(currentConfig);
    const isReadyToWork = currentE >= threshold;

    // 1. Status badge & Header Dot
    if (isExpired) {
        if (elStatusBadge) elStatusBadge.className = 'status-badge paused';
        if (elStatusText) elStatusText.textContent = 'EXPIRED';
        if (elStatusDot) {
            elStatusDot.style.background = '#ff4444';
            elStatusDot.style.boxShadow = '0 0 8px #ff4444';
        }
        if (btnToggle) {
            btnToggle.className = 'action-btn btn-resume';
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
            btnToggle.className = 'action-btn btn-pause';
            if (btnToggleIcon) btnToggleIcon.innerHTML = SVGS.pause;
            if (btnToggleText) btnToggleText.textContent = 'Jeda';
        }
    } else {
        if (elStatusBadge) elStatusBadge.className = 'status-badge paused';
        if (elStatusText) elStatusText.textContent = 'PAUSED';
        if (elStatusDot) {
            elStatusDot.style.background = '#ff4757';
            elStatusDot.style.boxShadow = '0 0 8px #ff4757';
        }
        if (btnToggle) {
            btnToggle.className = 'action-btn btn-resume';
            if (btnToggleIcon) btnToggleIcon.innerHTML = SVGS.play;
            if (btnToggleText) btnToggleText.textContent = 'Lanjut';
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
        } else if (minsToReset <= 240 && currentConfig.foodResetReminderEnabled !== false) {
            elFoodStatus.textContent = `Sisa ${foodLeft} slot!`;
            elFoodStatus.style.color = '#f59e0b';
        } else {
            elFoodStatus.textContent = `${foodLeft} slot tersisa`;
            elFoodStatus.style.color = '#94a3b8';
        }
    }

    // 4. Energy Card
    if (elEnergyVal) elEnergyVal.textContent = `${currentE}/${maxE}`;
    if (elBarFill) elBarFill.style.width = `${pct}%`;
    if (elFullEnergy) elFullEnergy.textContent = getTimeToFullEnergy(currentE, maxE, currentStatus.regenRate);

    // 5. Accurate Countdown Logic
    const now = Date.now();
    let remaining = (currentStatus.nextWorkTimestamp || 0) - now;
    if (!currentStatus.nextWorkTimestamp && currentE < threshold) {
        const rate = currentStatus.regenRate || 1.0;
        remaining = Math.max(1, (threshold - currentE) / rate) * 60000;
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

    // 8. Open link text
    if (btnOpen) {
        const btnOpenText = document.getElementById('btn-open-text');
        if (btnOpenText) {
            btnOpenText.textContent = isExpired ? 'Buka & Login Game' : 'Buka Tab Parlamentum';
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

// ── Load Initial State ──────────────────────────────────────────────────────
function loadData() {
    chrome.storage.local.get(['aw_live_status', 'aw_config', 'aw_state', 'aw_recent_logs'], res => {
        if (res.aw_live_status) {
            Object.assign(currentStatus, res.aw_live_status);
        }
        if (res.aw_config) {
            Object.assign(currentConfig, parseConfig(res.aw_config));
        }
        if (Array.isArray(res.aw_recent_logs)) {
            // Clean out old repetitive spam logs if present
            currentLogs = res.aw_recent_logs.filter(e => !/^Energi belum cukup \(\d+\/\d+\)/i.test(e.message || ''));
            if (currentLogs.length !== res.aw_recent_logs.length) {
                chrome.storage.local.set({ aw_recent_logs: currentLogs });
            }
        }
        renderUI();
        renderLogList();
    });

    // Query active game tab directly for live, zero-lag status and activity logs
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        const activeTab = tabs?.find(t => t.active) || tabs?.[0];
        if (activeTab?.id) {
            chrome.tabs.sendMessage(activeTab.id, { type: 'POPUP_COMMAND', action: 'getStatus' }, response => {
                if (!chrome.runtime.lastError && response?.ok && response?.status) {
                    Object.assign(currentStatus, response.status);
                    renderUI();
                }
            });
            chrome.tabs.sendMessage(activeTab.id, { type: 'POPUP_COMMAND', action: 'getLogs' }, response => {
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
        const activeTab = tabs?.find(t => t.active) || tabs?.[0];
        if (activeTab?.id) {
            chrome.tabs.sendMessage(activeTab.id, { type: 'POPUP_COMMAND', action: 'getStatus' }, response => {
                if (!chrome.runtime.lastError && response?.ok && response?.status) {
                    Object.assign(currentStatus, response.status);
                    renderUI();
                }
            });
        }
    });
}, 2000);

// ── Storage Changed Listener ────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.aw_live_status?.newValue) {
        Object.assign(currentStatus, changes.aw_live_status.newValue);
        renderUI();
    }
    if (changes.aw_config?.newValue) {
        Object.assign(currentConfig, parseConfig(changes.aw_config.newValue));
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
        aw_live_status: { ...currentStatus, running: newRunning }
    });
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

function renderLogList() {
    if (!logEntries) return;
    const filtered = currentLogs.filter(e => {
        const matchType = logFilter === 'all' || e.type === logFilter;
        const matchSearch = !logSearch || (e.message && e.message.toLowerCase().includes(logSearch));
        return matchType && matchSearch;
    });

    if (logCount) logCount.textContent = String(filtered.length);

    if (filtered.length === 0) {
        logEntries.innerHTML = `<div class="log-empty">${currentLogs.length === 0 ? 'Belum ada riwayat aktivitas.' : 'Tidak ada log yang cocok.'}</div>`;
        return;
    }

    logEntries.replaceChildren(...filtered.map(entry => {
        const row = document.createElement('div');
        const typeClass = entry.type || 'info';
        row.className = `log-row ${typeClass}`;

        const dot = document.createElement('span');
        dot.className = 'log-dot';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = `[${entry.time || '--:--'}]`;

        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-msg';
        msgSpan.textContent = entry.message || '';

        row.append(dot, timeSpan, msgSpan);
        return row;
    }));
}

function openLogModal() {
    if (logModal) {
        logModal.style.display = 'flex';
        renderLogList();
        chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
            const activeTab = tabs?.find(t => t.active) || tabs?.[0];
            if (activeTab?.id) {
                chrome.tabs.sendMessage(activeTab.id, { type: 'POPUP_COMMAND', action: 'getLogs' }, response => {
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

// Food Quick Adjustment Controls
const btnFoodDec = document.getElementById('popup-food-dec');
const btnFoodInc = document.getElementById('popup-food-inc');
const btnFoodMax = document.getElementById('popup-food-max');

function setPopupFood(val) {
    const maxFood = currentStatus.maxFoodDaily || currentConfig.maxFoodDaily || 10;
    const food = Math.max(0, Math.min(maxFood, val));
    currentStatus.foodEatenToday = food;
    renderUI();
    chrome.storage.local.set({ aw_foodEatenToday: food.toString() });
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        tabs?.forEach(t => {
            chrome.tabs.sendMessage(t.id, { type: 'POPUP_COMMAND', action: 'setFoodCount', value: food }).catch(() => {});
        });
    });
}

btnFoodDec?.addEventListener('click', e => {
    e.stopPropagation();
    setPopupFood((currentStatus.foodEatenToday || 0) - 1);
});

btnFoodInc?.addEventListener('click', e => {
    e.stopPropagation();
    setPopupFood((currentStatus.foodEatenToday || 0) + 1);
});

btnFoodMax?.addEventListener('click', e => {
    e.stopPropagation();
    const maxFood = currentStatus.maxFoodDaily || currentConfig.maxFoodDaily || 10;
    setPopupFood(maxFood);
});

// Initial load
loadData();
