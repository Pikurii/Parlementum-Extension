/**
 * ui/settings.js — Settings modal
 * Modernized with categorized tabs, iOS-style animated switches,
 * preset chips, and dark glassmorphic styling.
 * GM_setValue → setValue, sendNotification/log → ctx, saveConfig from config.js.
 */

import { getValue, setValue } from '../storage.js';
import { normalizeConfig, saveConfig } from '../config.js';
import { getSavedCredentials, saveCredentials, clearCredentials } from '../autologin.js';
import { ICONS } from './icons.js';
import { calculateGoldCost, calculateTotalTrainingSeconds, formatAccumulatedDuration, readTrainingStatsFromDom, readWalletGoldFromDom } from '../training.js';
import { applyPanelMode } from './panel.js';
import { isDashboardPage, readBreadQuotaFromDom } from '../energy.js';

// Inject modern settings stylesheet once
function ensureSettingsStyles() {
    if (document.getElementById('aw-settings-styles')) return;
    const style = document.createElement('style');
    style.id = 'aw-settings-styles';
    style.textContent = `
        /* Modal & Container */
        #aw-settings-modal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #e2e8f0;
        }

        /* Modern Tabs Navigation */
        .aw-tab-nav {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 6px;
            padding: 10px 16px;
            background: rgba(10, 14, 26, 0.85);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            box-sizing: border-box;
        }
        .aw-tab-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 10px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 10px;
            color: #94a3b8;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            box-sizing: border-box;
        }
        .aw-tab-btn:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
        }
        .aw-tab-btn.active {
            color: #38bdf8 !important;
            background: rgba(56, 189, 248, 0.2) !important;
            border-color: rgba(56, 189, 248, 0.45) !important;
            font-weight: 600 !important;
            box-shadow: 0 0 14px rgba(56, 189, 248, 0.25) !important;
        }

        /* Tab Content Animation */
        .aw-tab-pane {
            display: none;
            animation: awTabFade 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .aw-tab-pane.active {
            display: block;
        }
        @keyframes awTabFade {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Setting Cards */
        .aw-card {
            background: rgba(22, 27, 42, 0.55);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 10px;
            padding: 12px 14px;
            margin-bottom: 10px;
            transition: all 0.2s;
        }
        .aw-card:hover {
            border-color: rgba(255, 255, 255, 0.12);
            background: rgba(28, 35, 54, 0.65);
        }
        .aw-card-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
        }
        .aw-card-info {
            flex: 1;
            min-width: 0;
        }
        .aw-card-title {
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
            margin-bottom: 3px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .aw-card-desc {
            font-size: 11px;
            color: #8b9bb4;
            line-height: 1.45;
        }

        /* Modern iOS/Fluent Toggle Switch */
        .aw-switch {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
            flex-shrink: 0;
            margin: 0;
            cursor: pointer;
        }
        .aw-switch input {
            opacity: 0;
            width: 0;
            height: 0;
            position: absolute;
        }
        .aw-switch .aw-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #1e2436;
            border: 1px solid #373f59;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 24px;
        }
        .aw-switch .aw-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 2px;
            bottom: 2px;
            background-color: #94a3b8;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        }
        .aw-switch input:checked + .aw-slider {
            background: linear-gradient(135deg, #00ff88, #00cc66);
            border-color: #00ff88;
            box-shadow: 0 0 12px rgba(0, 255, 136, 0.35);
        }
        .aw-switch input:checked + .aw-slider:before {
            transform: translateX(20px);
            background-color: #ffffff;
        }
        .aw-switch:hover .aw-slider {
            border-color: #505c80;
        }

        /* Range Slider & Inputs */
        .aw-range-slider {
            flex: 1;
            height: 6px;
            border-radius: 3px;
            background: #252c42;
            outline: none;
            accent-color: #00ff88;
            cursor: pointer;
        }
        .aw-num-badge {
            width: 58px;
            background: #141826;
            color: #00ff88;
            border: 1px solid #2e3752;
            border-radius: 6px;
            padding: 5px 6px;
            font-size: 13px;
            font-weight: 700;
            text-align: center;
            transition: border-color 0.2s;
        }
        .aw-num-badge:focus {
            border-color: #00ff88;
            outline: none;
            box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.2);
        }
        .aw-select-box {
            background: #141826;
            color: #00ff88;
            border: 1px solid #2e3752;
            border-radius: 6px;
            padding: 5px 10px;
            font-size: 12px;
            font-weight: 600;
            outline: none;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        .aw-select-box:focus {
            border-color: #00ff88;
        }

        /* Quick Preset Chips */
        .aw-preset-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #94a3b8;
            border-radius: 6px;
            padding: 3px 9px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .aw-preset-btn:hover {
            background: rgba(0, 255, 136, 0.12);
            color: #00ff88;
            border-color: rgba(0, 255, 136, 0.4);
        }

        /* Custom Scrollbar */
        #aw-settings-content::-webkit-scrollbar {
            width: 6px;
        }
        #aw-settings-content::-webkit-scrollbar-track {
            background: transparent;
        }
        #aw-settings-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.14);
            border-radius: 4px;
        }
        #aw-settings-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.28);
        }

        /* Remove Number Spinner Arrows & Button Outlines */
        #aw-settings-modal input[type=number]::-webkit-inner-spin-button,
        #aw-settings-modal input[type=number]::-webkit-outer-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
        }
        #aw-settings-modal input[type=number] {
            -moz-appearance: textfield !important;
        }
        #aw-settings-modal button,
        #aw-settings-modal .aw-tab-btn,
        #aw-settings-modal .aw-switch {
            outline: none !important;
        }

        /* Stat Cards & Dimming System */
        .stat-card,
        .aw-stat-card {
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none;
        }
        .stat-card.active.theme-str,
        .aw-stat-card.active.theme-str {
            border-color: rgba(244, 63, 94, 0.45);
            background: radial-gradient(circle at 50% 0%, rgba(244, 63, 94, 0.12) 0%, transparent 70%), rgba(22, 27, 42, 0.85);
            box-shadow: 0 8px 24px -6px rgba(244, 63, 94, 0.18), inset 0 1px 0 0 rgba(244, 63, 94, 0.25);
        }
        .stat-card.active.theme-edu,
        .aw-stat-card.active.theme-edu {
            border-color: rgba(56, 189, 248, 0.45);
            background: radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.12) 0%, transparent 70%), rgba(22, 27, 42, 0.85);
            box-shadow: 0 8px 24px -6px rgba(56, 189, 248, 0.18), inset 0 1px 0 0 rgba(56, 189, 248, 0.25);
        }
        .stat-card.active.theme-eko,
        .aw-stat-card.active.theme-eko {
            border-color: rgba(16, 185, 129, 0.45);
            background: radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.12) 0%, transparent 70%), rgba(22, 27, 42, 0.85);
            box-shadow: 0 8px 24px -6px rgba(16, 185, 129, 0.18), inset 0 1px 0 0 rgba(16, 185, 129, 0.25);
        }
        .stat-card.dimmed,
        .aw-stat-card.dimmed {
            opacity: 0.42;
            filter: grayscale(65%);
            border-color: rgba(255, 255, 255, 0.06);
            background: rgba(13, 17, 28, 0.65);
            box-shadow: none;
        }
        .stat-card.dimmed:hover,
        .aw-stat-card.dimmed:hover {
            opacity: 0.62;
            filter: grayscale(35%);
            border-color: rgba(255, 255, 255, 0.14);
        }
        .stat-checkbox-box,
        .aw-stat-checkbox-box {
            width: 20px;
            height: 20px;
            border-radius: 6px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            cursor: pointer;
            flex-shrink: 0;
        }
        .stat-checkbox-box.checked-str,
        .aw-stat-checkbox-box.checked-str {
            background: #f43f5e;
            border: 1px solid #fda4af;
            color: #0f172a;
            box-shadow: 0 0 10px rgba(244, 63, 94, 0.5);
        }
        .stat-checkbox-box.checked-edu,
        .aw-stat-checkbox-box.checked-edu {
            background: #38bdf8;
            border: 1px solid #bae6fd;
            color: #0f172a;
            box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
        }
        .stat-checkbox-box.checked-eko,
        .aw-stat-checkbox-box.checked-eko {
            background: #10b981;
            border: 1px solid #a7f3d0;
            color: #0f172a;
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
        }
        .stat-checkbox-box.unchecked,
        .aw-stat-checkbox-box.unchecked {
            background: #0f172a;
            border: 1px solid rgba(255, 255, 255, 0.25);
            color: transparent;
        }
        .stat-target-input {
            width: 62px;
            height: 30px;
            text-align: center;
            font-family: 'JetBrains Mono', monospace;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
            font-size: 13px;
            border-radius: 6px;
            background: rgba(10, 14, 26, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #fff;
            transition: all 0.2s ease;
            box-sizing: border-box;
        }
        .paw-gold-input {
            width: 78px;
            height: 28px;
            text-align: right;
            padding: 2px 8px;
            font-family: 'JetBrains Mono', monospace;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
            font-size: 13px;
            border-radius: 6px;
            background: rgba(10, 14, 26, 0.92);
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            box-sizing: border-box;
        }
        .paw-gold-input:focus {
            outline: none;
            border-color: rgba(245, 158, 11, 0.75);
            box-shadow: 0 0 10px rgba(245, 158, 11, 0.25);
        }
        .paw-well {
            background: rgba(13, 18, 30, 0.72);
            border: 1px solid rgba(255, 255, 255, 0.06);
            box-sizing: border-box;
        }
        .paw-hotkey-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 80px;
            padding: 5px 12px;
            border-radius: 8px;
            background: #0b0f1a;
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #38bdf8;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
            outline: none;
            user-select: none;
            box-sizing: border-box;
        }
        .paw-hotkey-btn:hover {
            border-color: #38bdf8;
            background: rgba(56, 189, 248, 0.12);
            color: #7dd3fc;
        }
        .paw-hotkey-btn.recording {
            border-color: #38bdf8 !important;
            background: rgba(56, 189, 248, 0.25) !important;
            color: #fff !important;
            box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
        }
        .paw-preset-chip {
            padding: 6px 0;
            border-radius: 8px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 600;
            text-align: center;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(30, 41, 59, 0.9);
            color: #cbd5e1;
            box-sizing: border-box;
        }
        .paw-preset-chip:hover {
            background: rgba(51, 65, 85, 0.9);
            color: #fff;
        }
        .paw-preset-chip.active {
            background: rgba(56, 189, 248, 0.25) !important;
            border-color: rgba(56, 189, 248, 0.5) !important;
            color: #38bdf8 !important;
            font-weight: 700 !important;
        }
        .aw-stepper-btn {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #f1f5f9;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
            user-select: none;
        }
        .aw-stepper-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.25);
            color: #fff;
        }
        .aw-stepper-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);
}

export function createSettingsModal(CONFIG, ctx) {
    ensureSettingsStyles();

    const savedCreds = getSavedCredentials();
    const old = document.getElementById('aw-settings-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'aw-settings-modal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100001;
        justify-content: center;
        align-items: center;
    `;

    const shortcutActions = [
        { id: 'showHide',     label: 'Sembunyikan / Tampilkan Panel' },
        { id: 'workNow',      label: 'Eksekusi Kerja Sekarang' },
        { id: 'pauseResume',  label: 'Jeda / Lanjutkan Bot' },
        { id: 'openLog',      label: 'Buka Log Aktivitas' },
        { id: 'openSettings', label: 'Buka Menu Pengaturan' }
    ];

    const shortcutInputsHTML = shortcutActions.map(action => {
        const shortcut = CONFIG.shortcuts[action.id] || { display: '' };
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
                <span style="font-size: 12px; color: #cbd5e1;">${action.label}</span>
                <button type="button" id="record-${action.id}" class="paw-hotkey-btn" data-action="${action.id}">${shortcut.display || 'Klik untuk Set'}</button>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div style="
            background: linear-gradient(180deg, #131724 0%, #0d101a 100%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            width: 95%;
            max-width: 650px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 1px 1px rgba(255,255,255,0.05);
            overflow: hidden;
            box-sizing: border-box;
        ">
            <!-- Modal Header -->
            <div style="
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(15, 23, 42, 0.7);
            ">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="
                        width: 36px; height: 36px; border-radius: 10px;
                        background: rgba(56, 189, 248, 0.15);
                        border: 1px solid rgba(56, 189, 248, 0.35);
                        display: flex; align-items: center; justify-content: center;
                        color: #38bdf8;
                    ">${ICONS.sliders}</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 14px; letter-spacing: 0.6px; text-transform: uppercase;">PENGATURAN AUTO WORKER</div>
                        <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">Konfigurasi Otomasi, Kalkulator Emas &amp; Keamanan Bot</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="padding: 4px 10px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; font-size: 11.5px; font-weight: 600;">Auto-Save Aktif</span>
                    <button id="aw-close-settings" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; font-weight: 600; transition: all 0.15s;
                    ">Tutup</button>
                </div>
            </div>

            <!-- 5-Segmented Category Tabs matching Prototype -->
            <div class="aw-tab-nav">
                <button class="aw-tab-btn active" data-tab="tab-work">${ICONS.zap} <span>Kerja</span></button>
                <button class="aw-tab-btn" data-tab="tab-training">${ICONS.barChart} <span>Stats &amp; Emas</span></button>
                <button class="aw-tab-btn" data-tab="tab-stealth">${ICONS.shield} <span>Stealth</span></button>
                <button class="aw-tab-btn" data-tab="tab-notif">${ICONS.volume} <span>Suara</span></button>
                <button class="aw-tab-btn" data-tab="tab-ui">${ICONS.keyboard} <span>Pintasan</span></button>
            </div>

            <!-- Scrollable Content Body -->
            <div id="aw-settings-content" style="
                padding: 16px 20px;
                overflow-x: hidden;
                overflow-y: auto;
                flex: 1;
                overscroll-behavior: contain;
                box-sizing: border-box;
            ">
                <!-- TAB 1: KERJA & ENERGI (Gambar 3) -->
                <div id="tab-work" class="aw-tab-pane active">
                    <!-- Ambang Batas Energi Kerja -->
                    <div class="aw-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <div>
                                <div class="aw-card-title">Ambang Batas Energi Kerja</div>
                                <div class="aw-card-desc">Bot mengeksekusi kerja saat energi mencapai batas ini</div>
                            </div>
                            <span id="slider-energy-readout" style="padding: 4px 10px; border-radius: 8px; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; font-weight: 700; font-size: 13.5px; font-variant-numeric: tabular-nums;">${CONFIG.energyThreshold} EN</span>
                        </div>
                        <div style="margin: 10px 0 12px 0;">
                            <input type="range" id="setting-energy-threshold" min="10" max="210" step="5" value="${CONFIG.energyThreshold}" class="aw-range-slider" style="width: 100%;">
                        </div>
                        <!-- Preset Chips: 10, 20, 50, 100, Max (210) -->
                        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;">
                            <button type="button" class="paw-preset-chip ${CONFIG.energyThreshold === 10 ? 'active' : ''}" data-val="10">10</button>
                            <button type="button" class="paw-preset-chip ${CONFIG.energyThreshold === 20 ? 'active' : ''}" data-val="20">20</button>
                            <button type="button" class="paw-preset-chip ${CONFIG.energyThreshold === 50 ? 'active' : ''}" data-val="50">50</button>
                            <button type="button" class="paw-preset-chip ${CONFIG.energyThreshold === 100 ? 'active' : ''}" data-val="100">100</button>
                            <button type="button" class="paw-preset-chip ${CONFIG.energyThreshold === 210 ? 'active' : ''}" data-val="210">Max (210)</button>
                        </div>
                    </div>

                    <!-- Kapasitas Kuota Roti Harian -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <div class="aw-card-title">Kapasitas Kuota Roti Harian</div>
                                    <span style="font-size: 10px; font-weight: 700; padding: 1.5px 6px; border-radius: 999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);">AUTO-SYNC</span>
                                </div>
                                <div id="aw-bread-cap-desc" class="aw-card-desc">Terbaca otomatis dari game: ${(CONFIG.maxFoodDaily ?? 10) === 20 ? '20 Slot (Akun Premium)' : '10 Slot (Akun Standar)'}</div>
                            </div>
                            <div id="aw-bread-cap-badge" class="tabular-nums" style="padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; font-family: 'JetBrains Mono', monospace; background: ${(CONFIG.maxFoodDaily ?? 10) === 20 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)'}; color: ${(CONFIG.maxFoodDaily ?? 10) === 20 ? '#fbbf24' : '#38bdf8'}; border: 1px solid ${(CONFIG.maxFoodDaily ?? 10) === 20 ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.35)'}; flex-shrink: 0;">${CONFIG.maxFoodDaily ?? 10} Slot</div>
                        </div>
                    </div>

                    <!-- Pengingat Kuota Roti Sebelum Reset -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Pengingat Kuota Roti Sebelum Reset</div>
                                <div class="aw-card-desc">Tampilkan peringatan jika kuota roti tersisa 30 menit sebelum 00:00 UTC</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-food-reset-reminder" ${CONFIG.foodResetReminderEnabled !== false ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Energy Flush Akhir Hari -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">
                                    <span>Energy Flush Akhir Hari</span>
                                    <span style="padding: 2px 6px; border-radius: 4px; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; font-size: 10.5px; font-weight: 700;">FLUSH</span>
                                </div>
                                <div class="aw-card-desc">Kuras sisa energi otomatis mendekati reset harian server</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-flush" ${CONFIG.energyFlushEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- TAB 2: LATIHAN STATS & KALKULATOR EMAS (Gambar 1 & Reference 2) -->
                <div id="tab-training" class="aw-tab-pane">
                    <!-- Master Toggle Switch -->
                    <div class="paw-card" style="border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; background: rgba(22, 27, 42, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); box-sizing: border-box;">
                        <div class="aw-card-row" style="display: flex; align-items: center; justify-content: space-between;">
                            <div class="aw-card-info" style="display: flex; align-items: center; gap: 12px;">
                                <div style="width: 34px; height: 34px; border-radius: 8px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); display: flex; align-items: center; justify-content: center; color: #818cf8; flex-shrink: 0;">
                                    ${ICONS.barChart}
                                </div>
                                <div>
                                    <div class="aw-card-title" style="display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; color: #fff;">
                                        <span>Auto Latihan Stats</span>
                                        <span id="settings-train-master-badge" style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; ${CONFIG.autoTrainEnabled ? 'background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);' : 'background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1);'}">${CONFIG.autoTrainEnabled ? 'AKTIF' : '• OFF'}</span>
                                    </div>
                                    <div class="aw-card-desc" style="color: #94a3b8; font-size: 12px; margin-top: 2px;">Matikan sakelar untuk menyembunyikan seluruh konfigurasi latihan &amp; kalkulator</div>
                                </div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-auto-train-enabled" ${CONFIG.autoTrainEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Sub-panel Wrapper with Solid Dimmed State -->
                    <div id="aw-training-content-wrapper" style="transition: opacity 0.25s ease, filter 0.25s ease; ${CONFIG.autoTrainEnabled ? '' : 'opacity: 0.35; filter: grayscale(80%); pointer-events: none; user-select: none;'}">
                        <!-- Smart Priority Bar -->
                        <div class="paw-card" style="border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; background: rgba(22, 27, 42, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); box-sizing: border-box;">
                            <!-- STATE 0: 0 STATS CHECKED -->
                            <div id="priority-zero-pill" class="paw-well" style="display:none; border-radius: 10px; padding: 10px 14px; border: 1px solid rgba(245, 158, 11, 0.35); background: rgba(245, 158, 11, 0.1); align-items: center; justify-content: space-between; gap: 10px;">
                                <div style="display:flex; align-items:center; gap: 8px; color: #fbbf24; font-size: 12.5px; font-weight: 600;">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                    <span>Tidak Ada Stat Aktif — Auto Latihan Siaga</span>
                                </div>
                                <button type="button" id="aw-btn-enable-str" style="background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.4); color: #fde68a; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">Aktifkan STR</button>
                            </div>

                            <!-- STATE 1: SINGLE STAT CHECKED -->
                            <div id="priority-single-pill" class="paw-well" style="display:none; border-radius: 10px; padding: 10px 14px; border: 1px solid rgba(244, 63, 94, 0.3); background: rgba(244, 63, 94, 0.08); align-items: center; justify-content: space-between; gap: 10px;">
                                <div style="display:flex; align-items: center; gap: 10px;">
                                    <div id="single-focus-icon-box" style="width: 28px; height: 28px; border-radius: 8px; background: rgba(244, 63, 94, 0.2); border: 1px solid rgba(244, 63, 94, 0.4); display: flex; align-items: center; justify-content: center; color: #fda4af; flex-shrink: 0;">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                                    </div>
                                    <div>
                                        <span id="single-focus-title" style="font-size: 13px; font-weight: 700; color: #fda4af; display: block;">Fokus Tunggal: Kekuatan</span>
                                        <span style="font-size: 11.5px; color: #94a3b8;">Stat lain yang tidak dicentang otomatis dilewati</span>
                                    </div>
                                </div>
                                <span class="tabular-nums" style="padding: 3px 10px; border-radius: 6px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); font-size: 11.5px; font-weight: 600; color: #cbd5e1; white-space: nowrap;">1 Stat Aktif</span>
                            </div>

                            <!-- STATE 2: 2 OR 3 STATS CHECKED -->
                            <div id="priority-multi-dropdown" class="paw-well" style="display:none; border-radius: 10px; padding: 10px 14px; border: 1px solid rgba(56, 189, 248, 0.3); background: rgba(56, 189, 248, 0.06); align-items: center; justify-content: space-between; gap: 12px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" style="flex-shrink: 0;"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                                    <div>
                                        <div style="font-size: 13px; font-weight: 600; color: #fff;">Urutan Prioritas Multi-Stat</div>
                                        <div id="multi-stat-sublabel" style="font-size: 11.5px; color: #94a3b8;">Stat yang dicentang masuk dalam rotasi latihan</div>
                                    </div>
                                </div>
                                <select id="setting-train-priority" class="aw-select-box" style="min-width: 200px; font-size: 12px;">
                                    <!-- Populated dynamically based on checked stats -->
                                </select>
                            </div>
                        </div>

                        <!-- 3 Stat Cards Grid (STR, EDU, EKO) - Spaciously Fitting Without Stepper Buttons -->
                        <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px;">
                            
                            <!-- KEKUATAN (STR) -->
                            <div id="stat-card-str" class="stat-card theme-str ${CONFIG.trainStrengthEnabled !== false ? 'active' : 'dimmed'}">
                                <!-- Top Bar: Icon + STR + Checkbox -->
                                <div id="stat-toggle-header-str" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select:none;">
                                    <div style="display:flex; align-items:center; gap: 7px; min-width: 0;">
                                        <div style="width:24px; height:24px; border-radius:6px; background:rgba(244,63,94,0.18); border:1px solid rgba(244,63,94,0.3); display:flex; align-items:center; justify-content:center; color:#f43f5e; flex-shrink:0;">
                                            ${ICONS.sword}
                                        </div>
                                        <span style="color:#ffffff; font-size: 13px; font-weight: 700; white-space: nowrap;">Kekuatan</span>
                                    </div>
                                    <div style="display:flex; align-items:center; gap: 6px; flex-shrink: 0;">
                                        <input type="checkbox" id="setting-train-str-enabled" ${CONFIG.trainStrengthEnabled !== false ? 'checked' : ''} style="display:none;">
                                        <div id="checkbox-box-str" class="stat-checkbox-box ${CONFIG.trainStrengthEnabled !== false ? 'checked-str' : 'unchecked'}">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                    </div>
                                </div>
                                <!-- Level Saat Ini -->
                                <div style="display:flex; justify-content:space-between; align-items:baseline; font-size: 11.5px; white-space: nowrap;">
                                    <span style="color:#94a3b8; font-weight:500;">Level Saat Ini:</span>
                                    <span style="color:#fff; font-weight:700; font-family: monospace;">Lv. <span id="aw-calc-cur-str">${ctx.state?.trainingStats?.strength || 0}</span></span>
                                </div>
                                <!-- Target Level Clean Input (No Stepper Buttons) -->
                                <div class="paw-well" style="border-radius: 8px; padding: 6px 10px; display:flex; justify-content:space-between; align-items:center; gap: 6px; box-sizing: border-box;">
                                    <span style="color:#cbd5e1; font-size: 11.5px; font-weight:500; white-space: nowrap;">Target Level</span>
                                    <input type="number" id="setting-target-strength" min="1" max="500" value="${CONFIG.targetStrength || 100}" class="stat-target-input" style="color:#f43f5e; border-color: rgba(244, 63, 94, 0.4);" ${CONFIG.trainStrengthEnabled === false ? 'disabled' : ''}>
                                </div>
                                <!-- Footer -->
                                <div style="font-size: 11.5px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); min-height: 26px; display:flex; align-items:center;">
                                    <div id="footer-active-str" style="display:${CONFIG.trainStrengthEnabled !== false ? 'flex' : 'none'}; justify-content:space-between; align-items:center; width:100%; white-space: nowrap;">
                                        <span style="color:#94a3b8;">Biaya:</span>
                                        <span id="cost-str-display" class="tabular-nums" style="font-weight:700; color:#fda4af; font-family: monospace;">-- Emas</span>
                                    </div>
                                    <div id="footer-dimmed-str" style="display:${CONFIG.trainStrengthEnabled === false ? 'flex' : 'none'}; width:100%; justify-content:center; align-items:center;">
                                        <span class="tabular-nums" style="padding: 2px 10px; border-radius: 999px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); font-size: 11px; font-weight: 500; color: #94a3b8; white-space: nowrap;">[ Dilewati ]</span>
                                    </div>
                                </div>
                            </div>

                            <!-- PENDIDIKAN (EDU) -->
                            <div id="stat-card-edu" class="stat-card theme-edu ${CONFIG.trainEducationEnabled !== false ? 'active' : 'dimmed'}">
                                <div id="stat-toggle-header-edu" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select:none;">
                                    <div style="display:flex; align-items:center; gap: 7px; min-width: 0;">
                                        <div style="width:24px; height:24px; border-radius:6px; background:rgba(56,189,248,0.18); border:1px solid rgba(56,189,248,0.3); display:flex; align-items:center; justify-content:center; color:#38bdf8; flex-shrink:0;">
                                            ${ICONS.book}
                                        </div>
                                        <span style="color:#ffffff; font-size: 13px; font-weight: 700; white-space: nowrap;">Pendidikan</span>
                                    </div>
                                    <div style="display:flex; align-items:center; gap: 6px; flex-shrink: 0;">
                                        <input type="checkbox" id="setting-train-edu-enabled" ${CONFIG.trainEducationEnabled !== false ? 'checked' : ''} style="display:none;">
                                        <div id="checkbox-box-edu" class="stat-checkbox-box ${CONFIG.trainEducationEnabled !== false ? 'checked-edu' : 'unchecked'}">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                    </div>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:baseline; font-size: 11.5px; white-space: nowrap;">
                                    <span style="color:#94a3b8; font-weight:500;">Level Saat Ini:</span>
                                    <span style="color:#fff; font-weight:700; font-family: monospace;">Lv. <span id="aw-calc-cur-edu">${ctx.state?.trainingStats?.education || 0}</span></span>
                                </div>
                                <div class="paw-well" style="border-radius: 8px; padding: 6px 10px; display:flex; justify-content:space-between; align-items:center; gap: 6px; box-sizing: border-box;">
                                    <span style="color:#cbd5e1; font-size: 11.5px; font-weight:500; white-space: nowrap;">Target Level</span>
                                    <input type="number" id="setting-target-education" min="1" max="500" value="${CONFIG.targetEducation || 100}" class="stat-target-input" style="color:#38bdf8; border-color: rgba(56, 189, 248, 0.4);" ${CONFIG.trainEducationEnabled === false ? 'disabled' : ''}>
                                </div>
                                <div style="font-size: 11.5px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); min-height: 26px; display:flex; align-items:center;">
                                    <div id="footer-active-edu" style="display:${CONFIG.trainEducationEnabled !== false ? 'flex' : 'none'}; justify-content:space-between; align-items:center; width:100%; white-space: nowrap;">
                                        <span style="color:#94a3b8;">Biaya:</span>
                                        <span id="cost-edu-display" class="tabular-nums" style="font-weight:700; color:#7dd3fc; font-family: monospace;">-- Emas</span>
                                    </div>
                                    <div id="footer-dimmed-edu" style="display:${CONFIG.trainEducationEnabled === false ? 'flex' : 'none'}; width:100%; justify-content:center; align-items:center;">
                                        <span class="tabular-nums" style="padding: 2px 10px; border-radius: 999px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); font-size: 11px; font-weight: 500; color: #94a3b8; white-space: nowrap;">[ Dilewati ]</span>
                                    </div>
                                </div>
                            </div>

                            <!-- EKONOMI (EKO) -->
                            <div id="stat-card-eko" class="stat-card theme-eko ${CONFIG.trainEconomyEnabled !== false ? 'active' : 'dimmed'}">
                                <div id="stat-toggle-header-eko" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select:none;">
                                    <div style="display:flex; align-items:center; gap: 7px; min-width: 0;">
                                        <div style="width:24px; height:24px; border-radius:6px; background:rgba(16,185,129,0.18); border:1px solid rgba(16,185,129,0.3); display:flex; align-items:center; justify-content:center; color:#10b981; flex-shrink:0;">
                                            ${ICONS.trendingUp}
                                        </div>
                                        <span style="color:#ffffff; font-size: 13px; font-weight: 700; white-space: nowrap;">Ekonomi</span>
                                    </div>
                                    <div style="display:flex; align-items:center; gap: 6px; flex-shrink: 0;">
                                        <input type="checkbox" id="setting-train-eko-enabled" ${CONFIG.trainEconomyEnabled !== false ? 'checked' : ''} style="display:none;">
                                        <div id="checkbox-box-eko" class="stat-checkbox-box ${CONFIG.trainEconomyEnabled !== false ? 'checked-eko' : 'unchecked'}">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                    </div>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:baseline; font-size: 11.5px; white-space: nowrap;">
                                    <span style="color:#94a3b8; font-weight:500;">Level Saat Ini:</span>
                                    <span style="color:#fff; font-weight:700; font-family: monospace;">Lv. <span id="aw-calc-cur-eko">${ctx.state?.trainingStats?.economy || 0}</span></span>
                                </div>
                                <div class="paw-well" style="border-radius: 8px; padding: 6px 10px; display:flex; justify-content:space-between; align-items:center; gap: 6px; box-sizing: border-box;">
                                    <span style="color:#cbd5e1; font-size: 11.5px; font-weight:500; white-space: nowrap;">Target Level</span>
                                    <input type="number" id="setting-target-economy" min="1" max="500" value="${CONFIG.targetEconomy || 100}" class="stat-target-input" style="color:#10b981; border-color: rgba(16, 185, 129, 0.4);" ${CONFIG.trainEconomyEnabled === false ? 'disabled' : ''}>
                                </div>
                                <div style="font-size: 11.5px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); min-height: 26px; display:flex; align-items:center;">
                                    <div id="footer-active-eko" style="display:${CONFIG.trainEconomyEnabled !== false ? 'flex' : 'none'}; justify-content:space-between; align-items:center; width:100%; white-space: nowrap;">
                                        <span style="color:#94a3b8;">Biaya:</span>
                                        <span id="cost-eko-display" class="tabular-nums" style="font-weight:700; color:#6ee7b7; font-family: monospace;">-- Emas</span>
                                    </div>
                                    <div id="footer-dimmed-eko" style="display:${CONFIG.trainEconomyEnabled === false ? 'flex' : 'none'}; width:100%; justify-content:center; align-items:center;">
                                        <span class="tabular-nums" style="padding: 2px 10px; border-radius: 999px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); font-size: 11px; font-weight: 500; color: #94a3b8; white-space: nowrap;">[ Dilewati ]</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Real-Time Gold Calculator matching Prototype Surface C -->
                        <div class="paw-card" style="border: 1px solid rgba(245, 158, 11, 0.28); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; background: rgba(22, 27, 42, 0.75); box-sizing: border-box;">
                            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="16" y2="10"></line><line x1="8" y1="14" x2="12" y2="14"></line></svg>
                                    <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #fbbf24;">KALKULATOR BIAYA EMAS REAL-TIME</span>
                                </div>
                                <span style="font-size: 11.5px; color: #94a3b8; font-family: monospace;">Otomatisasi Deret Level</span>
                            </div>

                            <!-- 3 Breakdown Pills -->
                            <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;">
                                <div id="breakdown-pill-str" class="paw-well" style="border-radius: 8px; padding: 7px 10px; border: 1px solid rgba(244, 63, 94, 0.35); background: rgba(244, 63, 94, 0.1); display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; white-space: nowrap;">
                                    <span style="font-weight: 700; color: #fda4af; font-family: monospace;">STR:</span>
                                    <span id="breakdown-val-str" class="tabular-nums" style="font-weight: 600; color: #fff;">-- Emas</span>
                                </div>
                                <div id="breakdown-pill-edu" class="paw-well" style="border-radius: 8px; padding: 7px 10px; border: 1px solid rgba(255, 255, 255, 0.06); opacity: 0.45; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; white-space: nowrap;">
                                    <span style="font-weight: 600; color: #94a3b8; font-family: monospace;">EDU:</span>
                                    <span id="breakdown-val-edu" class="tabular-nums" style="color: #94a3b8;">[ Dilewati ]</span>
                                </div>
                                <div id="breakdown-pill-eko" class="paw-well" style="border-radius: 8px; padding: 7px 10px; border: 1px solid rgba(255, 255, 255, 0.06); opacity: 0.45; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; white-space: nowrap;">
                                    <span style="font-weight: 600; color: #94a3b8; font-family: monospace;">EKO:</span>
                                    <span id="breakdown-val-eko" class="tabular-nums" style="color: #94a3b8;">[ Dilewati ]</span>
                                </div>
                            </div>

                            <!-- 2 Columns: Inputs & Totals -->
                            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
                                <!-- Left Column: Inputs -->
                                <div class="paw-well" style="border-radius: 10px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; justify-content: space-between; gap: 8px; box-sizing: border-box;">
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                        <label for="wallet-gold-input" style="font-size: 11.5px; color: #cbd5e1; font-weight: 500; white-space: nowrap;">Saldo Dompet Emas</label>
                                        <div style="display: flex; align-items: center; gap: 5px;">
                                            <input id="wallet-gold-input" type="number" min="0" value="${ctx.state?.walletGold || 0}" class="paw-gold-input tabular-nums" style="border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24;" />
                                            <span style="font-size: 11px; color: #94a3b8;">Emas</span>
                                        </div>
                                    </div>
                                    <div style="height: 1px; background: rgba(255, 255, 255, 0.06);"></div>
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                        <label for="setting-min-gold-reserve" style="font-size: 11.5px; color: #cbd5e1; font-weight: 500; white-space: nowrap;">Cadangan Minimal</label>
                                        <div style="display: flex; align-items: center; gap: 5px;">
                                            <input id="setting-min-gold-reserve" type="number" min="0" value="${CONFIG.minGoldReserve ?? 50}" class="paw-gold-input tabular-nums" style="border: 1px solid rgba(245, 158, 11, 0.3); color: #fde68a;" />
                                            <span style="font-size: 11px; color: #94a3b8;">Emas</span>
                                        </div>
                                    </div>
                                    <div style="height: 1px; background: rgba(255, 255, 255, 0.06);"></div>
                                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; white-space: nowrap;">
                                        <span style="color: #94a3b8;">Saldo Siap Pakai:</span>
                                        <span id="usable-gold-readout" class="tabular-nums" style="font-weight: 600; color: #fbbf24; font-family: monospace;">0 Emas</span>
                                    </div>
                                </div>

                                <!-- Right Column: Results & Status Badge -->
                                <div class="paw-well" style="border-radius: 10px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; justify-content: space-between; gap: 8px; box-sizing: border-box;">
                                    <div>
                                        <div id="total-gold-label" style="font-size: 11.5px; color: #94a3b8; font-weight: 500;">Total Emas Dibutuhkan (1 Stat)</div>
                                        <div id="total-gold-needed" class="tabular-nums" style="font-size: 18px; font-weight: 700; color: #ffffff; margin-top: 2px;">0 Emas</div>
                                    </div>
                                    <div style="padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.06); display: flex; flex-direction: column; gap: 4px;">
                                        <span style="font-size: 11.5px; color: #94a3b8;">Status Kelayakan Keuangan:</span>
                                        <span id="finance-status-badge" class="tabular-nums" style="width: fit-content; padding: 3px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 700; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399;">AMAN • Sisa +0 Emas</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: STEALTH & JADWAL (Gambar 4) -->
                <div id="tab-stealth" class="aw-tab-pane">
                    <!-- Istirahat Santai Acak (Micro-Breaks) -->
                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">
                                    <span>Istirahat Santai Acak (Micro-Breaks)</span>
                                    <span style="padding: 2px 7px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; font-size: 11px; font-weight: 600; font-family: monospace;">ANTI-DETEKSI</span>
                                </div>
                                <div class="aw-card-desc">Simulasikan perilaku manusia yang sesekali beristirahat santai 8–15 menit secara acak di sela-sela kerja</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-micro-breaks" ${CONFIG.microBreaksEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                            <div class="paw-well" style="border-radius: 8px; padding: 8px 10px;">
                                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Frekuensi (Tiap X Jam)</label>
                                <input type="number" id="setting-micro-break-freq" min="1" max="12" value="${CONFIG.microBreakFrequencyHours || 4}" style="width: 100%; box-sizing: border-box; background: #0b0f1a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: monospace; color: #fff; outline: none;">
                            </div>
                            <div class="paw-well" style="border-radius: 8px; padding: 8px 10px;">
                                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Durasi Istirahat (Menit)</label>
                                <input type="number" id="setting-micro-break-dur" min="3" max="30" value="${CONFIG.microBreakDurationMinutes || 10}" style="width: 100%; box-sizing: border-box; background: #0b0f1a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: monospace; color: #fff; outline: none;">
                            </div>
                        </div>
                    </div>

                    <!-- Variasi Ambang Energi Dinamis -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">
                                    <span>Variasi Ambang Energi Dinamis</span>
                                    <span style="padding: 2px 7px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; font-size: 11px; font-weight: 600; font-family: monospace;">±3 EN</span>
                                </div>
                                <div class="aw-card-desc">Sedikit memvariasikan ambang eksekusi shift (misal 87–93 EN) agar grafik konsumsi energi server tidak kaku</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-threshold-jitter" ${CONFIG.energyThresholdJitterEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Acak Jitter Ambang Energi -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">
                                    <span>Jitter Waktu Eksekusi Acak</span>
                                    <span style="padding: 2px 7px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; font-size: 11px; font-weight: 600; font-family: monospace;">±25s</span>
                                </div>
                                <div class="aw-card-desc">Variasikan detik eksekusi kerja (jeda acak 5-25 detik) saat energi telah siap</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-stealth-jitter" ${CONFIG.stealthJitterEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Jadwal Istirahat Malam (Sleep Mode) -->
                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Jadwal Istirahat Malam (Sleep Mode)</div>
                                <div class="aw-card-desc">Hentikan aktivitas bot otomatis pada jam tidur yang ditentukan</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sleep-schedule" ${CONFIG.sleepScheduleEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                            <div class="paw-well" style="border-radius: 8px; padding: 8px 10px;">
                                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Jam Mulai Istirahat</label>
                                <input type="time" id="setting-sleep-start-time" value="${CONFIG.sleepStartTime || (CONFIG.sleepStartHour !== undefined ? String(CONFIG.sleepStartHour).padStart(2, '0') + ':00' : '23:30')}" style="width: 100%; box-sizing: border-box; background: #0b0f1a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: monospace; color: #fff; outline: none;">
                            </div>
                            <div class="paw-well" style="border-radius: 8px; padding: 8px 10px;">
                                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Jam Bangun Aktif</label>
                                <input type="time" id="setting-sleep-end-time" value="${CONFIG.sleepEndTime || (CONFIG.sleepEndHour !== undefined ? String(CONFIG.sleepEndHour).padStart(2, '0') + ':00' : '05:45')}" style="width: 100%; box-sizing: border-box; background: #0b0f1a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: monospace; color: #fff; outline: none;">
                            </div>
                        </div>
                    </div>

                    <!-- Peredam Log Energi Rendah -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Peredam Log Energi Rendah</div>
                                <div class="aw-card-desc">Sembunyikan baris log rutin saat energi masih di bawah target kerja</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-quiet-mode" ${CONFIG.quietModeEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- TAB 4: NOTIFIKASI & SUARA -->
                <div id="tab-notif" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Notifikasi Desktop Browser</div>
                                <div class="aw-card-desc">Kirim banner notifikasi OS saat kerja atau latihan selesai</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-notifications" ${CONFIG.sendNotification ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Alert Energi Penuh (Full Cap)</div>
                                <div class="aw-card-desc">Peringatan visual saat energi mencapai batas maksimum 210/210</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-alert" ${CONFIG.energyFullAlertEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Efek Audio Eksekusi Kerja</div>
                                <div class="aw-card-desc">Bunyikan nada lembut saat bot berhasil mengeksekusi kerja</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sound-notification-enabled" ${CONFIG.soundNotificationEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Alarm Suara Energi Penuh</div>
                                <div class="aw-card-desc">Bunyikan synthesizer alarm jika bot dijeda dan energi penuh</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-sound-enabled" ${CONFIG.energyFullAlertSoundEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span class="aw-card-title" style="margin-bottom: 0;">Volume Master Efek Suara</span>
                            <span id="volume-readout" style="color: #38bdf8; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums;">${Math.round(CONFIG.soundNotificationVolume * 100)}%</span>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="range" id="setting-sound-notification-volume" min="0" max="100" value="${Math.round(CONFIG.soundNotificationVolume * 100)}" class="aw-range-slider" style="flex: 1;">
                            <button type="button" id="aw-test-notification-sound" class="btn-cyber" style="
                                background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);
                                padding: 6px 14px; border-radius: 8px; font-size: 11.5px; font-weight: 600; cursor: pointer;
                                display: flex; align-items: center; gap: 6px; flex-shrink: 0;
                            ">
                                ${ICONS.volume}
                                <span>Test Sound</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- TAB 5: TAMPILAN & PINTASAN KEYBOARD (Gambar 5) -->
                <div id="tab-ui" class="aw-tab-pane">
                    <!-- Panel Hanya di Halaman Dashboard -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Panel Hanya di Halaman Dashboard</div>
                                <div class="aw-card-desc">Sembunyikan floating panel saat membuka halaman pasar atau profil</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-dashboard-only" ${CONFIG.panelDashboardOnly ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Eksekusi Multi-Tab Leader-Only -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Eksekusi Multi-Tab Leader-Only</div>
                                <div class="aw-card-desc">Cegah bentrok request saat membuka banyak tab Parlementum sekaligus</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-leader-only" ${CONFIG.panelLeaderOnly ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Koordinat Floating Panel -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Koordinat Floating Panel</div>
                                <div class="aw-card-desc">Kembalikan panel ke sudut kanan atas layar monitor</div>
                            </div>
                            <button type="button" id="aw-reset-position" class="btn-cyber" style="
                                background: rgba(30, 41, 59, 0.9); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.15);
                                padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0;
                            ">Reset Posisi Panel</button>
                        </div>
                    </div>

                    <!-- Pintasan Keyboard (Klik untuk Ubah) -->
                    <div class="aw-card" style="padding: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 6px;">
                            <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #e2e8f0;">PINTASAN KEYBOARD (KLIK UNTUK UBAH)</span>
                            <span style="font-size: 11.5px; color: #38bdf8; font-weight: 500;">Global Hotkeys</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${shortcutInputsHTML}
                        </div>
                    </div>

                    <!-- SUB-SECTION: AKUN & SISTEM -->
                    <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                        <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                            <span style="color: #38bdf8; display: flex; align-items: center;">${ICONS.settings}</span>
                            <span>Pengaturan Sistem &amp; Akun</span>
                        </div>
                        <div style="font-size: 11.5px; color: #94a3b8; margin-bottom: 12px;">
                            Optimasi memori browser, circuit breaker anti-deteksi, auto-login, dan pemulihan data pabrik.
                        </div>
                    </div>
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Mode Eco (Hemat RAM & CPU)</div>
                                <div class="aw-card-desc">Menghentikan render visual DOM saat tab ditinggal di latar belakang dan men-cache pembacaan wilayah. Timer dan giliran kerja tetap berjalan 100% presisi tanpa tertunda.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-eco-mode" ${CONFIG.ecoModeEnabled !== false ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Auto-Refresh Tab Higienis (Pembersih Memori)</div>
                                <div class="aw-card-desc">Memuat ulang tab secara higienis setelah berjalan 12+ jam saat energi kosong (&lt; 20 EN) dan countdown masih lama (&gt; 20 menit), mencegah tab browser crash karena memory leak game.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-auto-reload-tab" ${CONFIG.autoReloadTabEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Circuit Breaker Keamanan (Anti-Spam)</div>
                                <div class="aw-card-desc">Otomatis mengunci worker jika server game masuk mode pemeliharaan (502/503) atau memunculkan pemeriksaan Cloudflare / Captcha.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-circuit-breaker" ${CONFIG.circuitBreakerEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 10px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Masuk Otomatis (Auto Re-Login)</div>
                                <div class="aw-card-desc">Jika sesi/token game habis (HTTP 401), bot akan otomatis login kembali ke akun Anda dan melanjutkan kerja. Data disimpan aman 100% lokal di browser.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-auto-relogin" ${CONFIG.autoReloginEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>

                        <div id="aw-autologin-fields" style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-top: 8px;">
                            <div style="margin-bottom: 10px;">
                                <label style="display: block; font-size: 11px; color: #94a3b8; margin-bottom: 4px; font-weight: 500;">Email Akun Game</label>
                                <input type="email" id="setting-login-email" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="nama@email.com" value="${savedCreds?.email || ''}" style="width: 100%; box-sizing: border-box; background: #131724; color: #fff; border: 1px solid #2d364f; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
                            </div>
                            <div style="margin-bottom: 12px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                    <label style="font-size: 11px; color: #94a3b8; font-weight: 500;">Kata Sandi</label>
                                    <span id="aw-toggle-pwd-vis" style="font-size: 11px; color: #00d4ff; cursor: pointer; user-select: none;">Lihat</span>
                                </div>
                                <input type="password" id="setting-login-pwd" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="Kata sandi akunmu" value="${savedCreds?.password || ''}" style="width: 100%; box-sizing: border-box; background: #131724; color: #fff; border: 1px solid #2d364f; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button id="aw-save-login-creds" style="flex: 1; background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;">Simpan Kredensial</button>
                                <button id="aw-clear-login-creds" style="background: rgba(255,255,255,0.05); color: #ff5555; border: 1px solid rgba(255,85,85,0.3); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 500;">Hapus</button>
                            </div>
                            <div id="aw-login-creds-msg" style="font-size: 11px; margin-top: 8px; display: none;"></div>
                        </div>
                    </div>

                    <div class="aw-card" style="margin-top: 14px; border-color: rgba(255, 85, 85, 0.2);">
                        <div class="aw-card-title" style="color: #ff6b6b; margin-bottom: 6px;">Zona Bahaya (Reset Total)</div>
                        <div class="aw-card-desc" style="margin-bottom: 12px;">
                            Mengembalikan seluruh preferensi, batas energi, pintasan keyboard, dan posisi panel ke pengaturan awal pabrik.
                        </div>
                        <button id="aw-restore-defaults" style="
                            background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(204, 0, 0, 0.3));
                            color: #ff8888; border: 1px solid rgba(255, 107, 107, 0.4); padding: 9px;
                            border-radius: 6px; cursor: pointer; font-weight: 600;
                            font-size: 12px; width: 100%; transition: all 0.15s;
                        ">Pulihkan Semua Pengaturan ke Default</button>
                    </div>
                </div>
            </div>

            <!-- Sticky Modal Footer -->
            <div id="aw-settings-footer" style="
                padding: 12px 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                gap: 12px;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, #131724 0%, #0d101a 100%);
            ">
                <div id="aw-settings-status" style="font-size: 12px; color: #00ff88; font-weight: 600; display: none;"></div>
                <div style="display: flex; gap: 8px; margin-left: auto;">
                    <button id="aw-cancel-settings" style="
                        background: transparent; color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.15);
                        padding: 8px 16px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; font-weight: 600; transition: all 0.15s;
                    ">Batal</button>
                    <button id="aw-save-settings" style="
                        background: linear-gradient(135deg, #00ff88, #00cc66);
                        color: #050a14; border: none; padding: 9px 24px;
                        border-radius: 8px; cursor: pointer; font-weight: 700;
                        font-size: 13px; box-shadow: 0 4px 14px rgba(0,255,136,0.3);
                        transition: transform 0.15s, box-shadow 0.15s;
                    ">Simpan Pengaturan</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // ── Tab Switching Logic ──────────────────────────────────────────────────
    const tabNav = modal.querySelector('.aw-tab-nav');
    const tabBtns = modal.querySelectorAll('.aw-tab-btn');
    const tabPanes = modal.querySelectorAll('.aw-tab-pane');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            const targetPane = modal.querySelector(`#${targetId}`);
            if (targetPane) targetPane.classList.add('active');
        });
    });

    // Dukungan scroll horizontal menggunakan mouse wheel di bar tab
    tabNav?.addEventListener('wheel', e => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            tabNav.scrollLeft += e.deltaY;
        }
    }, { passive: false });

    // ── Universal Settings Collector & Saver ────────────────────────────────
    let statusTimer = null;
    function applyAndSaveSettings(explicit = false) {
        // 1. Batas Energi (10 - 210 EN)
        const sliderEl = document.getElementById('setting-energy-threshold');
        const sVal = parseInt(sliderEl?.value ?? '', 10);
        if (!isNaN(sVal) && sVal >= 10 && sVal <= 210) {
            CONFIG.energyThreshold = sVal;
            const readout = document.getElementById('slider-energy-readout');
            if (readout) readout.textContent = `${sVal} EN`;
        }

        // 2. Quiet Mode
        const quietEl = document.getElementById('setting-quiet-mode');
        if (quietEl) CONFIG.quietModeEnabled = quietEl.checked;

        // 3. Tampilan Panel
        const dashOnlyEl = document.getElementById('setting-panel-dashboard-only');
        if (dashOnlyEl) CONFIG.panelDashboardOnly = dashOnlyEl.checked;
        const leaderOnlyEl = document.getElementById('setting-panel-leader-only');
        if (leaderOnlyEl) CONFIG.panelLeaderOnly = leaderOnlyEl.checked;
        const followEl = document.getElementById('setting-follow-viewport');
        if (followEl) CONFIG.panelFollowViewport = followEl.checked;
        const returnEl = document.getElementById('setting-return-original');
        if (returnEl) CONFIG.panelReturnToOriginal = returnEl.checked;

        // 4. Suara Notifikasi & Volume
        const soundEnabledEl = document.getElementById('setting-sound-notification-enabled');
        if (soundEnabledEl) CONFIG.soundNotificationEnabled = soundEnabledEl.checked;

        const soundVolEl = document.getElementById('setting-sound-notification-volume');
        if (soundVolEl) {
            const vol = Math.max(0, Math.min(100, parseInt(soundVolEl.value || '30', 10)));
            CONFIG.soundNotificationVolume = vol / 100;
            const volReadout = document.getElementById('volume-readout');
            if (volReadout) volReadout.textContent = `${vol}%`;
        }

        const fullSoundEl = document.getElementById('setting-energy-full-sound-enabled');
        if (fullSoundEl) CONFIG.energyFullAlertSoundEnabled = fullSoundEl.checked;

        // 5. Browser Notifikasi
        const notifEl = document.getElementById('setting-notifications');
        if (notifEl) CONFIG.sendNotification = notifEl.checked;

        const fullAlertEl = document.getElementById('setting-energy-full-alert');
        if (fullAlertEl) CONFIG.energyFullAlertEnabled = fullAlertEl.checked;

        // 6. Stealth & Jam Tidur Malam
        const stealthEl = document.getElementById('setting-stealth-jitter');
        if (stealthEl) CONFIG.stealthJitterEnabled = stealthEl.checked;

        const energyFlushEl = document.getElementById('setting-energy-flush');
        if (energyFlushEl) CONFIG.energyFlushEnabled = energyFlushEl.checked;

        const foodReminderEl = document.getElementById('setting-food-reset-reminder');
        if (foodReminderEl) CONFIG.foodResetReminderEnabled = foodReminderEl.checked;

        const autoReloadTabEl = document.getElementById('setting-auto-reload-tab');
        if (autoReloadTabEl) CONFIG.autoReloadTabEnabled = autoReloadTabEl.checked;

        const circuitBreakerEl = document.getElementById('setting-circuit-breaker');
        if (circuitBreakerEl) CONFIG.circuitBreakerEnabled = circuitBreakerEl.checked;

        const sleepEl = document.getElementById('setting-sleep-schedule');
        if (sleepEl) CONFIG.sleepScheduleEnabled = sleepEl.checked;

        const sleepStartInp = document.getElementById('setting-sleep-start-time');
        if (sleepStartInp && sleepStartInp.value) {
            CONFIG.sleepStartTime = sleepStartInp.value;
            const parts = sleepStartInp.value.split(':');
            if (parts[0]) CONFIG.sleepStartHour = parseInt(parts[0], 10);
        }

        const sleepEndInp = document.getElementById('setting-sleep-end-time');
        if (sleepEndInp && sleepEndInp.value) {
            CONFIG.sleepEndTime = sleepEndInp.value;
            const parts = sleepEndInp.value.split(':');
            if (parts[0]) CONFIG.sleepEndHour = parseInt(parts[0], 10);
        }

        // Micro-Breaks & Threshold Jitter
        const microBreaksEl = document.getElementById('setting-micro-breaks');
        if (microBreaksEl) CONFIG.microBreaksEnabled = microBreaksEl.checked;

        const microFreqEl = document.getElementById('setting-micro-break-freq');
        if (microFreqEl) CONFIG.microBreakFrequencyHours = Math.max(1, Math.min(12, parseInt(microFreqEl.value, 10) || 4));

        const microDurEl = document.getElementById('setting-micro-break-dur');
        if (microDurEl) CONFIG.microBreakDurationMinutes = Math.max(3, Math.min(45, parseInt(microDurEl.value, 10) || 10));

        const thresholdJitterEl = document.getElementById('setting-threshold-jitter');
        if (thresholdJitterEl) CONFIG.energyThresholdJitterEnabled = thresholdJitterEl.checked;

        // 7. Auto Re-Login & Eco Mode
        const autoReloginEl = document.getElementById('setting-auto-relogin');
        if (autoReloginEl) CONFIG.autoReloginEnabled = autoReloginEl.checked;

        const ecoEl = document.getElementById('setting-eco-mode');
        if (ecoEl) CONFIG.ecoModeEnabled = ecoEl.checked;

        // 8. Auto Latihan Stats
        const autoTrainEl = document.getElementById('setting-auto-train-enabled');
        if (autoTrainEl) CONFIG.autoTrainEnabled = autoTrainEl.checked;

        const trainStrEl = document.getElementById('setting-train-str-enabled');
        if (trainStrEl) CONFIG.trainStrengthEnabled = trainStrEl.checked;

        const trainEduEl = document.getElementById('setting-train-edu-enabled');
        if (trainEduEl) CONFIG.trainEducationEnabled = trainEduEl.checked;

        const trainEkoEl = document.getElementById('setting-train-eko-enabled');
        if (trainEkoEl) CONFIG.trainEconomyEnabled = trainEkoEl.checked;

        const trainPriorityEl = document.getElementById('setting-train-priority');
        if (trainPriorityEl && trainPriorityEl.value) CONFIG.trainPriority = trainPriorityEl.value;

        const targetStrEl = document.getElementById('setting-target-strength');
        if (targetStrEl) CONFIG.targetStrength = Math.max(1, Math.min(500, parseInt(targetStrEl.value, 10) || 100));

        const targetEduEl = document.getElementById('setting-target-education');
        if (targetEduEl) CONFIG.targetEducation = Math.max(1, Math.min(500, parseInt(targetEduEl.value, 10) || 100));

        const targetEkoEl = document.getElementById('setting-target-economy');
        if (targetEkoEl) CONFIG.targetEconomy = Math.max(1, Math.min(500, parseInt(targetEkoEl.value, 10) || 100));

        const minGoldEl = document.getElementById('setting-min-gold-reserve');
        if (minGoldEl) CONFIG.minGoldReserve = Math.max(0, parseInt(minGoldEl.value, 10) || 0);

        // Simpan ke chrome.storage.local
        saveConfig(CONFIG);
        ctx.updatePanelVisibility?.(CONFIG);
        ctx.updatePanel?.();

        const statusEl = document.getElementById('aw-settings-status');
        if (statusEl) {
            if (statusTimer) clearTimeout(statusTimer);
            if (explicit) {
                statusEl.textContent = `Tersimpan! Batas energi: ${CONFIG.energyThreshold} EN`;
                statusEl.style.color = '#00ff88';
                statusEl.style.display = 'block';
            } else {
                statusEl.textContent = `Disimpan otomatis (Batas: ${CONFIG.energyThreshold} EN)`;
                statusEl.style.color = '#00e99a';
                statusEl.style.display = 'block';
                statusTimer = setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 2500);
            }
        }
    }

    // ── Energy Threshold Slider & Preset Chips ──────────────────────────────
    const thresholdSlider = document.getElementById('setting-energy-threshold');
    const energyReadout   = document.getElementById('slider-energy-readout');

    function syncPresetChips(val) {
        modal.querySelectorAll('.paw-preset-chip').forEach(chip => {
            const cVal = parseInt(chip.dataset.val, 10);
            chip.classList.toggle('active', cVal === val);
        });
    }

    if (thresholdSlider) {
        thresholdSlider.addEventListener('input', e => {
            const val = parseInt(e.target.value, 10);
            if (energyReadout) energyReadout.textContent = `${val} EN`;
            syncPresetChips(val);
            applyAndSaveSettings(false);
        });
    }

    modal.querySelectorAll('.paw-preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const val = parseInt(chip.dataset.val, 10);
            if (!isNaN(val)) {
                if (thresholdSlider) thresholdSlider.value = val;
                if (energyReadout) energyReadout.textContent = `${val} EN`;
                syncPresetChips(val);
                applyAndSaveSettings(false);
            }
        });
    });



    // ── Volume Slider & Readout ─────────────────────────────────────────────
    const soundVolSlider = document.getElementById('setting-sound-notification-volume');
    const volumeReadout  = document.getElementById('volume-readout');
    if (soundVolSlider) {
        soundVolSlider.addEventListener('input', e => {
            const vol = parseInt(e.target.value, 10) || 0;
            if (volumeReadout) volumeReadout.textContent = `${vol}%`;
            CONFIG.soundNotificationVolume = vol / 100;
            applyAndSaveSettings(false);
        });
    }

    // ── Auto-save on All Switches, Inputs & Selects ──────────────────────────
    [
        'setting-food-reset-reminder',
        'setting-energy-flush',
        'setting-micro-breaks',
        'setting-micro-break-freq',
        'setting-micro-break-dur',
        'setting-threshold-jitter',
        'setting-stealth-jitter',
        'setting-sleep-schedule',
        'setting-sleep-start-time',
        'setting-sleep-end-time',
        'setting-quiet-mode',
        'setting-notifications',
        'setting-energy-full-alert',
        'setting-sound-notification-enabled',
        'setting-energy-full-sound-enabled',
        'setting-panel-dashboard-only',
        'setting-panel-leader-only',
        'setting-eco-mode',
        'setting-auto-reload-tab',
        'setting-circuit-breaker',
        'setting-auto-relogin'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => applyAndSaveSettings(false));
    });

    // ── Live Training UI & Cost Calculator ───────────────────────────────────
    function updateTrainingUIAndCalculator() {
        const autoTrainCb = document.getElementById('setting-auto-train-enabled');
        const isAutoTrainOn = autoTrainCb ? autoTrainCb.checked : Boolean(CONFIG.autoTrainEnabled);

        const masterBadge = document.getElementById('settings-train-master-badge');
        if (masterBadge) {
            masterBadge.textContent = isAutoTrainOn ? 'AKTIF' : 'NONAKTIF';
            masterBadge.style.background = isAutoTrainOn ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 255, 255, 0.05)';
            masterBadge.style.color = isAutoTrainOn ? '#34d399' : '#94a3b8';
            masterBadge.style.borderColor = isAutoTrainOn ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.1)';
        }

        const offBanner = document.getElementById('settings-train-off-banner');
        if (offBanner) {
            offBanner.style.display = isAutoTrainOn ? 'none' : 'flex';
        }

        const contentWrapper = document.getElementById('aw-training-content-wrapper');
        if (contentWrapper) {
            contentWrapper.style.display = 'block';
            contentWrapper.style.opacity = isAutoTrainOn ? '1' : '0.35';
            contentWrapper.style.filter = isAutoTrainOn ? 'none' : 'grayscale(80%)';
            contentWrapper.style.pointerEvents = isAutoTrainOn ? 'auto' : 'none';
            contentWrapper.style.userSelect = isAutoTrainOn ? 'auto' : 'none';
        }

        const strCb = document.getElementById('setting-train-str-enabled');
        const eduCb = document.getElementById('setting-train-edu-enabled');
        const ekoCb = document.getElementById('setting-train-eko-enabled');

        const strActive = strCb ? strCb.checked : (CONFIG.trainStrengthEnabled !== false);
        const eduActive = eduCb ? eduCb.checked : (CONFIG.trainEducationEnabled !== false);
        const ekoActive = ekoCb ? ekoCb.checked : (CONFIG.trainEconomyEnabled !== false);

        const activeKeys = [];
        if (strActive) activeKeys.push('strength');
        if (eduActive) activeKeys.push('education');
        if (ekoActive) activeKeys.push('economy');

        const statsMeta = {
            strength:  { key: 'str', name: 'Kekuatan',  code: 'STR', color: '#f43f5e', lightColor: '#fda4af', activeClass: 'checked-str' },
            education: { key: 'edu', name: 'Pendidikan', code: 'EDU', color: '#38bdf8', lightColor: '#7dd3fc', activeClass: 'checked-edu' },
            economy:   { key: 'eko', name: 'Ekonomi',    code: 'EKO', color: '#10b981', lightColor: '#6ee7b7', activeClass: 'checked-eko' }
        };

        const activeStateMap = { strength: strActive, education: eduActive, economy: ekoActive };

        for (const [st, meta] of Object.entries(statsMeta)) {
            const isAct = activeStateMap[st];
            const card = document.getElementById(`stat-card-${meta.key}`);
            if (card) {
                card.className = `aw-stat-card theme-${meta.key} ${isAct ? 'active' : 'dimmed'}`;
            }
            const label = document.getElementById(`check-label-${meta.key}`);
            if (label) {
                label.textContent = isAct ? 'Aktif' : 'Off';
                label.style.color = isAct ? meta.lightColor : '#64748b';
            }
            const box = document.getElementById(`checkbox-box-${meta.key}`);
            if (box) {
                box.className = `aw-stat-checkbox-box ${isAct ? meta.activeClass : 'unchecked'}`;
            }
            const stepDown = document.getElementById(`setting-step-down-${meta.key}`);
            if (stepDown) stepDown.disabled = !isAct;
            const stepUp = document.getElementById(`setting-step-up-${meta.key}`);
            if (stepUp) stepUp.disabled = !isAct;
            const targetInp = document.getElementById(`setting-target-${st}`);
            if (targetInp) targetInp.disabled = !isAct;

            const footerAct = document.getElementById(`footer-active-${meta.key}`);
            const footerDim = document.getElementById(`footer-dimmed-${meta.key}`);
            if (footerAct && footerDim) {
                footerAct.style.display = isAct ? 'flex' : 'none';
                footerDim.style.display = isAct ? 'none' : 'flex';
            }
        }

        // Update Smart Priority View
        const zeroPill = document.getElementById('priority-zero-pill');
        const singlePill = document.getElementById('priority-single-pill');
        const multiDropdown = document.getElementById('priority-multi-dropdown');

        if (activeKeys.length === 0) {
            if (zeroPill) zeroPill.style.display = 'flex';
            if (singlePill) singlePill.style.display = 'none';
            if (multiDropdown) multiDropdown.style.display = 'none';
        } else if (activeKeys.length === 1) {
            if (zeroPill) zeroPill.style.display = 'none';
            if (singlePill) singlePill.style.display = 'flex';
            if (multiDropdown) multiDropdown.style.display = 'none';

            const singleMeta = statsMeta[activeKeys[0]];
            const singleTitle = document.getElementById('single-focus-title');
            if (singleTitle) {
                singleTitle.textContent = `Fokus Tunggal: ${singleMeta.name} (${singleMeta.code})`;
                singleTitle.style.color = singleMeta.lightColor;
            }
            const singleBox = document.getElementById('single-focus-icon-box');
            if (singleBox) {
                singleBox.style.color = singleMeta.lightColor;
                singleBox.style.borderColor = singleMeta.color;
                singleBox.style.background = `${singleMeta.color}33`;
            }
        } else {
            if (zeroPill) zeroPill.style.display = 'none';
            if (singlePill) singlePill.style.display = 'none';
            if (multiDropdown) multiDropdown.style.display = 'flex';

            const sublabel = document.getElementById('multi-stat-sublabel');
            if (sublabel) {
                const names = activeKeys.map(k => statsMeta[k].code).join(' + ');
                sublabel.textContent = `${activeKeys.length} stat dicentang (${names}) untuk rotasi latihan`;
            }

            // Dynamically populate priority dropdown with ONLY active stats
            const prioritySel = document.getElementById('setting-train-priority');
            if (prioritySel) {
                const curSelected = prioritySel.value || CONFIG.trainPriority || 'education';
                const opts = [{ value: 'balanced', text: 'Seimbang (Rotasi Terendah)' }];
                if (strActive) opts.push({ value: 'strength', text: 'Kekuatan Dulu (Damage Perang)' });
                if (eduActive) opts.push({ value: 'education', text: 'Pendidikan Dulu (Diskon Waktu)' });
                if (ekoActive) opts.push({ value: 'economy', text: 'Ekonomi Dulu (Hasil Produksi)' });

                prioritySel.innerHTML = opts.map(o =>
                    `<option value="${o.value}" ${o.value === curSelected ? 'selected' : ''}>${o.text}</option>`
                ).join('');

                const validVals = opts.map(o => o.value);
                if (!validVals.includes(prioritySel.value)) {
                    prioritySel.value = opts[0].value;
                    CONFIG.trainPriority = opts[0].value;
                }
            }
        }

        // Live Cost & Duration Calculation
        const curStr = ctx.state?.trainingStats?.strength || 0;
        const curEdu = ctx.state?.trainingStats?.education || 0;
        const curEko = ctx.state?.trainingStats?.economy || 0;
        const walletInp = document.getElementById('wallet-gold-input');
        const walletGold = walletInp ? (parseInt(walletInp.value, 10) || 0) : (ctx.state?.walletGold || 0);
        const minReserveInp = document.getElementById('setting-min-gold-reserve');
        const minReserve = minReserveInp ? (parseInt(minReserveInp.value, 10) || 0) : (CONFIG.minGoldReserve ?? 50);
        const usableGold = Math.max(0, walletGold - minReserve);

        const usableGoldReadout = document.getElementById('usable-gold-readout');
        if (usableGoldReadout) usableGoldReadout.textContent = `${usableGold.toLocaleString('id-ID')} Emas`;

        const targetStr = parseInt(document.getElementById('setting-target-strength')?.value, 10) || curStr;
        const targetEdu = parseInt(document.getElementById('setting-target-education')?.value, 10) || curEdu;
        const targetEko = parseInt(document.getElementById('setting-target-economy')?.value, 10) || curEko;

        const deltaStr = Math.max(0, targetStr - curStr);
        const deltaEdu = Math.max(0, targetEdu - curEdu);
        const deltaEko = Math.max(0, targetEko - curEko);

        const deltaStrEl = document.getElementById('delta-str-badge');
        if (deltaStrEl) deltaStrEl.textContent = strActive ? `+${deltaStr} Lv` : 'Terkunci';
        const deltaEduEl = document.getElementById('delta-edu-badge');
        if (deltaEduEl) deltaEduEl.textContent = eduActive ? `+${deltaEdu} Lv` : 'Terkunci';
        const deltaEkoEl = document.getElementById('delta-eko-badge');
        if (deltaEkoEl) deltaEkoEl.textContent = ekoActive ? `+${deltaEko} Lv` : 'Terkunci';

        const costStr = strActive ? calculateGoldCost(curStr, targetStr) : 0;
        const costEdu = eduActive ? calculateGoldCost(curEdu, targetEdu) : 0;
        const costEko = ekoActive ? calculateGoldCost(curEko, targetEko) : 0;
        const totalCost = costStr + costEdu + costEko;

        const durStrSec = strActive ? calculateTotalTrainingSeconds(curStr, targetStr, curEdu, false) : 0;
        const durEduSec = eduActive ? calculateTotalTrainingSeconds(curEdu, targetEdu, curEdu, true) : 0;
        const durEkoSec = ekoActive ? calculateTotalTrainingSeconds(curEko, targetEko, curEdu, false) : 0;
        const totalDurationSec = durStrSec + durEduSec + durEkoSec;

        // 1. Update Cost on Stat Cards (Surface C)
        const costStrDisplay = document.getElementById('cost-str-display');
        if (costStrDisplay) costStrDisplay.textContent = `${costStr.toLocaleString('id-ID')} Emas`;
        const costEduDisplay = document.getElementById('cost-edu-display');
        if (costEduDisplay) costEduDisplay.textContent = `${costEdu.toLocaleString('id-ID')} Emas`;
        const costEkoDisplay = document.getElementById('cost-eko-display');
        if (costEkoDisplay) costEkoDisplay.textContent = `${costEko.toLocaleString('id-ID')} Emas`;

        // 2. Update Breakdown Pills in Real-Time Gold Calculator
        const breakdownData = [
            { key: 'str', active: strActive, cost: costStr, color: 'rgba(244, 63, 94, 0.35)', bg: 'rgba(244, 63, 94, 0.1)' },
            { key: 'edu', active: eduActive, cost: costEdu, color: 'rgba(56, 189, 248, 0.35)', bg: 'rgba(56, 189, 248, 0.1)' },
            { key: 'eko', active: ekoActive, cost: costEko, color: 'rgba(16, 185, 129, 0.35)', bg: 'rgba(16, 185, 129, 0.1)' }
        ];

        breakdownData.forEach(item => {
            const pill = document.getElementById(`breakdown-pill-${item.key}`);
            const val = document.getElementById(`breakdown-val-${item.key}`);
            if (pill) {
                pill.style.opacity = item.active ? '1' : '0.45';
                pill.style.borderColor = item.active ? item.color : 'rgba(255, 255, 255, 0.06)';
                pill.style.background = item.active ? item.bg : 'rgba(15, 23, 42, 0.6)';
            }
            if (val) {
                if (item.active) {
                    val.textContent = `${item.cost.toLocaleString('id-ID')} Emas`;
                    val.style.color = '#ffffff';
                    val.style.fontWeight = '600';
                } else {
                    val.textContent = '[ Dilewati ]';
                    val.style.color = '#94a3b8';
                    val.style.fontWeight = '500';
                }
            }
        });

        // 3. Update Total Needed & Labels
        const totalLabel = document.getElementById('total-gold-label');
        if (totalLabel) totalLabel.textContent = `Total Emas Dibutuhkan (${activeKeys.length} Stat)`;

        const totalNeededEl = document.getElementById('total-gold-needed');
        if (totalNeededEl) totalNeededEl.textContent = `${totalCost.toLocaleString('id-ID')} Emas`;

        // Fallbacks for older element IDs if present
        const elCostStr = document.getElementById('aw-calc-cost-str');
        if (elCostStr) elCostStr.textContent = `${costStr.toLocaleString('id-ID')} Emas`;
        const elTimeStr = document.getElementById('aw-calc-time-str');
        if (elTimeStr) elTimeStr.textContent = formatAccumulatedDuration(durStrSec);

        const elCostEdu = document.getElementById('aw-calc-cost-edu');
        if (elCostEdu) elCostEdu.textContent = `${costEdu.toLocaleString('id-ID')} Emas`;
        const elTimeEdu = document.getElementById('aw-calc-time-edu');
        if (elTimeEdu) elTimeEdu.textContent = formatAccumulatedDuration(durEduSec);

        const elCostEko = document.getElementById('aw-calc-cost-eko');
        if (elCostEko) elCostEko.textContent = `${costEko.toLocaleString('id-ID')} Emas`;
        const elTimeEko = document.getElementById('aw-calc-time-eko');
        if (elTimeEko) elTimeEko.textContent = formatAccumulatedDuration(durEkoSec);

        const pillCostStr = document.getElementById('aw-calc-cost-str-pill');
        if (pillCostStr) pillCostStr.textContent = strActive ? `${costStr.toLocaleString('id-ID')} Emas` : 'Dilewati (0)';
        const pillCostEdu = document.getElementById('aw-calc-cost-edu-pill');
        if (pillCostEdu) pillCostEdu.textContent = eduActive ? `${costEdu.toLocaleString('id-ID')} Emas` : 'Dilewati (0)';
        const pillCostEko = document.getElementById('aw-calc-cost-eko-pill');
        if (pillCostEko) pillCostEko.textContent = ekoActive ? `${costEko.toLocaleString('id-ID')} Emas` : 'Dilewati (0)';

        const elTotalCost = document.getElementById('aw-calc-total-cost');
        if (elTotalCost) elTotalCost.textContent = `${totalCost.toLocaleString('id-ID')} Emas`;

        const elTotalTime = document.getElementById('aw-calc-total-time');
        if (elTotalTime) elTotalTime.textContent = activeKeys.length > 0 ? formatAccumulatedDuration(totalDurationSec) : '0 dtk';

        // 4. Financial Viability Status
        const statusBadge = document.getElementById('finance-status-badge');
        if (statusBadge) {
            if (activeKeys.length === 0) {
                statusBadge.textContent = 'SIAGA • 0 Stat Dipilih';
                statusBadge.style.color = '#94a3b8';
                statusBadge.style.background = 'rgba(255, 255, 255, 0.06)';
                statusBadge.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            } else if (usableGold >= totalCost) {
                const sisa = usableGold - totalCost;
                statusBadge.textContent = `AMAN • Sisa +${sisa.toLocaleString('id-ID')} Emas`;
                statusBadge.style.color = '#34d399';
                statusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
                statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
            } else {
                const kurang = totalCost - usableGold;
                statusBadge.textContent = `KURANG ${kurang.toLocaleString('id-ID')} EMAS`;
                statusBadge.style.color = '#fbbf24';
                statusBadge.style.background = 'rgba(245, 158, 11, 0.15)';
                statusBadge.style.borderColor = 'rgba(245, 158, 11, 0.35)';
            }
        }

        const elStatus = document.getElementById('aw-calc-gold-status');
        if (elStatus) {
            if (activeKeys.length === 0) {
                elStatus.textContent = 'SIAGA • 0 Stat Dipilih';
                elStatus.style.color = '#94a3b8';
                elStatus.style.background = 'rgba(255,255,255,0.06)';
                elStatus.style.borderColor = 'rgba(255,255,255,0.1)';
            } else if (walletGold <= 0) {
                elStatus.textContent = 'Memuat Dompet Emas...';
                elStatus.style.color = '#94a3b8';
                elStatus.style.background = 'rgba(255,255,255,0.06)';
                elStatus.style.borderColor = 'rgba(255,255,255,0.1)';
            } else if (usableGold < totalCost) {
                const diff = totalCost - usableGold;
                elStatus.textContent = `KURANG ${diff.toLocaleString('id-ID')} EMAS • Melatih Bertahap`;
                elStatus.style.color = '#f59e0b';
                elStatus.style.background = 'rgba(245,158,11,0.15)';
                elStatus.style.borderColor = 'rgba(245,158,11,0.35)';
            } else {
                const remaining = usableGold - totalCost;
                elStatus.textContent = `AMAN • Sisa +${remaining.toLocaleString('id-ID')} Emas`;
                elStatus.style.color = '#00ff88';
                elStatus.style.background = 'rgba(0,255,136,0.15)';
                elStatus.style.borderColor = 'rgba(0,255,136,0.3)';
            }
        }
    }

    // Toggle and Stepper button wiring for Latihan Stats
    document.getElementById('setting-auto-train-enabled')?.addEventListener('change', () => {
        updateTrainingUIAndCalculator();
        applyAndSaveSettings(false);
    });

    document.getElementById('setting-train-priority')?.addEventListener('change', () => {
        applyAndSaveSettings(false);
    });

    ['str', 'edu', 'eko'].forEach(k => {
        const fullStat = k === 'str' ? 'strength' : (k === 'edu' ? 'education' : 'economy');
        const inp = document.getElementById(`setting-target-${fullStat}`);
        const minLv = ctx.state?.trainingStats?.[fullStat] || 1;

        document.getElementById(`setting-step-down-${k}`)?.addEventListener('click', () => {
            if (!inp || inp.disabled) return;
            const curVal = parseInt(inp.value, 10) || minLv;
            inp.value = Math.max(minLv, curVal - 1);
            updateTrainingUIAndCalculator();
            applyAndSaveSettings(false);
        });

        document.getElementById(`setting-step-up-${k}`)?.addEventListener('click', () => {
            if (!inp || inp.disabled) return;
            const curVal = parseInt(inp.value, 10) || minLv;
            inp.value = Math.min(500, curVal + 1);
            updateTrainingUIAndCalculator();
            applyAndSaveSettings(false);
        });

        // Header click toggles the stat checkbox
        document.getElementById(`stat-toggle-header-${k}`)?.addEventListener('click', () => {
            const cb = document.getElementById(`setting-train-${k}-enabled`);
            if (cb) {
                cb.checked = !cb.checked;
                updateTrainingUIAndCalculator();
                applyAndSaveSettings(false);
            }
        });
    });

    document.getElementById('aw-btn-enable-str')?.addEventListener('click', () => {
        const cb = document.getElementById('setting-train-str-enabled');
        if (cb) {
            cb.checked = true;
            updateTrainingUIAndCalculator();
            applyAndSaveSettings(false);
        }
    });

    ['setting-target-strength', 'setting-target-education', 'setting-target-economy', 'setting-min-gold-reserve', 'wallet-gold-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                updateTrainingUIAndCalculator();
                if (id !== 'wallet-gold-input') {
                    applyAndSaveSettings(false);
                }
            });
            el.addEventListener('change', () => {
                updateTrainingUIAndCalculator();
                if (id !== 'wallet-gold-input') {
                    applyAndSaveSettings(false);
                }
            });
        }
    });

    updateTrainingUIAndCalculator();

    // ── Auto Re-Login Credentials Management ────────────────────────────────
    const pwdInput = document.getElementById('setting-login-pwd');
    const togglePwdBtn = document.getElementById('aw-toggle-pwd-vis');
    togglePwdBtn?.addEventListener('click', () => {
        if (!pwdInput) return;
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            togglePwdBtn.textContent = 'Sembunyikan';
        } else {
            pwdInput.type = 'password';
            togglePwdBtn.textContent = 'Lihat';
        }
    });

    const saveCredsBtn = document.getElementById('aw-save-login-creds');
    const clearCredsBtn = document.getElementById('aw-clear-login-creds');
    const credsMsg = document.getElementById('aw-login-creds-msg');
    const emailInp = document.getElementById('setting-login-email');

    saveCredsBtn?.addEventListener('click', () => {
        const email = emailInp?.value.trim() || '';
        const pwd = pwdInput?.value || '';
        if (!email || !pwd) {
            if (credsMsg) {
                credsMsg.textContent = 'Harap isi email dan kata sandi!';
                credsMsg.style.color = '#ff6b6b';
                credsMsg.style.display = 'block';
            }
            return;
        }
        saveCredentials(email, pwd);
        CONFIG.autoReloginEnabled = true;
        const chk = document.getElementById('setting-auto-relogin');
        if (chk) chk.checked = true;
        saveConfig(CONFIG);
        if (credsMsg) {
            credsMsg.textContent = `Kredensial untuk ${email} tersimpan! Auto Re-Login AKTIF.`;
            credsMsg.style.color = '#00ff88';
            credsMsg.style.display = 'block';
        }
        ctx.log?.('Kredensial Auto Re-Login berhasil disimpan.', 'success');
    });

    clearCredsBtn?.addEventListener('click', () => {
        clearCredentials();
        if (emailInp) emailInp.value = '';
        if (pwdInput) pwdInput.value = '';
        CONFIG.autoReloginEnabled = false;
        const chk = document.getElementById('setting-auto-relogin');
        if (chk) chk.checked = false;
        saveConfig(CONFIG);
        if (credsMsg) {
            credsMsg.textContent = 'Kredensial telah dihapus dari browser.';
            credsMsg.style.color = '#ffaa00';
            credsMsg.style.display = 'block';
        }
        ctx.log?.('Kredensial Auto Re-Login dihapus.', 'info');
    });

    // ── Keyboard shortcut recording ─────────────────────────────────────────
    let activeRecordingAction = null;
    shortcutActions.forEach(action => {
        const btn = document.getElementById(`record-${action.id}`);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activeRecordingAction && activeRecordingAction !== action.id) {
                    const prevBtn = document.getElementById(`record-${activeRecordingAction}`);
                    if (prevBtn) {
                        prevBtn.classList.remove('recording');
                        prevBtn.textContent = CONFIG.shortcuts[activeRecordingAction]?.display || 'Klik untuk Set';
                    }
                }
                activeRecordingAction = action.id;
                btn.classList.add('recording');
                btn.textContent = 'Tekan tombol...';
            });
        }
    });

    const recordHandler = e => {
        if (e.type !== 'keydown' || !activeRecordingAction) return;
        e.preventDefault();
        e.stopPropagation();

        const actionId = activeRecordingAction;
        const btn = document.getElementById(`record-${actionId}`);

        if (e.key === 'Escape') {
            activeRecordingAction = null;
            if (btn) {
                btn.classList.remove('recording');
                btn.textContent = CONFIG.shortcuts[actionId]?.display || 'Klik untuk Set';
            }
            return;
        }

        const keys = [];
        const displayParts = [];

        if (e.ctrlKey) { keys.push('Control'); displayParts.push('Ctrl'); }
        if (e.altKey)  { keys.push('Alt');     displayParts.push('Alt'); }
        if (e.shiftKey){ keys.push('Shift');   displayParts.push('Shift'); }

        const code = e.code;
        const key = e.key;

        // Skip standalone modifiers
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
            if (btn) btn.textContent = displayParts.length > 0 ? displayParts.join(' + ') + ' + ...' : 'Tekan tombol...';
            return;
        }

        if (code.startsWith('Key')) {
            keys.push(code);
            displayParts.push(code.replace('Key', ''));
        } else if (code.startsWith('Digit')) {
            keys.push(code);
            displayParts.push(code.replace('Digit', ''));
        } else if (code === 'Space') {
            keys.push('Space');
            displayParts.push('Space');
        } else {
            keys.push(code);
            displayParts.push(key.toUpperCase());
        }

        const display = displayParts.join(' + ');

        if (keys.length > 0) {
            CONFIG.shortcuts[actionId] = { keys, display };
            if (btn) {
                btn.classList.remove('recording');
                btn.textContent = display;
            }
            activeRecordingAction = null;
            applyAndSaveSettings(false);
            ctx.log?.(`Pintasan [${actionId}] diubah menjadi ${display}`, 'info');
        }
    };

    // ── Modal open/close ────────────────────────────────────────────────────
    function handleEscapeKey(e) {
        if (e.key === 'Escape' && modal.style.display === 'flex') closeModal(true);
    }
    function closeModal(saveOnClose = true) {
        if (activeRecordingAction) {
            const recBtn = document.getElementById(`record-${activeRecordingAction}`);
            if (recBtn) {
                recBtn.classList.remove('recording');
                recBtn.textContent = CONFIG.shortcuts[activeRecordingAction]?.display || 'Klik untuk Set';
            }
            activeRecordingAction = null;
        }
        if (saveOnClose) applyAndSaveSettings(false);
        modal.style.display = 'none';
        if (ctx.state) ctx.state.settingsOpen = false;
        document.removeEventListener('keydown', recordHandler, true);
        document.removeEventListener('keydown', handleEscapeKey);
    }
    modal.closeModalSafely = closeModal;
    modal.recordHandler    = recordHandler;
    modal.handleEscapeKey  = handleEscapeKey;
    modal.updateTrainingCalculator = updateTrainingUIAndCalculator;

    document.getElementById('aw-close-settings')?.addEventListener('click', () => closeModal(true));
    document.getElementById('aw-cancel-settings')?.addEventListener('click', () => {
        // Batal: reset input tampilan dari CONFIG dan tutup tanpa menyimpan
        openSettings(CONFIG, ctx);
        closeModal(false);
    });
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(true); });
    document.addEventListener('keydown', handleEscapeKey);

    // ── Button handlers ─────────────────────────────────────────────────────
    document.getElementById('aw-test-notification-sound')?.addEventListener('click', () => {
        const volVal = parseInt(document.getElementById('setting-sound-notification-volume')?.value ?? '70', 10);
        const testVol = isNaN(volVal) ? 0.7 : Math.max(0, Math.min(100, volVal)) / 100;
        ctx.sendNotification?.('Parlamentum Auto Worker', 'Tes notifikasi suara berhasil.');
        ctx.playNotificationSound?.({ soundNotificationEnabled: true, soundNotificationVolume: testVol }, 'success');
    });

    document.getElementById('aw-reset-position')?.addEventListener('click', () => {
        if (!ctx.state) return;
        ctx.state.panelX = CONFIG.panelDefaultX ?? 10;
        ctx.state.panelY = CONFIG.panelDefaultY ?? 10;
        ctx.state.panelVisible = true;
        ctx.state.userManuallyToggledPanel = false;
        setValue('panelX', ctx.state.panelX.toString());
        setValue('panelY', ctx.state.panelY.toString());
        setValue('panelVisible', 'true');

        const panel = document.getElementById('aw-panel');
        if (panel) {
            panel.style.left = ctx.state.panelX + 'px';
            panel.style.top = ctx.state.panelY + 'px';
            panel.style.display = 'block';
        }
        applyPanelMode(ctx.state, false);
        ctx.updatePanel?.();
        ctx.log?.('Posisi dan visibilitas panel berhasil di-reset ke default (Mode Penuh)!', 'success');

        const statusEl = document.getElementById('aw-settings-status');
        if (statusEl) {
            statusEl.textContent = 'Panel in-game berhasil dimunculkan kembali ke posisi awal!';
            statusEl.style.color = '#38bdf8';
            statusEl.style.display = 'block';
            setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
        }
        const modeText = document.getElementById('aw-settings-mode-text');
        const modeIcon = document.getElementById('aw-settings-mode-icon');
        if (modeText) modeText.textContent = 'Penuh';
        if (modeIcon) modeIcon.innerHTML = ICONS.minimize;
    });

    document.getElementById('aw-btn-force-show-panel')?.addEventListener('click', () => {
        if (!ctx.state) return;
        ctx.state.panelVisible = true;
        ctx.state.userManuallyToggledPanel = false;
        setValue('panelVisible', 'true');
        const panel = document.getElementById('aw-panel');
        if (panel) panel.style.display = 'block';
        applyPanelMode(ctx.state, false);
        ctx.updatePanel?.();
        ctx.log?.('Panel in-game berhasil dimunculkan kembali!', 'success');

        const statusEl = document.getElementById('aw-settings-status');
        if (statusEl) {
            statusEl.textContent = 'Panel in-game berhasil ditampilkan di layar!';
            statusEl.style.color = '#10b981';
            statusEl.style.display = 'block';
            setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 2500);
        }
        const modeText = document.getElementById('aw-settings-mode-text');
        const modeIcon = document.getElementById('aw-settings-mode-icon');
        if (modeText) modeText.textContent = 'Penuh';
        if (modeIcon) modeIcon.innerHTML = ICONS.minimize;
    });

    document.getElementById('aw-btn-toggle-pill')?.addEventListener('click', () => {
        if (!ctx.state) return;
        const newMin = !ctx.state.panelMinimized;
        applyPanelMode(ctx.state, newMin);
        ctx.updatePanel?.();
        const modeText = document.getElementById('aw-settings-mode-text');
        const modeIcon = document.getElementById('aw-settings-mode-icon');
        if (modeText) modeText.textContent = newMin ? 'Pill (Kapsul)' : 'Penuh';
        if (modeIcon) modeIcon.innerHTML = newMin ? ICONS.expand : ICONS.minimize;
    });

    document.getElementById('aw-restore-defaults')?.addEventListener('click', () => {
        if (!confirm('Yakin ingin mengembalikan SEMUA pengaturan ke default?\n\nIni akan:\n- Reset keyboard shortcuts\n- Reset batas energi ke 10 EN\n- Reset semua preferensi\n- Reset posisi panel\n\nKonfigurasi yang tersimpan akan dihapus.')) return;
        setValue('aw_config', null);
        setValue('panelX', (CONFIG.panelDefaultX ?? 20).toString());
        setValue('panelY', (CONFIG.panelDefaultY ?? 20).toString());
        ctx.log?.('Semua pengaturan berhasil di-reset ke default! Refresh halaman untuk menerapkan.', 'success');
        setTimeout(() => {
            if (confirm('Pengaturan sudah di-reset. Refresh halaman sekarang?')) location.reload();
        }, 500);
    });

    document.getElementById('aw-save-settings')?.addEventListener('click', () => {
        applyAndSaveSettings(true);

        if (CONFIG.sendNotification && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }

        const hideBtn = document.getElementById('aw-hide');
        if (hideBtn) hideBtn.title = `Hide (${CONFIG.shortcuts.showHide?.display ?? ''})`;

        ctx.log?.(`Pengaturan disimpan! Batas energi sebelum kerja: ${CONFIG.energyThreshold} EN`, 'success');
        ctx.playNotificationSound?.('success');
        setTimeout(() => closeModal(false), 700);
    });
}

