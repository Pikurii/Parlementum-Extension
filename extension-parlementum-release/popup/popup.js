/**
 * popup.js — Interactive Extension Toolbar Controller
 */

let currentStatus = {
    running: true,
    currentEnergy: 0,
    maxEnergy: 100,
    nextWorkTimestamp: 0,
    workToday: 0,
    xpToday: 0,
    hasToken: false,
    lastWorkTime: '--:--',
    lastLogMessage: '',
    energyThreshold: 10
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

// ── DOM References ──────────────────────────────────────────────────────────
const elStatusBadge  = document.getElementById('popup-status-badge');
const elStatusText   = document.getElementById('popup-status-text');
const elEnergyVal    = document.getElementById('popup-energy-val');
const elEnergyTarget = document.getElementById('popup-energy-target');
const elBarFill      = document.getElementById('popup-bar-fill');
const elNextWork     = document.getElementById('popup-next-work');
const elWorkToday    = document.getElementById('popup-work-today');
const elXpToday      = document.getElementById('popup-xp-today');
const elTokenStatus  = document.getElementById('popup-token-status');
const elLastWork     = document.getElementById('popup-last-work');
const elLastLog      = document.getElementById('popup-last-log');
const elLastLogBox   = document.getElementById('popup-last-log-box');
const btnOpenLog     = document.getElementById('btn-open-log-modal');
const logModal       = document.getElementById('popup-log-modal');
const btnCloseLog    = document.getElementById('btn-close-log-modal');
const logFilterType  = document.getElementById('popup-log-filter-type');
const logFilterText  = document.getElementById('popup-log-filter-text');
const btnClearLogs   = document.getElementById('btn-clear-popup-logs');
const logEntries     = document.getElementById('popup-log-entries');
const logCount       = document.getElementById('popup-log-count');
const btnToggle      = document.getElementById('btn-popup-toggle');
const btnToggleText  = document.getElementById('btn-toggle-text');
const btnWork        = document.getElementById('btn-popup-work');
const btnOpen        = document.getElementById('btn-popup-open');
const elTabDot       = document.getElementById('popup-tab-dot');
const elTabText      = document.getElementById('popup-tab-text');

let currentLogs = [];
let logFilter   = 'all';
let logSearch   = '';

// ── Render UI from state ────────────────────────────────────────────────────
function renderUI() {
    const isRunning = Boolean(currentStatus.running);
    const threshold = currentConfig.energyThreshold || currentStatus.energyThreshold || 10;
    let currentE    = currentStatus.currentEnergy ?? 0;
    const maxE      = currentStatus.maxEnergy || 100;
    if (currentStatus.updatedAt && currentE < maxE) {
        const elapsedMins = (Date.now() - currentStatus.updatedAt) / 60000;
        const regenRate = currentStatus.regenRate || 1.0;
        const gained = Math.floor(elapsedMins * regenRate);
        if (gained > 0) {
            currentE = Math.min(maxE, currentE + gained);
        }
    }
    const pct       = Math.max(0, Math.min(100, Math.round((currentE / maxE) * 100)));

    const isExpired = Boolean(
        currentStatus.tokenExpired ||
        currentStatus.pausedForToken ||
        !currentStatus.hasToken ||
        (currentStatus.tokenExpiry && Number(currentStatus.tokenExpiry) <= Date.now())
    );

    // 1. Status badge
    if (isExpired) {
        elStatusBadge.className = 'status-badge paused';
        elStatusText.textContent = 'EXPIRED';
        btnToggle.className = 'btn btn-toggle-resume';
        btnToggleText.textContent = '🔑 Perlu Login Ulang';
    } else if (isRunning) {
        elStatusBadge.className = 'status-badge';
        elStatusText.textContent = 'RUNNING';
        btnToggle.className = 'btn btn-toggle-pause';
        btnToggleText.textContent = '⏸ Jeda Auto Worker';
    } else {
        elStatusBadge.className = 'status-badge paused';
        elStatusText.textContent = 'PAUSED';
        btnToggle.className = 'btn btn-toggle-resume';
        btnToggleText.textContent = '▶ Lanjutkan Auto Worker';
    }

    // Region & Buff
    const elRegRow = document.getElementById('popup-region-row');
    const elRegText = document.getElementById('popup-region-text');
    const elRegBuff = document.getElementById('popup-region-buff');
    if (elRegRow && elRegText && elRegBuff) {
        if (currentStatus.regionName) {
            elRegRow.style.display = 'flex';
            elRegText.textContent = currentStatus.regionName;
            elRegBuff.textContent = (currentStatus.regionHealthBonusPercent ?? 0) > 0
                ? `+${currentStatus.regionHealthBonusPercent}% Regen`
                : 'Normal (1.0x)';
        } else {
            elRegRow.style.display = 'none';
        }
    }

    // 2. Energy
    elEnergyVal.textContent = `${currentE}/${maxE}`;
    elEnergyTarget.textContent = `Target: ${threshold}⚡`;
    elBarFill.style.width = `${pct}%`;

    // 3. Accurate Countdown Logic
    const now = Date.now();
    let remaining = (currentStatus.nextWorkTimestamp || 0) - now;
    if (!currentStatus.nextWorkTimestamp && currentE < threshold) {
        remaining = Math.max(1, threshold - currentE) * 60000;
    }

    if (isExpired) {
        elNextWork.textContent = '🔑 Token Expired!';
        elNextWork.style.color = '#ff4444';
        elNextWork.title = '';
    } else if (!isRunning) {
        elNextWork.textContent = '⏸️ Dijeda';
        elNextWork.style.color = '#ff6b6b';
        elNextWork.title = '';
    } else if (_isSleepTime(currentConfig)) {
        elNextWork.textContent = '🌙 Jam Tidur';
        elNextWork.style.color = '#a0a0b0';
        elNextWork.title = '';
    } else if (currentE >= threshold) {
        elNextWork.textContent = '⚡ Siap bekerja!';
        elNextWork.style.color = '#00ff88';
        elNextWork.title = 'Energi sudah mencapai target! Siap bekerja.';
    } else if (remaining > 0) {
        const sec = Math.ceil(remaining / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        elNextWork.textContent = `⏳ ${m}m ${String(s).padStart(2, '0')}s`;
        elNextWork.style.color = '#00d9ff';
        if (currentStatus.nextWorkTimestamp && currentStatus.nextWorkTimestamp > now) {
            const d = new Date(currentStatus.nextWorkTimestamp);
            const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            elNextWork.title = `Estimasi kerja pukul ${timeStr} WIB`;
        }
    } else {
        elNextWork.textContent = '⚡ Menunggu energi...';
        elNextWork.style.color = '#ffaa00';
        elNextWork.title = '';
    }

    // 4. Counters
    elWorkToday.textContent = `${currentStatus.workToday ?? 0}x`;
    elXpToday.textContent   = `+${currentStatus.xpToday ?? 0} XP`;
    elLastWork.textContent  = currentStatus.lastWorkTime || '--:--';

    // 5. Token
    if (isExpired) {
        elTokenStatus.textContent = 'EXPIRED';
        elTokenStatus.className   = 'stat-val token-bad';
    } else if (currentStatus.hasToken) {
        elTokenStatus.textContent = 'VALID';
        elTokenStatus.className   = 'stat-val token-ok';
    } else {
        elTokenStatus.textContent = 'NOT FOUND';
        elTokenStatus.className   = 'stat-val token-bad';
    }

    // 6. Action button hints
    if (isExpired) {
        btnOpen.textContent = '🔑 Buka & Login Game';
        btnOpen.style.borderColor = 'rgba(255, 68, 68, 0.4)';
    } else {
        btnOpen.textContent = '🌐 Buka Tab Parlamentum';
        btnOpen.style.borderColor = '';
    }

    // 7. Last Activity Log
    if (elLastLog) {
        const logMsg = currentStatus.lastLogMessage || 'Auto Worker siap beroperasi.';
        elLastLog.textContent = logMsg;
        elLastLog.title = logMsg;
    }
}

// ── Tab Check ───────────────────────────────────────────────────────────────
function checkGameTab() {
    chrome.tabs.query({ url: '*://parlamentum.org/*' }, tabs => {
        if (tabs && tabs.length > 0) {
            elTabDot.className = 'footer-dot online';
            elTabText.textContent = `Tab game aktif (${tabs.length} tab)`;
        } else {
            elTabDot.className = 'footer-dot';
            elTabText.textContent = 'Background worker aktif';
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
            currentLogs = res.aw_recent_logs;
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
btnToggle.addEventListener('click', () => {
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
btnWork.addEventListener('click', () => {
    const isExpired = Boolean(
        currentStatus.tokenExpired ||
        currentStatus.pausedForToken ||
        !currentStatus.hasToken ||
        (currentStatus.tokenExpiry && Number(currentStatus.tokenExpiry) <= Date.now())
    );

    if (isExpired) {
        btnWork.textContent = '🔑 Token Expired! Login Ulang';
        btnWork.style.background = 'linear-gradient(135deg, #ff4444, #cc0000)';
        btnWork.style.color = '#fff';
        setTimeout(() => {
            btnWork.textContent = '⚡ Kerja Sekarang (Manual)';
            btnWork.style.background = '';
            btnWork.style.color = '';
        }, 2500);
        return;
    }

    btnWork.disabled = true;
    const origText = '⚡ Kerja Sekarang (Manual)';
    btnWork.textContent = '⏳ Mengirim shift kerja...';

    chrome.runtime.sendMessage({
        type: 'POPUP_TO_TAB',
        action: 'workNow'
    }, res => {
        if (res && res.ok) {
            btnWork.textContent = '✅ Shift sukses!';
            btnWork.style.background = 'linear-gradient(135deg, #00ff88, #00cc66)';
            btnWork.style.color = '#000';
            setTimeout(() => loadData(), 500);
        } else {
            let err = '⚠️ Gagal';
            if (res?.error === 'token_expired' || res?.error === 'no_token') {
                err = '🔑 Token Expired! Login Ulang';
            } else if (res?.error === 'insufficient_energy') {
                err = '⚠️ Energi belum cukup!';
            } else if (res?.error === 'busy') {
                err = '⏳ Sedang bekerja...';
            } else if (res?.error === 'waiting') {
                err = '⏳ Menunggu giliran...';
            } else if (res?.error === 'region_mismatch') {
                err = '⚠️ Lokasi wilayah tidak cocok!';
            } else if (res?.message) {
                err = `⚠️ ${res.message.slice(0, 32)}`;
            } else {
                err = `⚠️ Gagal (${res?.error || 'timeout'})`;
            }
            btnWork.textContent = err;
            btnWork.style.background = 'linear-gradient(135deg, #ff4444, #cc0000)';
            btnWork.style.color = '#fff';
            setTimeout(() => loadData(), 400);
        }
        setTimeout(() => {
            btnWork.disabled = false;
            btnWork.textContent = origText;
            btnWork.style.background = '';
            btnWork.style.color = '';
            loadData();
        }, 2200);
    });
});

// 3. Open or focus Parlamentum tab
btnOpen.addEventListener('click', () => {
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

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = `[${entry.time || '--:--'}]`;

        const msgSpan = document.createElement('span');
        msgSpan.textContent = entry.message || '';

        row.append(timeSpan, msgSpan);
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
                        currentLogs = response.logs;
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

elLastLogBox?.addEventListener('click', () => {
    openLogModal();
});

btnOpenLog?.addEventListener('click', e => {
    e.stopPropagation();
    openLogModal();
});

btnCloseLog?.addEventListener('click', closeLogModal);

logFilterType?.addEventListener('change', e => {
    logFilter = e.target.value;
    renderLogList();
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

// Init
loadData();
