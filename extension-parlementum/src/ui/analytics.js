/**
 * ui/analytics.js — Analytics & work history dashboard
 * Modernized with KPI metric cards, glowing 7-day bar charts,
 * interactive tooltips, and sleek glassmorphic styling.
 */

import { loadWorkHistory, saveWorkHistory, normalizeWorkHistory, migrateLegacyEnergyHistory, pruneOldHistory } from '../history.js';
import { isPlainObject, normalizeConfig } from '../config.js';
import { setValue } from '../storage.js';
import { saveState } from '../state.js';

// Inject scoped stylesheet once
function ensureAnalyticsStyles() {
    if (document.getElementById('aw-analytics-styles')) return;
    const style = document.createElement('style');
    style.id = 'aw-analytics-styles';
    style.textContent = `
        #aw-analytics-modal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #e2e8f0;
        }

        /* KPI Metric Cards Grid */
        .aw-kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 14px;
        }
        @media (max-width: 600px) {
            .aw-kpi-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        .aw-kpi-card {
            background: rgba(22, 27, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 10px;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 3px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .aw-kpi-card:hover {
            background: rgba(28, 35, 54, 0.75);
            border-color: rgba(255, 255, 255, 0.14);
            transform: translateY(-1px);
        }
        .aw-kpi-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
            color: #8b9bb4;
            font-weight: 500;
        }
        .aw-kpi-value {
            font-size: 19px;
            font-weight: 700;
            letter-spacing: -0.3px;
            line-height: 1.25;
            margin-top: 2px;
        }
        .aw-kpi-sub {
            font-size: 10.5px;
            color: #64748b;
            margin-top: 2px;
            line-height: 1.35;
        }

        /* Analytics Section Cards */
        .aw-analytics-section {
            background: rgba(22, 27, 42, 0.55);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
            transition: all 0.2s;
        }
        .aw-analytics-section:hover {
            border-color: rgba(255, 255, 255, 0.1);
        }
        .aw-section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .aw-section-title {
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .aw-section-subtitle {
            font-size: 11px;
            color: #8b9bb4;
        }

        /* Bar Graph Styling */
        .aw-graph-container {
            background: rgba(12, 16, 26, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            padding: 14px 10px 10px;
            margin-bottom: 12px;
            position: relative;
        }
        .aw-graph-bar {
            border-radius: 3px 3px 0 0;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
        }
        .aw-graph-bar:hover {
            filter: brightness(1.25);
            transform: scaleY(1.03);
            transform-origin: bottom;
        }

        /* Custom Scrollbar */
        #aw-analytics-content::-webkit-scrollbar {
            width: 6px;
        }
        #aw-analytics-content::-webkit-scrollbar-track {
            background: transparent;
        }
        #aw-analytics-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.14);
            border-radius: 4px;
        }
        #aw-analytics-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.28);
        }
    `;
    document.head.appendChild(style);
}

export function createAnalyticsDashboard(state, CONFIG, workHistory, ctx) {
    ensureAnalyticsStyles();

    const old = document.getElementById('aw-analytics-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'aw-analytics-modal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100002;
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
            height: 640px;
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
                        background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,255,136,0.2));
                        border: 1px solid rgba(0,212,255,0.3);
                        display: flex; align-items: center; justify-content: center;
                        font-size: 16px;
                    ">📊</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 15px; letter-spacing: 0.3px;">Statistik & Efisiensi Kerja</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Pantau performa shift, perolehan XP, dan konsumsi energi</div>
                    </div>
                </div>
                <button id="aw-close-analytics" style="
                    background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 6px 12px; border-radius: 8px; cursor: pointer;
                    font-size: 12px; font-weight: 600; transition: all 0.15s;
                ">✕ Tutup</button>
            </div>

            <!-- Scrollable Content Body -->
            <div id="aw-analytics-content" style="
                padding: 18px 20px;
                overflow-y: auto;
                flex: 1;
                overscroll-behavior: contain;
            ">
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    function closeAnalytics() {
        modal.style.display = 'none';
    }

    document.getElementById('aw-close-analytics')?.addEventListener('click', closeAnalytics);
    modal.addEventListener('click', e => {
        if (e.target === modal) closeAnalytics();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            closeAnalytics();
        }
    });
}