export function openSettings(CONFIG, ctx) {
    const modal = document.getElementById('aw-settings-modal');
    if (!modal) return;

    if (ctx?.state) {
        if (isDashboardPage()) {
            readTrainingStatsFromDom(ctx.state);
            readBreadQuotaFromDom(ctx.state, CONFIG);
        }
        readWalletGoldFromDom(ctx.state);
    }

    // Sinkronkan seluruh input DOM dari CONFIG aktif
    const thresholdSlider = document.getElementById('setting-energy-threshold');
    if (thresholdSlider) thresholdSlider.value = CONFIG.energyThreshold;
    const energyReadout = document.getElementById('slider-energy-readout');
    if (energyReadout) energyReadout.textContent = `${CONFIG.energyThreshold} EN`;
    modal.querySelectorAll('.paw-preset-chip').forEach(chip => {
        const cVal = parseInt(chip.dataset.val, 10);
        chip.classList.toggle('active', cVal === CONFIG.energyThreshold);
    });

    // Sinkronkan Kapasitas Roti Badge
    const curCap = CONFIG.maxFoodDaily ?? 10;
    const descEl = document.getElementById('aw-bread-cap-desc');
    if (descEl) {
        descEl.textContent = `Terbaca otomatis dari game: ${curCap} Slot (${curCap === 20 ? 'Akun Premium' : 'Akun Standar'})`;
    }
    const badgeEl = document.getElementById('aw-bread-cap-badge');
    if (badgeEl) {
        badgeEl.textContent = `${curCap} Slot`;
        badgeEl.style.background = curCap === 20 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)';
        badgeEl.style.color = curCap === 20 ? '#fbbf24' : '#38bdf8';
        badgeEl.style.borderColor = curCap === 20 ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.35)';
    }

    // Sinkronkan Training Settings & Live Display
    const curStrEl = document.getElementById('aw-calc-cur-str');
    if (curStrEl) curStrEl.textContent = String(ctx?.state?.trainingStats?.strength || 0);

    const curEduEl = document.getElementById('aw-calc-cur-edu');
    if (curEduEl) curEduEl.textContent = String(ctx?.state?.trainingStats?.education || 0);

    const curEkoEl = document.getElementById('aw-calc-cur-eko');
    if (curEkoEl) curEkoEl.textContent = String(ctx?.state?.trainingStats?.economy || 0);

    const walletGoldEl = document.getElementById('aw-calc-wallet-gold');
    if (walletGoldEl) {
        const goldVal = (ctx?.state?.walletGold || 0).toLocaleString('id-ID');
        walletGoldEl.innerHTML = `<span style="color:#fbbf24;display:flex;align-items:center;">${ICONS.wallet}</span> Dompet: <b style="color:#fbbf24;font-family:ui-monospace,monospace;">${goldVal} Emas</b>`;
    }

    const walletGoldInp = document.getElementById('wallet-gold-input');
    if (walletGoldInp) {
        walletGoldInp.value = String(ctx?.state?.walletGold || 0);
    }

    const autoTrainCb = document.getElementById('setting-auto-train-enabled');
    if (autoTrainCb) autoTrainCb.checked = Boolean(CONFIG.autoTrainEnabled);

    const trainStrCb = document.getElementById('setting-train-str-enabled');
    if (trainStrCb) trainStrCb.checked = CONFIG.trainStrengthEnabled !== false;

    const trainEduCb = document.getElementById('setting-train-edu-enabled');
    if (trainEduCb) trainEduCb.checked = CONFIG.trainEducationEnabled !== false;

    const trainEkoCb = document.getElementById('setting-train-eko-enabled');
    if (trainEkoCb) trainEkoCb.checked = CONFIG.trainEconomyEnabled !== false;

    const trainPrioritySel = document.getElementById('setting-train-priority');
    if (trainPrioritySel) trainPrioritySel.value = CONFIG.trainPriority || 'education';

    const targetStrInp = document.getElementById('setting-target-strength');
    if (targetStrInp) targetStrInp.value = String(CONFIG.targetStrength || 100);

    const targetEduInp = document.getElementById('setting-target-education');
    if (targetEduInp) targetEduInp.value = String(CONFIG.targetEducation || 100);

    const targetEkoInp = document.getElementById('setting-target-economy');
    if (targetEkoInp) targetEkoInp.value = String(CONFIG.targetEconomy || 100);

    const minReserveInp = document.getElementById('setting-min-gold-reserve');
    if (minReserveInp) minReserveInp.value = String(CONFIG.minGoldReserve ?? 50);

    modal.updateTrainingCalculator?.();

    const quietCb = document.getElementById('setting-quiet-mode');
    if (quietCb) quietCb.checked = Boolean(CONFIG.quietModeEnabled);

    const dashCb = document.getElementById('setting-panel-dashboard-only');
    if (dashCb) dashCb.checked = Boolean(CONFIG.panelDashboardOnly);

    const leaderCb = document.getElementById('setting-panel-leader-only');
    if (leaderCb) leaderCb.checked = Boolean(CONFIG.panelLeaderOnly);

    const followCb = document.getElementById('setting-follow-viewport');
    if (followCb) followCb.checked = Boolean(CONFIG.panelFollowViewport);

    const returnCb = document.getElementById('setting-return-original');
    if (returnCb) returnCb.checked = Boolean(CONFIG.panelReturnToOriginal);

    const soundCb = document.getElementById('setting-sound-notification-enabled');
    if (soundCb) soundCb.checked = Boolean(CONFIG.soundNotificationEnabled);

    const soundVolSlider = document.getElementById('setting-sound-notification-volume');
    if (soundVolSlider) soundVolSlider.value = Math.round(CONFIG.soundNotificationVolume * 100);
    const volumeReadout = document.getElementById('volume-readout');
    if (volumeReadout) volumeReadout.textContent = `${Math.round(CONFIG.soundNotificationVolume * 100)}%`;

    const fullSoundCb = document.getElementById('setting-energy-full-sound-enabled');
    if (fullSoundCb) fullSoundCb.checked = Boolean(CONFIG.energyFullAlertSoundEnabled);

    const notifCb = document.getElementById('setting-notifications');
    if (notifCb) notifCb.checked = Boolean(CONFIG.sendNotification);

    const fullAlertCb = document.getElementById('setting-energy-full-alert');
    if (fullAlertCb) fullAlertCb.checked = Boolean(CONFIG.energyFullAlertEnabled);

    const stealthCb = document.getElementById('setting-stealth-jitter');
    if (stealthCb) stealthCb.checked = Boolean(CONFIG.stealthJitterEnabled);

    const energyFlushCb = document.getElementById('setting-energy-flush');
    if (energyFlushCb) energyFlushCb.checked = Boolean(CONFIG.energyFlushEnabled);

    const foodReminderCb = document.getElementById('setting-food-reset-reminder');
    if (foodReminderCb) foodReminderCb.checked = Boolean(CONFIG.foodResetReminderEnabled !== false);

    const autoReloadTabCb = document.getElementById('setting-auto-reload-tab');
    if (autoReloadTabCb) autoReloadTabCb.checked = Boolean(CONFIG.autoReloadTabEnabled);

    const circuitBreakerCb = document.getElementById('setting-circuit-breaker');
    if (circuitBreakerCb) circuitBreakerCb.checked = Boolean(CONFIG.circuitBreakerEnabled);

    const sleepCb = document.getElementById('setting-sleep-schedule');
    if (sleepCb) sleepCb.checked = Boolean(CONFIG.sleepScheduleEnabled);

    const sleepStartInp = document.getElementById('setting-sleep-start-time');
    if (sleepStartInp) {
        sleepStartInp.value = CONFIG.sleepStartTime || (CONFIG.sleepStartHour !== undefined ? String(CONFIG.sleepStartHour).padStart(2, '0') + ':00' : '23:30');
    }

    const sleepEndInp = document.getElementById('setting-sleep-end-time');
    if (sleepEndInp) {
        sleepEndInp.value = CONFIG.sleepEndTime || (CONFIG.sleepEndHour !== undefined ? String(CONFIG.sleepEndHour).padStart(2, '0') + ':00' : '05:45');
    }

    // Sinkronkan Hotkey Buttons
    ['showHide', 'workNow', 'pauseResume', 'openLog', 'openSettings'].forEach(actionId => {
        const btn = document.getElementById(`record-${actionId}`);
        if (btn && CONFIG.shortcuts[actionId]) {
            btn.textContent = CONFIG.shortcuts[actionId].display || 'Klik untuk Set';
            btn.classList.remove('recording');
        }
    });

    const statusEl = document.getElementById('aw-settings-status');
    if (statusEl) statusEl.style.display = 'none';

    modal.style.display = 'flex';
    if (ctx?.state) ctx.state.settingsOpen = true;

    // Pastikan tab aktif otomatis ter-scroll ke tengah bila berada di layar sempit
    const activeTab = modal.querySelector('.aw-tab-btn.active');
    if (activeTab) {
        setTimeout(() => activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 60);
    }
    if (modal.recordHandler) {
        document.removeEventListener('keydown', modal.recordHandler, true);
        document.addEventListener('keydown', modal.recordHandler, true);
    }
    if (modal.handleEscapeKey) {
        document.removeEventListener('keydown', modal.handleEscapeKey);
        document.addEventListener('keydown', modal.handleEscapeKey);
    }
}
