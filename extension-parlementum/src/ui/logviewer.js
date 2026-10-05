/**
 * ui/logviewer.js — Activity log viewer modal
 * Modernized with category filter pills, live counters, search bar,
 * copy to clipboard, export to file, and dark glassmorphic styling.
 */

import { clearStoredLogs } from '../logger.js';

// Inject scoped stylesheet once
function ensureLogViewerStyles() {
    if (document.getElementById('aw-log-styles')) return;
    const style = document.createElement('style');
    style.id = 'aw-log-styles';
    style.textContent = `
        #aw-log-modal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #e2e8f0;
        }

        /* Filter Pills */
        .aw-log-filter-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 11px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 8px;
            color: #8b9bb4;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            white-space: nowrap;
        }
        .aw-log-filter-pill:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.14);
        }
        .aw-log-filter-pill.active {
            color: #00ff88;
            background: linear-gradient(135deg, rgba(0, 255, 136, 0.14), rgba(0, 180, 216, 0.09));
            border-color: rgba(0, 255, 136, 0.5);
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0, 255, 136, 0.15);
        }
        .aw-log-filter-count {
            font-size: 10px;
            font-weight: 700;
            padding: 1px 6px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.08);
            color: #94a3b8;
            transition: all 0.2s;
        }
        .aw-log-filter-pill.active .aw-log-filter-count {
            background: rgba(0, 255, 136, 0.2);
            color: #00ff88;
        }

        /* Type Badges */
        .aw-log-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.3px;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .aw-log-badge-success {
            background: rgba(0, 255, 136, 0.12);
            color: #00ff88;
            border: 1px solid rgba(0, 255, 136, 0.25);
        }
        .aw-log-badge-warn {
            background: rgba(255, 209, 102, 0.12);
            color: #ffd166;
            border: 1px solid rgba(255, 209, 102, 0.25);
        }
        .aw-log-badge-error {
            background: rgba(255, 107, 107, 0.12);
            color: #ff6b6b;
            border: 1px solid rgba(255, 107, 107, 0.25);
        }
        .aw-log-badge-info {
            background: rgba(0, 212, 255, 0.12);
            color: #00d4ff;
            border: 1px solid rgba(0, 212, 255, 0.25);
        }

        /* Log Row */
        .aw-log-row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 8px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 6px;
            transition: background 0.15s;
            position: relative;
        }
        .aw-log-row:hover {
            background: rgba(255, 255, 255, 0.04);
        }
        .aw-log-row:last-child {
            border-bottom: none;
        }
        .aw-log-time {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 11px;
            color: #64748b;
            white-space: nowrap;
            padding-top: 1px;
            flex-shrink: 0;
        }
        .aw-log-msg {
            flex: 1;
            font-size: 12px;
            line-height: 1.45;
            word-break: break-word;
            color: #cbd5e1;
        }
        .aw-log-copy-btn {
            opacity: 0;
            transition: opacity 0.15s, background 0.15s;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #94a3b8;
            border-radius: 4px;
            padding: 2px 7px;
            font-size: 10px;
            cursor: pointer;
            margin-left: auto;
            flex-shrink: 0;
        }
        .aw-log-row:hover .aw-log-copy-btn {
            opacity: 1;
        }
        .aw-log-copy-btn:hover {
            background: rgba(0, 255, 136, 0.15);
            color: #00ff88;
            border-color: rgba(0, 255, 136, 0.4);
        }

        /* Custom Scrollbars */
        #aw-log-entries::-webkit-scrollbar {
            width: 6px;
        }
        #aw-log-entries::-webkit-scrollbar-track {
            background: transparent;
        }
        #aw-log-entries::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.14);
            border-radius: 4px;
        }
        #aw-log-entries::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.28);
        }

        .aw-log-pills-container::-webkit-scrollbar {
            display: none;
        }
    `;
    document.head.appendChild(style);
}