export function openAnalytics(state, CONFIG, workHistory, ctx) {
    const modal = document.getElementById('aw-analytics-modal');
    if (!modal) return;
    updateAnalyticsView(state, CONFIG, workHistory, ctx);
    modal.style.display = 'flex';
}

// ─── Data Export & Sync ───────────────────────────────────────────────────────

function getExportData(state, CONFIG, workHistory) {
    return {
        version: '5.11.0',
        exportedAt: new Date().toISOString(),
        exportedAtLocal: new Date().toLocaleString('id-ID'),
        stats: {
            totalWorked: state.totalWorked,
            totalWorkXP: state.totalWorkXP,
            workToday: state.workToday,
            xpToday: state.xpToday,
            totalEnergySpent: state.totalEnergySpent,
            totalActualEnergySpent: state.totalActualEnergySpent,
            totalEstimatedEnergySpent: state.totalEstimatedEnergySpent,
            lastWorkDate: state.lastWorkDate,
            lastWorkTime: state.lastWorkTime,
            sessionStartTime: state.sessionStartTime,
            currentEnergy: state.currentEnergy,
            maxEnergy: state.maxEnergy,
            playerLevel: state.playerLevel
        },
        workHistory: loadWorkHistory(state, CONFIG),
        config: CONFIG
    };
}

function copyExportToClipboard(btnElement, state, CONFIG, workHistory, ctx) {
    try {
        const dataStr = JSON.stringify(getExportData(state, CONFIG, workHistory), null, 2);
        navigator.clipboard.writeText(dataStr).then(() => {
            if (btnElement) {
                const originalText = btnElement.innerHTML;
                btnElement.innerHTML = '✅ Berhasil Disalin!';
                btnElement.style.background = 'linear-gradient(135deg, #00ff88, #00aa55)';
                btnElement.style.color = '#000';
                setTimeout(() => {
                    btnElement.innerHTML = originalText;
                    btnElement.style.background = 'linear-gradient(135deg, #0088ff, #0055cc)';
                    btnElement.style.color = '#fff';
                }, 2000);
            }
            ctx?.log?.('📋 Data bot berhasil diexport dan disalin ke clipboard.', 'success');
        }).catch(() => {
            prompt('Salin data JSON berikut secara manual:', dataStr);
        });
    } catch (e) {
        console.error('Failed to export data:', e);
        ctx?.log?.('Gagal export data: ' + e.message, 'error');
    }
}

function downloadExportFile(state, CONFIG, workHistory, ctx) {
    try {
        const dataStr = JSON.stringify(getExportData(state, CONFIG, workHistory), null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `parlamentum_bot_backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        ctx?.log?.('💾 File backup JSON berhasil didownload.', 'success');
    } catch (e) {
        console.error('Failed to download backup:', e);
    }
}

function importDataFromJSON(jsonString, state, CONFIG, workHistory, ctx) {
    try {
        if (!jsonString || !jsonString.trim()) {
            alert('⚠️ Silakan paste kode JSON backup terlebih dahulu.');
            return false;
        }
        const parsed = JSON.parse(jsonString.trim());
        if (!isPlainObject(parsed)) throw new Error('Format JSON tidak valid');

        const updates = [];
        const stateUpdates = {};
        if (parsed.stats !== undefined) {
            if (!isPlainObject(parsed.stats)) throw new Error('Format statistik tidak valid');
            const numericStats = ['totalWorked', 'totalWorkXP', 'workToday', 'xpToday', 'totalEnergySpent', 'totalActualEnergySpent', 'totalEstimatedEnergySpent'];
            for (const key of numericStats) {
                if (parsed.stats[key] === undefined) continue;
                if (!Number.isSafeInteger(parsed.stats[key]) || parsed.stats[key] < 0) throw new Error(`Nilai ${key} tidak valid`);
                updates.push([key, parsed.stats[key].toString()]);
                stateUpdates[key] = parsed.stats[key];
            }
            if (parsed.stats.lastWorkDate !== undefined) {
                const date = parsed.stats.lastWorkDate;
                if (typeof date !== 'string' || new Date(date).toDateString() !== date) throw new Error('Tanggal kerja tidak valid');
                updates.push(['lastWorkDate', date]);
                stateUpdates.lastWorkDate = date;
            }
            if (parsed.stats.lastWorkTime !== undefined) {
                if (typeof parsed.stats.lastWorkTime !== 'string' || parsed.stats.lastWorkTime.length > 100) throw new Error('Waktu kerja tidak valid');
                updates.push(['lastWorkTime', parsed.stats.lastWorkTime]);
                stateUpdates.lastWorkTime = parsed.stats.lastWorkTime;
            }
            if (parsed.stats.sessionStartTime !== undefined) {
                if (!Number.isSafeInteger(parsed.stats.sessionStartTime) || parsed.stats.sessionStartTime <= 0) throw new Error('Waktu sesi tidak valid');
                updates.push(['sessionStartTime', parsed.stats.sessionStartTime.toString()]);
                stateUpdates.sessionStartTime = parsed.stats.sessionStartTime;
            }
            const nextStats = { ...state, ...stateUpdates };
            if (nextStats.workToday > nextStats.totalWorked || nextStats.xpToday > nextStats.totalWorkXP) {
                throw new Error('Counter harian tidak boleh melebihi akumulasi total');
            }
        }

        let importedHistory;
        if (parsed.workHistory !== undefined) {
            importedHistory = normalizeWorkHistory(parsed.workHistory);
            if (!importedHistory) throw new Error('Format history kerja tidak valid');
            const importedVersionParts = String(parsed.version ?? '').split('.').map(Number);
            const [importedMajor, importedMinor, importedPatch] = importedVersionParts;
            const isLegacyImport = !Number.isSafeInteger(importedMajor) ||
                !Number.isSafeInteger(importedMinor) ||
                !Number.isSafeInteger(importedPatch) ||
                importedMajor < 5 ||
                (importedMajor === 5 && (importedMinor < 9 || (importedMinor === 9 && importedPatch < 8)));
            if (isLegacyImport) {
                migrateLegacyEnergyHistory(importedHistory);
            }
            pruneOldHistory(importedHistory, CONFIG.historyMaxDays);
            updates.push(['aw_workHistory', JSON.stringify(importedHistory)]);
            updates.push(['aw_energySchemaVersion', '2']);
        }

        if (parsed.stats !== undefined && importedHistory) {
            const todayKey = new Date().toDateString();
            const importedToday = importedHistory[todayKey];
            if (importedToday && (
                importedToday.shifts !== (stateUpdates.workToday ?? state.workToday) ||
                importedToday.xp !== (stateUpdates.xpToday ?? state.xpToday)
            )) {
                throw new Error('History hari ini tidak cocok dengan counter statistik');
            }
        }

        let importedConfig;
        if (parsed.config !== undefined) {
            importedConfig = normalizeConfig(parsed.config, true);
            if (!importedConfig) throw new Error('Format konfigurasi tidak valid');
            updates.push(['aw_config', JSON.stringify(importedConfig)]);
        }

        if (updates.length === 0) throw new Error('Tidak ada data statistik atau konfigurasi yang valid ditemukan dalam JSON.');

        updates.forEach(([key, value]) => setValue(key, value));
        Object.assign(state, stateUpdates);
        if (importedHistory && workHistory) {
            Object.keys(workHistory).forEach(k => delete workHistory[k]);
            Object.assign(workHistory, importedHistory);
        }

        ctx?.log?.('✅ Data berhasil di-import dan disinkronkan! Halaman akan di-refresh...', 'success');
        alert('✅ Berhasil Import & Sinkronisasi Data!\n\nHalaman akan di-refresh untuk menerapkan data baru.');
        location.reload();
        return true;
    } catch (e) {
        alert('❌ Gagal Import Data: Format JSON tidak valid.\n\nDetail: ' + e.message);
        return false;
    }
}

// ─── Analytics View Rendering ─────────────────────────────────────────────────

export function updateAnalyticsView(state, CONFIG, workHistory, ctx) {
    const content = document.getElementById('aw-analytics-content');
    if (!content) return;

    // Reload fresh history setiap kali analytics dibuka
    const activeHistory = loadWorkHistory(state, CONFIG);
    if (workHistory) {
        Object.keys(workHistory).forEach(k => delete workHistory[k]);
        Object.assign(workHistory, activeHistory);
    }

    const avgXPPerWork = state.totalWorked > 0
        ? (state.totalWorkXP / state.totalWorked).toFixed(1)
        : '0.0';

    // 🌟 GENERATE 7-DAY HISTORY GRAPH DATA
    const currentTodayStr = new Date().toDateString();
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toDateString();
        const dateLabel = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
        const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });
        const dayData = activeHistory[key] || { shifts: 0, xp: 0 };
        last7Days.push({
            key,
            dateLabel,
            dayName,
            shifts: dayData.shifts || 0,
            xp: dayData.xp || 0,
            energySpent: Number.isSafeInteger(dayData.energySpent) ? dayData.energySpent : null,
            estimatedEnergySpent: Number.isSafeInteger(dayData.estimatedEnergySpent) ? dayData.estimatedEnergySpent : 0,
            energyDataShifts: Number.isSafeInteger(dayData.energyDataShifts) ? dayData.energyDataShifts : 0
        });
    }

    const todayData = last7Days[last7Days.length - 1];
    const previousDayData = last7Days[last7Days.length - 2];
    const shiftsComparedToYesterday = todayData.shifts - previousDayData.shifts;
    const xpComparedToYesterday = todayData.xp - previousDayData.xp;
    const todayAverageXPPerWork = state.workToday > 0
        ? (state.xpToday / state.workToday).toFixed(1)
        : '0.0';
    const last7DayTotals = last7Days.reduce((totals, day) => ({
        shifts: totals.shifts + day.shifts,
        xp: totals.xp + day.xp,
        energySpent: totals.energySpent + (day.energySpent || 0),
        estimatedEnergySpent: totals.estimatedEnergySpent + day.estimatedEnergySpent,
        energyDataShifts: totals.energyDataShifts + day.energyDataShifts
    }), { shifts: 0, xp: 0, energySpent: 0, estimatedEnergySpent: 0, energyDataShifts: 0 });
    const averageShiftsPerDay = (last7DayTotals.shifts / last7Days.length).toFixed(1);
    const averageXPPerDay = Math.round(last7DayTotals.xp / last7Days.length);

    const maxShifts = Math.max(1, ...last7Days.map(d => d.shifts));
    const maxXp = Math.max(1, ...last7Days.map(d => d.xp));
    const maxEnergySpent = Math.max(1, ...last7Days.map(d => d.energySpent || 0));

    // 🌟 GRAPH DENGAN MODERN GLOW BARS & TOOLTIP
    let graphHTML = `<div class="aw-graph-container">`;
    graphHTML += `<div style="display: flex; justify-content: space-between; align-items: flex-end; height: 140px; gap: 8px; padding: 10px 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 10px;">`;

    last7Days.forEach((day, index) => {
        const shiftHeight = Math.max(day.shifts > 0 ? 8 : 2, Math.round((day.shifts / maxShifts) * 100));
        const xpHeight = Math.max(day.xp > 0 ? 8 : 2, Math.round((day.xp / maxXp) * 100));
        const energyHeight = day.energySpent === null || (day.energySpent === 0 && day.estimatedEnergySpent > 0)
            ? 0
            : Math.max(day.energySpent > 0 ? 8 : 2, Math.round((day.energySpent / maxEnergySpent) * 100));
        const isToday = day.key === currentTodayStr;

        graphHTML += `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; ${isToday ? 'background: rgba(0, 255, 136, 0.05); border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 8px; padding: 4px 0;' : ''}"
                 id="graph-day-${index}">
                <div style="width: 100%; display: flex; gap: 3px; align-items: flex-end; height: 95px; justify-content: center;">
                    <div class="aw-graph-bar" data-day-index="${index}" data-type="shift" data-value="${day.shifts}" style="width: 28%; max-width: 12px; background: ${isToday ? 'linear-gradient(180deg, #00d4ff, #0066cc)' : '#25354d'};
                         height: ${shiftHeight}%; box-shadow: ${isToday ? '0 0 8px rgba(0, 212, 255, 0.3)' : 'none'};"></div>
                    <div class="aw-graph-bar" data-day-index="${index}" data-type="xp" data-value="${day.xp}" style="width: 28%; max-width: 12px; background: ${isToday ? 'linear-gradient(180deg, #00ff88, #00aa55)' : '#1e4033'};
                         height: ${xpHeight}%; box-shadow: ${isToday ? '0 0 8px rgba(0, 255, 136, 0.3)' : 'none'};"></div>
                    <div class="aw-graph-bar" data-day-index="${index}" data-type="energy" data-value="${day.energySpent === null ? 'null' : day.energySpent}" style="width: 28%; max-width: 12px; background: ${isToday ? 'linear-gradient(180deg, #ffb547, #d97706)' : '#4a3820'};
                         height: ${energyHeight}%; cursor: ${day.energySpent === null ? 'default' : 'pointer'}; box-shadow: ${isToday ? '0 0 8px rgba(255, 181, 71, 0.3)' : 'none'};"></div>
                </div>
                <div style="font-size: 10px; color: ${isToday ? '#00ff88' : '#cbd5e1'}; font-weight: ${isToday ? '700' : '500'}; margin-top: 4px;">${day.dateLabel}</div>
                <div style="font-size: 9.5px; color: ${isToday ? '#94a3b8' : '#64748b'};">${day.shifts}x</div>
            </div>
        `;
    });

    graphHTML += `</div>`;

    // Tooltip container
    graphHTML += `
        <div id="graph-tooltip" style="
            position: absolute;
            background: rgba(10, 14, 24, 0.96);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 11.5px;
            color: #fff;
            pointer-events: none;
            display: none;
            z-index: 9999;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8);
            white-space: nowrap;
        "></div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; font-size: 11px; margin-top: 6px;">
            <span style="display: flex; align-items: center; gap: 6px; color: #cbd5e1;"><span style="width: 10px; height: 10px; background: linear-gradient(135deg, #00d4ff, #0066cc); border-radius: 3px; display: inline-block;"></span> Shift Kerja</span>
            <span style="display: flex; align-items: center; gap: 6px; color: #cbd5e1;"><span style="width: 10px; height: 10px; background: linear-gradient(135deg, #00ff88, #00aa55); border-radius: 3px; display: inline-block;"></span> Work XP</span>
            <span style="display: flex; align-items: center; gap: 6px; color: #cbd5e1;"><span style="width: 10px; height: 10px; background: linear-gradient(135deg, #ffb547, #d97706); border-radius: 3px; display: inline-block;"></span> Energi Digunakan</span>
        </div>
    </div>`;

    const formatDiff = (diff, unit) => {
        if (diff > 0) return `<span style="color: #00ff88; font-weight: 600;">+${diff} ${unit}</span>`;
        if (diff < 0) return `<span style="color: #ff6b6b; font-weight: 600;">${diff} ${unit}</span>`;
        return `<span style="color: #8b9bb4;">Sama dgn kemarin</span>`;
    };

    content.innerHTML = `
        <!-- Top KPI Grid: 4 Metric Cards -->
        <div class="aw-kpi-grid">
            <div class="aw-kpi-card">
                <div class="aw-kpi-header">
                    <span>Shift Hari Ini</span>
                    <span>🎯</span>
                </div>
                <div class="aw-kpi-value" style="color: #00d4ff;">${state.workToday}x</div>
                <div class="aw-kpi-sub">${formatDiff(shiftsComparedToYesterday, 'shift')}</div>
            </div>

            <div class="aw-kpi-card">
                <div class="aw-kpi-header">
                    <span>XP Hari Ini</span>
                    <span>⭐</span>
                </div>
                <div class="aw-kpi-value" style="color: #00ff88;">+${state.xpToday}</div>
                <div class="aw-kpi-sub">${formatDiff(xpComparedToYesterday, 'XP')}</div>
            </div>

            <div class="aw-kpi-card">
                <div class="aw-kpi-header">
                    <span>Rata-rata XP</span>
                    <span>⚡</span>
                </div>
                <div class="aw-kpi-value" style="color: #f1f5f9;">${todayAverageXPPerWork}</div>
                <div class="aw-kpi-sub">XP per satu shift</div>
            </div>

            <div class="aw-kpi-card">
                <div class="aw-kpi-header">
                    <span>Total Shift</span>
                    <span>🏆</span>
                </div>
                <div class="aw-kpi-value" style="color: #a855f7;">${state.totalWorked}x</div>
                <div class="aw-kpi-sub">+${state.totalWorkXP} XP total</div>
            </div>
        </div>

        <!-- 7-Day Trend Chart Section -->
        <div class="aw-analytics-section">
            <div class="aw-section-header">
                <div>
                    <div class="aw-section-title">📈 Tren Aktivitas 7 Hari Terakhir</div>
                    <div class="aw-section-subtitle">Visualisasi jumlah shift, XP kerja, dan konsumsi energi</div>
                </div>
                <div style="font-size: 11px; color: #00ff88; font-weight: 600;">Rata-rata ${averageShiftsPerDay} shift/hari</div>
            </div>
            ${graphHTML}
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 8px; font-size: 11.5px; background: rgba(0,0,0,0.25); padding: 10px 14px; border-radius: 8px;">
                <div>
                    <span style="color: #8b9bb4; font-size: 10.5px;">Akumulasi 7 Hari:</span><br>
                    <strong style="color: #00d4ff;">${last7DayTotals.shifts} shift</strong> · <strong style="color: #00ff88;">+${last7DayTotals.xp} XP</strong>
                </div>
                <div>
                    <span style="color: #8b9bb4; font-size: 10.5px;">Rata-rata Harian:</span><br>
                    <strong style="color: #00d4ff;">${averageShiftsPerDay} shift</strong> · <strong style="color: #00ff88;">+${averageXPPerDay} XP</strong>
                </div>
                <div>
                    <span style="color: #8b9bb4; font-size: 10.5px;">Total Energi 7 Hari:</span><br>
                    <strong style="color: #ffb547;">${last7DayTotals.energySpent} ⚡</strong>
                </div>
            </div>
        </div>

        <!-- Lifetime Accumulation Section -->
        <div class="aw-analytics-section">
            <div class="aw-section-header">
                <div>
                    <div class="aw-section-title">🌐 Akumulasi Sepanjang Waktu</div>
                    <div class="aw-section-subtitle">Rekor pencapaian sejak bot pertama kali diaktifkan</div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px;">
                <div style="background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="color: #8b9bb4; font-size: 11px; margin-bottom: 2px;">Total Shift Sukses</div>
                    <div style="font-size: 16px; font-weight: 700; color: #00d4ff;">${state.totalWorked} Shift</div>
                    <div style="color: #64748b; font-size: 10.5px; margin-top: 2px;">Rata-rata: ${avgXPPerWork} XP/shift</div>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="color: #8b9bb4; font-size: 11px; margin-bottom: 2px;">Total XP Dikumpulkan</div>
                    <div style="font-size: 16px; font-weight: 700; color: #00ff88;">+${state.totalWorkXP} XP</div>
                    <div style="color: #64748b; font-size: 10.5px; margin-top: 2px;">Energi terverifikasi: ${state.totalActualEnergySpent} ⚡</div>
                </div>
            </div>
        </div>

        <!-- Backup & Data Recovery Section -->
        <div class="aw-analytics-section" style="margin-bottom: 0;">
            <div class="aw-section-header" style="margin-bottom: 8px;">
                <div>
                    <div class="aw-section-title">💾 Backup & Pemulihan Data</div>
                    <div class="aw-section-subtitle">Simpan atau pulihkan konfigurasi bot & riwayat shift ke file JSON</div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <button id="aw-btn-export-copy" style="
                    background: linear-gradient(135deg, #0088ff, #0055cc); color: #fff; border: none;
                    padding: 9px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;
                    transition: all 0.15s;
                ">📋 Salin JSON</button>
                <button id="aw-btn-export-download" style="
                    background: rgba(0, 255, 136, 0.1); color: #00ff88; border: 1px solid rgba(0, 255, 136, 0.3);
                    padding: 9px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;
                    transition: all 0.15s;
                ">💾 Unduh File Backup</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="aw-btn-toggle-import" style="
                    flex: 1; background: rgba(255, 255, 255, 0.04); border: 1px dashed rgba(255, 255, 255, 0.15);
                    color: #cbd5e1; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 11px;
                    transition: all 0.15s;
                ">📥 Impor / Pulihkan Backup</button>
                <button id="aw-btn-reset-stats" style="
                    background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.25);
                    color: #ff8888; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;
                    transition: all 0.15s;
                ">🗑️ Reset Statistik</button>
            </div>
            <div id="aw-import-section" style="display: none; margin-top: 12px; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                <textarea id="aw-import-input" placeholder="Tempel data backup JSON di sini..." style="
                    width: 100%; height: 75px; background: #131724; color: #00ff88;
                    border: 1px solid #28334e; border-radius: 6px; padding: 8px;
                    font-size: 11px; font-family: monospace; box-sizing: border-box; resize: vertical;
                "></textarea>
                <button id="aw-btn-apply-import" style="
                    background: linear-gradient(135deg, #00ff88, #00aa55); color: #050a14;
                    border: none; padding: 9px; border-radius: 6px; cursor: pointer;
                    font-weight: 700; font-size: 12px; width: 100%; margin-top: 8px;
                ">Terapkan Backup</button>
            </div>
        </div>
    `;

    // Tooltip handlers
    const showFn = function(dayIndex, type, value) {
        const tooltip = document.getElementById('graph-tooltip');
        const dayData = last7Days[dayIndex];
        if (!tooltip || !dayData) return;

        const labelText = type === 'shift' ? 'Shift Kerja' : type === 'xp' ? 'Work XP' : 'Energi digunakan';
        const valueText = type === 'shift' ? `${value}x shift` : type === 'xp' ? `+${value} XP` : `${value} ⚡`;
        const color = type === 'shift' ? '#00d4ff' : type === 'xp' ? '#00ff88' : '#ffb547';

        tooltip.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 4px; color: ${color}; font-size: 12px;">${dayData.dayName}, ${dayData.dateLabel}</div>
            <div style="margin-bottom: 2px;">${labelText}: <span style="color: ${color}; font-weight: 700;">${valueText}</span></div>
            <div style="color: #ffb547; font-size: 10.5px;">Energi aktual: ${dayData.energySpent === null ? 'belum tercatat' : `${dayData.energySpent} ⚡`}${dayData.estimatedEnergySpent ? ` (${dayData.estimatedEnergySpent} ⚡ est)` : ''}</div>
            <div style="color: #64748b; font-size: 10px; margin-top: 2px;">${Math.max(0, dayData.shifts - dayData.energyDataShifts)} shift tanpa data energi</div>
        `;
        tooltip.style.display = 'block';
    };

    const moveFn = function(event) {
        const tooltip = document.getElementById('graph-tooltip');
        if (!tooltip || tooltip.style.display === 'none') return;

        const wrapper = tooltip.parentElement;
        if (!wrapper) return;
        const wrapperRect = wrapper.getBoundingClientRect();

        let left = event.clientX - wrapperRect.left + 12;
        let top = event.clientY - wrapperRect.top - 60;

        const tooltipWidth = tooltip.offsetWidth || 140;
        if (left + tooltipWidth > wrapperRect.width - 4) {
            left = event.clientX - wrapperRect.left - tooltipWidth - 12;
        }
        if (top < 4) top = 4;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    };

    const hideFn = function() {
        const tooltip = document.getElementById('graph-tooltip');
        if (tooltip) tooltip.style.display = 'none';
    };

    content.querySelectorAll('.aw-graph-bar').forEach(bar => {
        const dayIndex = Number(bar.dataset.dayIndex);
        const type = bar.dataset.type;
        const rawVal = bar.dataset.value;
        const value = rawVal === 'null' ? null : Number(rawVal);
        if (type === 'energy' && value === null) return;

        bar.addEventListener('mouseenter', () => showFn(dayIndex, type, value));
        bar.addEventListener('mouseleave', hideFn);
        bar.addEventListener('mousemove', moveFn);
    });

    // Export & Import listeners
    document.getElementById('aw-btn-export-copy')?.addEventListener('click', function() {
        copyExportToClipboard(this, state, CONFIG, workHistory, ctx);
    });
    document.getElementById('aw-btn-export-download')?.addEventListener('click', () => {
        downloadExportFile(state, CONFIG, workHistory, ctx);
    });

    document.getElementById('aw-btn-reset-stats')?.addEventListener('click', () => {
        if (state.workInFlight) {
            alert('Tunggu request kerja yang sedang berjalan selesai sebelum mereset statistik.');
            return;
        }
        if (state.workResultUncertain) {
            alert('Hasil request kerja sebelumnya belum pasti. Periksa statusnya di game dan selesaikan banner timeout sebelum mereset.');
            return;
        }
        if (!confirm('Hapus total shift, XP kerja, energi, dan seluruh history lokal? Pengaturan, token, dan Activity Log tidak dihapus. Tindakan ini tidak dapat dibatalkan.')) return;

        const resetDate = new Date().toDateString();
        state.totalWorked = 0;
        state.totalWorkXP = 0;
        state.workToday = 0;
        state.xpToday = 0;
        state.totalEnergySpent = 0;
        state.totalActualEnergySpent = 0;
        state.totalEstimatedEnergySpent = 0;
        state.lastWorkDate = resetDate;
        state.lastWorkTime = 'Belum pernah';
        state.sessionStartTime = Date.now();
        state.energySyncBase = null;
        state.nextWorkTimestamp = Date.now() + 3000;

        const newHistory = Object.create(null);
        newHistory[resetDate] = {
            shifts: 0,
            xp: 0,
            energySpent: 0,
            estimatedEnergySpent: 0,
            energyDataShifts: 0
        };

        setValue('sessionStartTime', state.sessionStartTime.toString());
        setValue('sessionStartDay', resetDate);
        setValue('aw_workHistory', JSON.stringify(newHistory));
        if (workHistory) {
            Object.keys(workHistory).forEach(k => delete workHistory[k]);
            Object.assign(workHistory, newHistory);
        }

        saveState(state);
        ctx.updatePanel?.();
        updateAnalyticsView(state, CONFIG, workHistory, ctx);
        ctx.log?.('Statistik kerja dan history lokal berhasil direset.', 'success');
        if (state.running && ctx.wakePendingWork) ctx.wakePendingWork();
    });

    const btnToggleImport = document.getElementById('aw-btn-toggle-import');
    const importSection = document.getElementById('aw-import-section');
    if (btnToggleImport && importSection) {
        btnToggleImport.addEventListener('click', () => {
            const isHidden = importSection.style.display === 'none';
            importSection.style.display = isHidden ? 'block' : 'none';
            btnToggleImport.textContent = isHidden
                ? '▲ Tutup Kolom Import'
                : '📥 Punya kode backup? Klik untuk Import / Restore Data';
        });
    }

    const btnApplyImport = document.getElementById('aw-btn-apply-import');
    const importInput = document.getElementById('aw-import-input');
    if (btnApplyImport && importInput) {
        btnApplyImport.addEventListener('click', () => {
            importDataFromJSON(importInput.value, state, CONFIG, workHistory, ctx);
        });
    }
}