export function createLogViewer(state, CONFIG) {
    ensureLogViewerStyles();

    const old = document.getElementById('aw-log-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'aw-log-modal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100003;
        justify-content: center;
        align-items: center;
    `;

    modal.innerHTML = `
        <div style="
            background: linear-gradient(180deg, #131724 0%, #0d101a 100%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            width: 95%;
            max-width: 680px;
            height: 620px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 1px 1px rgba(255,255,255,0.05);
            overflow: hidden;
        ">
            <!-- Modal Header -->
            <div style="
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, rgba(26, 33, 54, 0.8) 0%, rgba(18, 22, 36, 0.95) 100%);
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="
                        width: 32px; height: 32px; border-radius: 8px;
                        background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,102,255,0.2));
                        border: 1px solid rgba(0,212,255,0.3);
                        display: flex; align-items: center; justify-content: center;
                        font-size: 16px;
                    ">📋</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 15px; letter-spacing: 0.3px;">Activity Log</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Riwayat aktivitas & status kerja bot secara real-time</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="aw-copy-all-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 11.5px; font-weight: 600; transition: all 0.15s;
                    ">📋 Salin Log</button>
                    <button id="aw-clear-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #ff6b6b; border: 1px solid rgba(255, 107, 107, 0.25);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 11.5px; font-weight: 600; transition: all 0.15s;
                    ">🗑️ Bersihkan</button>
                    <button id="aw-close-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; font-weight: 600; transition: all 0.15s;
                    ">✕ Tutup</button>
                </div>
            </div>

            <!-- Toolbar: Filter Pills & Search Input -->
            <div style="
                padding: 10px 18px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                background: rgba(12, 16, 26, 0.6);
                display: flex;
                gap: 12px;
                align-items: center;
                flex-wrap: wrap;
            ">
                <!-- Category Filter Pills -->
                <div class="aw-log-pills-container" style="display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;">
                    <button type="button" class="aw-log-filter-pill active" data-type="all">
                        Semua <span class="aw-log-filter-count" id="aw-count-all">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="success">
                        ✅ Sukses <span class="aw-log-filter-count" id="aw-count-success">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="warn">
                        ⚠️ Peringatan <span class="aw-log-filter-count" id="aw-count-warn">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="error">
                        ❌ Error <span class="aw-log-filter-count" id="aw-count-error">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="info">
                        ℹ️ Info <span class="aw-log-filter-count" id="aw-count-info">0</span>
                    </button>
                </div>

                <!-- Hidden select for backward compatibility -->
                <select id="aw-log-filter-type" style="display: none;">
                    <option value="all">Semua</option>
                    <option value="success">Success</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                    <option value="info">Info</option>
                </select>

                <!-- Search Input -->
                <div style="flex: 1; min-width: 170px; position: relative; display: flex; align-items: center;">
                    <span style="position: absolute; left: 10px; font-size: 12px; color: #64748b; pointer-events: none;">🔍</span>
                    <input id="aw-log-filter-text" type="text" placeholder="Cari log (shift, energi, buff)..." style="
                        width: 100%; box-sizing: border-box;
                        background: #141826; color: #fff;
                        border: 1px solid #28334e; border-radius: 8px;
                        padding: 6px 12px 6px 30px; font-size: 11.5px;
                        outline: none; transition: border-color 0.2s;
                    ">
                </div>
            </div>

            <!-- Scrollable Log Entries -->
            <div id="aw-log-entries" style="
                flex: 1;
                overflow-y: auto;
                padding: 12px 18px;
                overscroll-behavior: contain;
                background: rgba(8, 11, 18, 0.4);
            "></div>

            <!-- Sticky Modal Footer -->
            <div style="
                padding: 10px 18px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, #131724 0%, #0d101a 100%);
                font-size: 11.5px;
                color: #8b9bb4;
            ">
                <div id="aw-log-status" style="display: flex; align-items: center; gap: 8px;">
                    <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #00ff88; box-shadow: 0 0 8px #00ff88;"></span>
                    <span id="aw-log-summary">Stream aktif • 0 riwayat tersimpan</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="aw-export-log-btn" style="
                        background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1);
                        padding: 5px 12px; border-radius: 6px; cursor: pointer;
                        font-size: 11px; font-weight: 500; transition: all 0.15s;
                    ">💾 Ekspor .txt</button>
                    <button id="aw-close-log-footer" style="
                        background: transparent; color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 5px 14px; border-radius: 6px; cursor: pointer;
                        font-size: 11px; font-weight: 600;
                    ">Tutup</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    function closeLog() { modal.style.display = 'none'; }
    document.getElementById('aw-close-log')?.addEventListener('click', closeLog);
    document.getElementById('aw-close-log-footer')?.addEventListener('click', closeLog);
    modal.addEventListener('click', e => { if (e.target === modal) closeLog(); });

    let filterType = 'all', filterText = '';

    // Filter pills click handling
    const filterPills = modal.querySelectorAll('.aw-log-filter-pill');
    const hiddenSelect = document.getElementById('aw-log-filter-type');
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            filterType = pill.dataset.type || 'all';
            if (hiddenSelect) hiddenSelect.value = filterType;
            renderLogs(state, filterType, filterText);
        });
    });

    hiddenSelect?.addEventListener('change', e => {
        filterType = e.target.value;
        filterPills.forEach(p => p.classList.toggle('active', p.dataset.type === filterType));
        renderLogs(state, filterType, filterText);
    });

    document.getElementById('aw-log-filter-text')?.addEventListener('input', e => {
        filterText = e.target.value.toLowerCase();
        renderLogs(state, filterType, filterText);
    });

    document.getElementById('aw-clear-log')?.addEventListener('click', () => {
        if (!confirm('Yakin ingin membersihkan semua riwayat Activity Log?')) return;
        state.logs = [];
        clearStoredLogs();
        renderLogs(state, filterType, filterText);
    });

    // Copy all logs to clipboard
    document.getElementById('aw-copy-all-log')?.addEventListener('click', () => {
        if (!state.logs || state.logs.length === 0) return;
        const textToCopy = state.logs
            .map(e => `[${e.time}] [${e.type.toUpperCase()}] ${e.message}`)
            .join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            const btn = document.getElementById('aw-copy-all-log');
            if (btn) {
                const orig = btn.textContent;
                btn.textContent = '✅ Tersalin!';
                btn.style.color = '#00ff88';
                setTimeout(() => {
                    btn.textContent = orig;
                    btn.style.color = '#cbd5e1';
                }, 1500);
            }
        }).catch(() => {});
    });

    // Export logs to .txt file
    document.getElementById('aw-export-log-btn')?.addEventListener('click', () => {
        if (!state.logs || state.logs.length === 0) {
            alert('Tidak ada riwayat log untuk diekspor.');
            return;
        }
        const textContent = [
            `=== PARLAMENTUM AUTO WORKER ACTIVITY LOG ===`,
            `Diekspor pada: ${new Date().toLocaleString('id-ID')}`,
            `Total log: ${state.logs.length}`,
            `============================================\n`,
            ...state.logs.map(e => `[${e.time}] [${e.type.toUpperCase()}] ${e.message}`)
        ].join('\n');

        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `parlementum-log-${dateStr}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

export function openLogViewer(state, CONFIG) {
    const modal = document.getElementById('aw-log-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    updateLogViewer(state, CONFIG);
}

export function updateLogViewer(state, CONFIG) {
    if (document.getElementById('aw-log-modal')?.style.display !== 'flex') return;
    const filterType = document.getElementById('aw-log-filter-type')?.value || 'all';
    const filterText = (document.getElementById('aw-log-filter-text')?.value || '').toLowerCase();
    renderLogs(state, filterType, filterText);
}

function renderLogs(state, filterType, filterText) {
    const container = document.getElementById('aw-log-entries');
    if (!container) return;

    const allLogs = state.logs || [];

    // Update live counters
    const countAll = allLogs.length;
    let countSuccess = 0, countWarn = 0, countError = 0, countInfo = 0;
    allLogs.forEach(l => {
        if (l.type === 'success') countSuccess++;
        else if (l.type === 'warn') countWarn++;
        else if (l.type === 'error') countError++;
        else if (l.type === 'info') countInfo++;
    });

    const elAll = document.getElementById('aw-count-all');
    const elSuccess = document.getElementById('aw-count-success');
    const elWarn = document.getElementById('aw-count-warn');
    const elError = document.getElementById('aw-count-error');
    const elInfo = document.getElementById('aw-count-info');

    if (elAll) elAll.textContent = countAll;
    if (elSuccess) elSuccess.textContent = countSuccess;
    if (elWarn) elWarn.textContent = countWarn;
    if (elError) elError.textContent = countError;
    if (elInfo) elInfo.textContent = countInfo;

    const filtered = allLogs.filter(e =>
        (filterType === 'all' || e.type === filterType) &&
        (!filterText || e.message.toLowerCase().includes(filterText))
    );

    const summaryEl = document.getElementById('aw-log-summary');
    if (summaryEl) {
        summaryEl.textContent = `Menampilkan ${filtered.length} dari ${countAll} riwayat log`;
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #64748b; padding: 40px 20px; text-align: center;">
                <span style="font-size: 34px; margin-bottom: 10px; opacity: 0.7;">📋</span>
                <span style="font-size: 14px; font-weight: 600; color: #94a3b8; margin-bottom: 4px;">Tidak ada riwayat aktivitas</span>
                <span style="font-size: 12px; color: #64748b;">${countAll === 0 ? 'Belum ada aktivitas yang dicatat.' : 'Tidak ada log yang cocok dengan filter atau kata kunci pencarian.'}</span>
            </div>
        `;
        return;
    }

    const BADGE_CONFIG = {
        success: { text: 'SUKSES', cls: 'aw-log-badge-success', icon: '✅' },
        warn:    { text: 'WARN',   cls: 'aw-log-badge-warn',    icon: '⚠️' },
        error:   { text: 'ERROR',  cls: 'aw-log-badge-error',   icon: '❌' },
        info:    { text: 'INFO',   cls: 'aw-log-badge-info',    icon: 'ℹ️' }
    };

    container.replaceChildren(...filtered.map(entry => {
        const row = document.createElement('div');
        row.className = 'aw-log-row';

        // Timestamp
        const time = document.createElement('span');
        time.className = 'aw-log-time';
        time.textContent = entry.time || '--:--:--';

        // Badge
        const badge = document.createElement('span');
        const bConf = BADGE_CONFIG[entry.type] || BADGE_CONFIG.info;
        badge.className = `aw-log-badge ${bConf.cls}`;
        badge.textContent = `${bConf.icon} ${bConf.text}`;

        // Message
        const msg = document.createElement('span');
        msg.className = 'aw-log-msg';
        msg.textContent = entry.message;

        // Individual copy button on hover
        const copyBtn = document.createElement('button');
        copyBtn.className = 'aw-log-copy-btn';
        copyBtn.textContent = 'Salin';
        copyBtn.title = 'Salin baris log ini';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(`[${entry.time}] ${entry.message}`).then(() => {
                copyBtn.textContent = '✓';
                copyBtn.style.color = '#00ff88';
                setTimeout(() => {
                    copyBtn.textContent = 'Salin';
                    copyBtn.style.color = '#94a3b8';
                }, 1200);
            }).catch(() => {});
        });

        row.append(time, badge, msg, copyBtn);
        return row;
    }));
}
