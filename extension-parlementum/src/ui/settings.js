/**
 * ui/settings.js — Settings modal
 * Modernized with categorized tabs, iOS-style animated switches,
 * preset chips, and dark glassmorphic styling.
 * GM_setValue → setValue, sendNotification/log → ctx, saveConfig from config.js.
 */

import { getValue, setValue } from '../storage.js';
import { normalizeConfig, saveConfig } from '../config.js';
import { getSavedCredentials, saveCredentials, clearCredentials } from '../autologin.js';

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
            display: flex;
            gap: 5px;
            padding: 8px 14px;
            background: rgba(12, 16, 26, 0.7);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            overflow-x: auto;
            scrollbar-width: none;
            scroll-behavior: smooth;
        }
        .aw-tab-nav::-webkit-scrollbar {
            display: none;
        }
        .aw-tab-btn {
            flex: 1 1 auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 7px 10px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 8px;
            color: #8b9bb4;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
        }
        .aw-tab-btn:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
        }
        .aw-tab-btn.active {
            color: #00ff88;
            background: linear-gradient(135deg, rgba(0, 255, 136, 0.14), rgba(0, 180, 216, 0.09));
            border-color: rgba(0, 255, 136, 0.5);
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0, 255, 136, 0.15);
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
        { id: 'showHide',     label: 'Tampilkan/Sembunyikan Panel' },
        { id: 'workNow',      label: 'Kerja Sekarang (Work Now)' },
        { id: 'pauseResume',  label: 'Jeda/Lanjutkan (Pause/Resume)' },
        { id: 'openLog',      label: 'Buka Activity Log' },
        { id: 'openSettings', label: 'Buka Menu Pengaturan' }
    ];

    const shortcutInputsHTML = shortcutActions.map(action => {
        const shortcut = CONFIG.shortcuts[action.id] || { display: '' };
        return `
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: #cbd5e1; font-size: 12px; flex: 1; font-weight: 500;">${action.label}</span>
                <div style="display: flex; gap: 8px; align-items: center; flex: 0 0 210px;">
                    <button id="record-${action.id}" style="
                        background: #252c40; color: #fff; border: 1px solid #3b4563;
                        padding: 6px 10px; border-radius: 6px; cursor: pointer;
                        font-size: 11px; min-width: 76px; font-weight: 500; transition: background 0.15s;
                    ">🎯 Record</button>
                    <input type="text" id="shortcut-${action.id}" value="${shortcut.display}"
                        readonly
                        style="width: 110px; background: #121624; color: #00d4ff; border: 1px solid #28334e; border-radius: 6px; padding: 6px 8px; font-size: 11px; font-weight: 700; text-align: center;">
                </div>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div style="
            background: linear-gradient(180deg, #131724 0%, #0d101a 100%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            width: 95%;
            max-width: 680px;
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
                        background: linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,180,216,0.2));
                        border: 1px solid rgba(0,255,136,0.3);
                        display: flex; align-items: center; justify-content: center;
                        font-size: 16px;
                    ">⚙️</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 15px; letter-spacing: 0.3px;">Pengaturan Bot</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Sesuaikan jadwal, threshold, notifikasi & keamanan</div>
                    </div>
                </div>
                <button id="aw-close-settings" style="
                    background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 6px 12px; border-radius: 8px; cursor: pointer;
                    font-size: 12px; font-weight: 600; transition: all 0.15s;
                ">✕ Tutup</button>
            </div>

            <!-- Segmented Category Tabs -->
            <div class="aw-tab-nav">
                <button class="aw-tab-btn active" data-tab="tab-work">⚡ Kerja & Energi</button>
                <button class="aw-tab-btn" data-tab="tab-stealth">🛡️ Stealth & Jadwal</button>
                <button class="aw-tab-btn" data-tab="tab-notif">🔔 Notifikasi & Suara</button>
                <button class="aw-tab-btn" data-tab="tab-ui">🖥️ Tampilan & Tombol</button>
                <button class="aw-tab-btn" data-tab="tab-account">🔐 Akun & Sistem</button>
            </div>

            <!-- Scrollable Content Body -->
            <div id="aw-settings-content" style="
                padding: 18px 20px;
                overflow-y: auto;
                flex: 1;
                overscroll-behavior: contain;
            ">
                <!-- TAB 1: KERJA & ENERGI -->
                <div id="tab-work" class="aw-tab-pane active">
                    <div class="aw-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="aw-card-title">⚡ Batas Energi Sebelum Kerja</div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" id="setting-energy-threshold-num" min="10" max="100" step="5" value="${CONFIG.energyThreshold}" class="aw-num-badge">
                                <span style="color: #00ff88; font-size: 13px; font-weight: 700;">⚡</span>
                            </div>
                        </div>
                        <div class="aw-card-desc" style="margin-bottom: 12px;">
                            Bot hanya akan mengeksekusi shift kerja saat energi akun mencapai angka ini.
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px;">
                            <input type="range" id="setting-energy-threshold" min="10" max="100" step="5" value="${CONFIG.energyThreshold}" class="aw-range-slider">
                        </div>
                        <!-- Quick Presets -->
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-size: 11px; color: #64748b; margin-right: 4px;">Pilihan Cepat:</span>
                            <button type="button" class="aw-preset-btn" data-val="10">10⚡ Cepat</button>
                            <button type="button" class="aw-preset-btn" data-val="25">25⚡ Sedang</button>
                            <button type="button" class="aw-preset-btn" data-val="50">50⚡ Hemat</button>
                            <button type="button" class="aw-preset-btn" data-val="80">80⚡ Santai</button>
                            <button type="button" class="aw-preset-btn" data-val="100">100⚡ Penuh</button>
                        </div>
                    </div>

                    <!-- Formula Sleep Info Card -->
                    <div style="background: rgba(0, 255, 136, 0.04); border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 10px; padding: 14px; margin-top: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="color: #00ff88; font-size: 12px; font-weight: 600;">⚡ Rumus Timer Pemulihan</span>
                            <span style="color: #94a3b8; font-size: 11px; font-family: monospace;">(Threshold - Sisa) × 60s + Jitter</span>
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
                            • <b>Buff Wilayah:</b> Jika tinggal di wilayah berfasilitas (seperti Jawa Barat), pemulihan energi otomatis dipercepat hingga +50% (40 detik per energi).<br>
                            • <b>Optimistic Decrement:</b> Energi langsung terpotong seketika shift dikirimkan, mencegah tabrakan permintaan ganda (0 race conditions).
                        </div>
                    </div>
                </div>

                <!-- TAB 2: STEALTH & JADWAL -->
                <div id="tab-stealth" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">🎲 Humanizer Threshold Jitter</div>
                                <div class="aw-card-desc">Mengacak sedikit ambang batas energi (±2⚡) di setiap siklus agar interval kerja tidak terbaca kaku dan terdeteksi bot oleh server.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-stealth-jitter" ${CONFIG.stealthJitterEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 10px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">🌙 Jam Istirahat / Tidur Malam</div>
                                <div class="aw-card-desc">Bot otomatis berhenti kerja pada rentang jam istirahat malam layaknya pola hidup manusia normal.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sleep-schedule" ${CONFIG.sleepScheduleEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                            <span style="font-size: 12px; color: #94a3b8;">Jam Tidur:</span>
                            <select id="setting-sleep-start" class="aw-select-box">
                                ${Array.from({length: 24}, (_, i) => `<option value="${i}" ${(CONFIG.sleepStartHour ?? 1) === i ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`).join('')}
                            </select>
                            <span style="font-size: 12px; color: #64748b;">s/d</span>
                            <select id="setting-sleep-end" class="aw-select-box">
                                ${Array.from({length: 24}, (_, i) => `<option value="${i}" ${(CONFIG.sleepEndHour ?? 6) === i ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`).join('')}
                            </select>
                            <span style="font-size: 11px; color: #64748b; margin-left: auto;">WIB</span>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">🔇 Meredam Log Energi Rendah (Quiet Mode)</div>
                                <div class="aw-card-desc">Membatasi log "Energi tidak cukup" maksimal 1x per 2 menit agar Activity Log tetap bersih dan mudah dibaca.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-quiet-mode" ${CONFIG.quietModeEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: NOTIFIKASI & SUARA -->
                <div id="tab-notif" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">📱 Notifikasi Pop-up Browser</div>
                                <div class="aw-card-desc">Menampilkan banner notifikasi desktop browser ketika shift berhasil dikerjakan.</div>
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
                                <div class="aw-card-title">⚡ Alert Desktop Saat Energi Penuh</div>
                                <div class="aw-card-desc">Kirim notifikasi desktop segera setelah energi mencapai batas maksimal (100⚡) agar tidak mubazir.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-alert" ${CONFIG.energyFullAlertEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">🔔 Suara Notifikasi Kerja</div>
                                <div class="aw-card-desc">Putar efek suara halus saat selesai bekerja atau terjadi kesalahan.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sound-notification-enabled" ${CONFIG.soundNotificationEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-top: 6px;">
                            <span style="font-size: 11px; color: #94a3b8; width: 50px;">Volume:</span>
                            <input type="range" id="setting-sound-notification-volume" min="0" max="100" value="${Math.round(CONFIG.soundNotificationVolume * 100)}" class="aw-range-slider">
                            <input type="number" id="setting-sound-notification-volume-num" min="0" max="100" value="${Math.round(CONFIG.soundNotificationVolume * 100)}" class="aw-num-badge" style="color: #00d4ff;">
                            <span style="color: #64748b; font-size: 12px;">%</span>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">🚨 Bunyi Alarm Energi Penuh</div>
                                <div class="aw-card-desc">Putar alarm khusus saat energi akun sudah menyentuh 100⚡.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-sound-enabled" ${CONFIG.energyFullAlertSoundEnabled ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-top: 6px;">
                            <span style="font-size: 11px; color: #94a3b8; width: 50px;">Volume:</span>
                            <input type="range" id="setting-energy-full-volume" min="0" max="100" value="${Math.round(CONFIG.energyFullAlertVolume * 100)}" class="aw-range-slider">
                            <input type="number" id="setting-energy-full-volume-num" min="0" max="100" value="${Math.round(CONFIG.energyFullAlertVolume * 100)}" class="aw-num-badge" style="color: #00d4ff;">
                            <span style="color: #64748b; font-size: 12px;">%</span>
                        </div>
                    </div>

                    <button id="aw-test-notification-sound" style="
                        background: rgba(255, 255, 255, 0.05); color: #fff; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 9px 16px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; width: 100%; font-weight: 600; margin-top: 4px;
                        transition: all 0.15s;
                    ">🔊 Uji Coba Bunyi Suara (Test Sound)</button>
                </div>

                <!-- TAB 4: TAMPILAN & SHORTCUT -->
                <div id="tab-ui" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">🏠 Hanya Tampilkan di Dashboard (/dashboard)</div>
                                <div class="aw-card-desc">Otomatis sembunyikan panel jika membuka halaman lain (misal: /map, /market). Bot tetap aktif di background.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-dashboard-only" ${CONFIG.panelDashboardOnly ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">👑 Hanya Tampilkan di Tab Utama (Standby Hidden)</div>
                                <div class="aw-card-desc">Jika membuka banyak tab game bersamaan, panel hanya melayang di tab utama yang memimpin kerja.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-leader-only" ${CONFIG.panelLeaderOnly ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">📐 Sesuaikan dengan Ukuran Jendela Browser</div>
                                <div class="aw-card-desc">Mencegah panel keluar layar saat ukuran browser diperkecil.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-follow-viewport" ${CONFIG.panelFollowViewport ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">↩️ Kembali ke Posisi Awal Saat Browser Dibesarkan</div>
                                <div class="aw-card-desc">Mengembalikan panel ke koordinat asal saat ruang layar kembali lega.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-return-original" ${CONFIG.panelReturnToOriginal ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <button id="aw-reset-position" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1);
                        padding: 8px 16px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; width: 100%; margin-bottom: 16px; font-weight: 500;
                        transition: all 0.15s;
                    ">🔄 Atur Ulang Koordinat Posisi Panel ke Pojok Kanan</button>

                    <!-- Keyboard Shortcuts Sub-Section -->
                    <div style="margin-top: 10px;">
                        <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px;">⌨️ Pintasan Keyboard (Shortcuts)</div>
                        <div style="font-size: 11px; color: #8b9bb4; margin-bottom: 10px;">
                            Klik <b>Record</b> lalu tekan 1–3 kombinasi tombol. Tekan <kbd style="background:#222;padding:1px 4px;border-radius:3px;">Enter</kbd> untuk simpan, <kbd style="background:#222;padding:1px 4px;border-radius:3px;">Esc</kbd> untuk batalkan.
                        </div>
                        ${shortcutInputsHTML}
                        <div id="shortcut-error" style="color: #ff4444; font-size: 11px; margin-top: 8px; display: none;"></div>
                    </div>
                </div>

                <!-- TAB 5: AKUN & SISTEM -->
                <div id="tab-account" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">🍃 Mode Eco (Hemat RAM & CPU)</div>
                                <div class="aw-card-desc">Menghentikan render visual DOM saat tab ditinggal di latar belakang dan men-cache pembacaan wilayah. Timer dan giliran kerja tetap berjalan 100% presisi tanpa tertunda.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-eco-mode" ${CONFIG.ecoModeEnabled !== false ? 'checked' : ''}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 10px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">🔐 Auto Re-Login (Masuk Otomatis)</div>
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
                                    <span id="aw-toggle-pwd-vis" style="font-size: 11px; color: #00d4ff; cursor: pointer; user-select: none;">👁️ Lihat</span>
                                </div>
                                <input type="password" id="setting-login-pwd" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="Kata sandi akunmu" value="${savedCreds?.password || ''}" style="width: 100%; box-sizing: border-box; background: #131724; color: #fff; border: 1px solid #2d364f; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button id="aw-save-login-creds" style="flex: 1; background: linear-gradient(135deg, #0088ff, #0055cc); color: #fff; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;">💾 Simpan Kredensial</button>
                                <button id="aw-clear-login-creds" style="background: rgba(255,255,255,0.05); color: #ff5555; border: 1px solid rgba(255,85,85,0.3); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 500;">🗑️ Hapus</button>
                            </div>
                            <div id="aw-login-creds-msg" style="font-size: 11px; margin-top: 8px; display: none;"></div>
                        </div>
                    </div>

                    <div class="aw-card" style="margin-top: 14px; border-color: rgba(255, 85, 85, 0.2);">
                        <div class="aw-card-title" style="color: #ff6b6b; margin-bottom: 6px;">⚠️ Zona Bahaya (Reset Total)</div>
                        <div class="aw-card-desc" style="margin-bottom: 12px;">
                            Mengembalikan seluruh preferensi, batas energi, pintasan keyboard, dan posisi panel ke pengaturan awal pabrik.
                        </div>
                        <button id="aw-restore-defaults" style="
                            background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(204, 0, 0, 0.3));
                            color: #ff8888; border: 1px solid rgba(255, 107, 107, 0.4); padding: 9px;
                            border-radius: 6px; cursor: pointer; font-weight: 600;
                            font-size: 12px; width: 100%; transition: all 0.15s;
                        ">🔄 Pulihkan Semua Pengaturan ke Default</button>
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
                    ">💾 Simpan Pengaturan</button>
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
        // 1. Batas Energi
        const sliderEl = document.getElementById('setting-energy-threshold');
        const numEl    = document.getElementById('setting-energy-threshold-num');
        const sVal = parseInt(sliderEl?.value ?? '', 10);
        const nVal = parseInt(numEl?.value ?? '', 10);
        const chosenThreshold = !isNaN(nVal) && nVal >= 10 && nVal <= 100 ? nVal : (!isNaN(sVal) ? sVal : CONFIG.energyThreshold);
        if (chosenThreshold >= 10 && chosenThreshold <= 100) {
            CONFIG.energyThreshold = chosenThreshold;
            if (sliderEl && sliderEl.value !== String(chosenThreshold)) sliderEl.value = chosenThreshold;
            if (numEl && numEl.value !== String(chosenThreshold)) numEl.value = chosenThreshold;
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
        }

        const fullSoundEl = document.getElementById('setting-energy-full-sound-enabled');
        if (fullSoundEl) CONFIG.energyFullAlertSoundEnabled = fullSoundEl.checked;

        const fullVolEl = document.getElementById('setting-energy-full-volume');
        if (fullVolEl) {
            const vol = Math.max(0, Math.min(100, parseInt(fullVolEl.value || '30', 10)));
            CONFIG.energyFullAlertVolume = vol / 100;
        }

        // 5. Browser Notifikasi
        const notifEl = document.getElementById('setting-notifications');
        if (notifEl) CONFIG.sendNotification = notifEl.checked;

        const fullAlertEl = document.getElementById('setting-energy-full-alert');
        if (fullAlertEl) CONFIG.energyFullAlertEnabled = fullAlertEl.checked;

        // 6. Stealth & Jam Tidur Malam
        const stealthEl = document.getElementById('setting-stealth-jitter');
        if (stealthEl) CONFIG.stealthJitterEnabled = stealthEl.checked;

        const sleepEl = document.getElementById('setting-sleep-schedule');
        if (sleepEl) CONFIG.sleepScheduleEnabled = sleepEl.checked;

        const sleepStartEl = document.getElementById('setting-sleep-start');
        if (sleepStartEl) CONFIG.sleepStartHour = parseInt(sleepStartEl.value, 10);

        const sleepEndEl = document.getElementById('setting-sleep-end');
        if (sleepEndEl) CONFIG.sleepEndHour = parseInt(sleepEndEl.value, 10);

        // 7. Auto Re-Login
        const autoReloginEl = document.getElementById('setting-auto-relogin');
        if (autoReloginEl) CONFIG.autoReloginEnabled = autoReloginEl.checked;

        const ecoEl = document.getElementById('setting-eco-mode');
        if (ecoEl) CONFIG.ecoModeEnabled = ecoEl.checked;

        // 8. Shortcuts (hanya divalidasi pada explicit save)
        if (explicit) {
            const newShortcuts = {};
            shortcutActions.forEach(action => {
                const inp     = document.getElementById(`shortcut-${action.id}`);
                const display = inp?.value.trim() ?? '';
                const parts   = display.split('+').filter(Boolean);
                const keys    = parts.map(p => {
                    if (p === 'Ctrl')  return 'Control';
                    if (p === 'Shift') return 'Shift';
                    if (p === 'Alt')   return 'Alt';
                    if (p === 'Space') return 'Space';
                    if (p.length === 1 && /[A-Z]/.test(p)) return `Key${p}`;
                    if (/^\d$/.test(p)) return `Digit${p}`;
                    return p;
                });
                newShortcuts[action.id] = { keys, display };
            });

            const validated   = normalizeConfig({ shortcuts: newShortcuts }, true);
            const hasModifier = Object.values(newShortcuts).every(s => s.keys.some(k => k === 'Control' || k === 'Alt'));
            const displays    = Object.values(newShortcuts).map(s => s.display);
            const uniqueKeys  = new Set(displays).size === displays.length;

            if (validated && hasModifier && uniqueKeys) {
                CONFIG.shortcuts = newShortcuts;
                const errEl = document.getElementById('shortcut-error');
                if (errEl) errEl.style.display = 'none';
            }
        }

        // Simpan ke chrome.storage.local
        saveConfig(CONFIG);
        ctx.updatePanelVisibility?.(CONFIG);
        ctx.updatePanel?.();

        const statusEl = document.getElementById('aw-settings-status');
        if (statusEl) {
            if (statusTimer) clearTimeout(statusTimer);
            if (explicit) {
                statusEl.textContent = `✅ Tersimpan! Batas energi: ${CONFIG.energyThreshold}⚡`;
                statusEl.style.color = '#00ff88';
                statusEl.style.display = 'block';
            } else {
                statusEl.textContent = `💾 Disimpan otomatis (Batas: ${CONFIG.energyThreshold}⚡)`;
                statusEl.style.color = '#00e99a';
                statusEl.style.display = 'block';
                statusTimer = setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 2500);
            }
        }
    }

    // ── Dual-sync range ↔ number controls ──────────────────────────────────
    function setupDualVolumeControl(sliderId, numberId) {
        const slider = document.getElementById(sliderId);
        const num    = document.getElementById(numberId);
        if (!slider || !num) return;
        const syncAndSave = (sourceVal) => {
            let v = parseInt(sourceVal, 10);
            if (isNaN(v) || v < 0) v = 0;
            if (v > 100) v = 100;
            slider.value = v;
            num.value = v;
            applyAndSaveSettings(false);
        };
        slider.addEventListener('input', e => syncAndSave(e.target.value));
        slider.addEventListener('change', e => syncAndSave(e.target.value));
        num.addEventListener('input', e => syncAndSave(e.target.value));
        num.addEventListener('change', e => syncAndSave(e.target.value));
        num.addEventListener('blur', e => syncAndSave(e.target.value));
    }
    setupDualVolumeControl('setting-sound-notification-volume',     'setting-sound-notification-volume-num');
    setupDualVolumeControl('setting-energy-full-volume',            'setting-energy-full-volume-num');

    // Dual-sync untuk threshold energi
    const thresholdSlider = document.getElementById('setting-energy-threshold');
    const thresholdNum    = document.getElementById('setting-energy-threshold-num');
    if (thresholdSlider && thresholdNum) {
        const syncThreshold = (val) => {
            let v = parseInt(val, 10);
            if (isNaN(v) || v < 10) v = 10;
            if (v > 100) v = 100;
            thresholdSlider.value = v;
            thresholdNum.value = v;
            applyAndSaveSettings(false);
        };
        thresholdSlider.addEventListener('input', e => syncThreshold(e.target.value));
        thresholdSlider.addEventListener('change', e => syncThreshold(e.target.value));
        thresholdNum.addEventListener('input', e => syncThreshold(e.target.value));
        thresholdNum.addEventListener('change', e => syncThreshold(e.target.value));
        thresholdNum.addEventListener('blur', e => syncThreshold(e.target.value));
    }

    // Quick Preset buttons handler
    modal.querySelectorAll('.aw-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.val, 10);
            if (!isNaN(val)) {
                if (thresholdSlider) thresholdSlider.value = val;
                if (thresholdNum) thresholdNum.value = val;
                applyAndSaveSettings(false);
            }
        });
    });

    // Auto-save on all switches & selects
    [
        'setting-quiet-mode',
        'setting-panel-dashboard-only',
        'setting-panel-leader-only',
        'setting-follow-viewport',
        'setting-return-original',
        'setting-sound-notification-enabled',
        'setting-energy-full-sound-enabled',
        'setting-notifications',
        'setting-energy-full-alert',
        'setting-stealth-jitter',
        'setting-sleep-schedule',
        'setting-sleep-start',
        'setting-sleep-end',
        'setting-auto-relogin',
        'setting-eco-mode'
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => applyAndSaveSettings(false));
    });

    // ── Auto Re-Login Credentials Management ────────────────────────────────
    const pwdInput = document.getElementById('setting-login-pwd');
    const togglePwdBtn = document.getElementById('aw-toggle-pwd-vis');
    togglePwdBtn?.addEventListener('click', () => {
        if (!pwdInput) return;
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            togglePwdBtn.textContent = '🙈 Sembunyikan';
        } else {
            pwdInput.type = 'password';
            togglePwdBtn.textContent = '👁️ Lihat';
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
                credsMsg.textContent = '⚠️ Harap isi email dan kata sandi!';
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
            credsMsg.textContent = `✅ Kredensial untuk ${email} tersimpan! Auto Re-Login AKTIF.`;
            credsMsg.style.color = '#00ff88';
            credsMsg.style.display = 'block';
        }
        ctx.log?.('🔐 Kredensial Auto Re-Login berhasil disimpan.', 'success');
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
            credsMsg.textContent = '🗑️ Kredensial telah dihapus dari browser.';
            credsMsg.style.color = '#ffaa00';
            credsMsg.style.display = 'block';
        }
        ctx.log?.('Kredensial Auto Re-Login dihapus.', 'info');
    });

    // ── Keyboard shortcut recording ─────────────────────────────────────────
    const recordingState = {};
    shortcutActions.forEach(action => {
        const btn = document.getElementById(`record-${action.id}`);
        const inp = document.getElementById(`shortcut-${action.id}`);
        if (btn && inp) {
            btn.addEventListener('click', () => {
                recordingState[action.id] = { keys: [], recording: true };
                btn.textContent = '⏳ Tekan tombol...';
                btn.style.background = '#ff9500';
                inp.value = 'Menunggu input...';
                inp.style.color = '#ff9500';
            });
        }
    });

    const recordHandler = e => {
        if (e.type !== 'keydown') return;
        let handled = false;
        shortcutActions.forEach(action => {
            if (!recordingState[action.id]?.recording) return;
            e.preventDefault(); e.stopPropagation();
            const rec = recordingState[action.id];
            const btn = document.getElementById(`record-${action.id}`);
            const inp = document.getElementById(`shortcut-${action.id}`);
            const key = e.code;

            if (key === 'Escape') {
                rec.recording = false;
                if (inp) inp.value = CONFIG.shortcuts[action.id]?.display ?? '';
                if (btn) { btn.textContent = '🎯 Record'; btn.style.background = '#252c40'; }
                handled = true; return;
            }
            if (key === 'Enter') {
                if (rec.keys.length > 0) {
                    rec.recording = false;
                    if (btn) {
                        btn.textContent = '✅ Done'; btn.style.background = '#00ff88'; btn.style.color = '#000';
                        setTimeout(() => { btn.textContent = '🎯 Record'; btn.style.background = '#252c40'; btn.style.color = '#fff'; }, 1500);
                    }
                }
                handled = true; return;
            }
            if (e.repeat) { handled = true; return; }
            if (!rec.keys.includes(key)) rec.keys.push(key);
            const display = rec.keys.map(k => {
                if (k === 'ControlLeft' || k === 'ControlRight') return 'Ctrl';
                if (k === 'ShiftLeft'   || k === 'ShiftRight')   return 'Shift';
                if (k === 'AltLeft'     || k === 'AltRight')     return 'Alt';
                if (k.startsWith('Key'))   return k.replace('Key', '');
                if (k.startsWith('Digit')) return k.replace('Digit', '');
                if (k === 'Space') return 'Space';
                return k;
            }).join('+');
            if (inp) { inp.value = display; inp.style.color = '#00ff88'; }
            if (rec.keys.length >= 3) {
                rec.recording = false;
                if (btn) {
                    btn.textContent = '✅ Done'; btn.style.background = '#00ff88'; btn.style.color = '#000';
                    setTimeout(() => { btn.textContent = '🎯 Record'; btn.style.background = '#252c40'; btn.style.color = '#fff'; }, 1500);
                }
            }
            handled = true;
        });
        if (handled) return false;
    };

    // ── Modal open/close ────────────────────────────────────────────────────
    function handleEscapeKey(e) {
        if (e.key === 'Escape' && modal.style.display === 'flex') closeModal(true);
    }
    function closeModal(saveOnClose = true) {
        if (saveOnClose) applyAndSaveSettings(false);
        modal.style.display = 'none';
        if (ctx.state) ctx.state.settingsOpen = false;
        document.removeEventListener('keydown', recordHandler, true);
        document.removeEventListener('keydown', handleEscapeKey);
    }
    modal.closeModalSafely = closeModal;
    modal.recordHandler    = recordHandler;
    modal.handleEscapeKey  = handleEscapeKey;

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
        ctx.state.panelX = CONFIG.panelDefaultX;
        ctx.state.panelY = CONFIG.panelDefaultY;
        const panel = document.getElementById('aw-panel');
        if (panel) { panel.style.left = ctx.state.panelX + 'px'; panel.style.top = ctx.state.panelY + 'px'; }
        setValue('panelX', ctx.state.panelX.toString());
        setValue('panelY', ctx.state.panelY.toString());
        ctx.log?.('Posisi panel berhasil di-reset ke default', 'success');
        const statusEl = document.getElementById('aw-settings-status');
        if (statusEl) {
            statusEl.textContent = '📍 Posisi panel di-reset ke default';
            statusEl.style.color = '#0088ff';
            statusEl.style.display = 'block';
            setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 2500);
        }
    });

    document.getElementById('aw-restore-defaults')?.addEventListener('click', () => {
        if (!confirm('⚠️ Yakin ingin mengembalikan SEMUA pengaturan ke default?\n\nIni akan:\n- Reset keyboard shortcuts ke Ctrl+Shift+A/L/S dan Alt+Shift+W/P\n- Reset batas energi ke 10⚡\n- Reset semua checkbox dan slider\n- Reset posisi panel\n\nKonfigurasi yang tersimpan akan dihapus!')) return;
        setValue('aw_config', null);
        setValue('panelX', (CONFIG.panelDefaultX ?? 20).toString());
        setValue('panelY', (CONFIG.panelDefaultY ?? 20).toString());
        ctx.log?.('🔄 Semua pengaturan berhasil di-reset ke default! Refresh halaman untuk menerapkan.', 'success');
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

        ctx.log?.(`Pengaturan disimpan! Batas energi sebelum kerja: ${CONFIG.energyThreshold}⚡`, 'success');
        ctx.playNotificationSound?.('success');
        setTimeout(() => closeModal(false), 700);
    });
}

export function openSettings(CONFIG, ctx) {
    const modal = document.getElementById('aw-settings-modal');
    if (!modal) return;

    // Sinkronkan seluruh input DOM dari CONFIG aktif
    const thresholdSlider = document.getElementById('setting-energy-threshold');
    const thresholdNum    = document.getElementById('setting-energy-threshold-num');
    if (thresholdSlider) thresholdSlider.value = CONFIG.energyThreshold;
    if (thresholdNum)    thresholdNum.value    = CONFIG.energyThreshold;

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
    const soundVolNum    = document.getElementById('setting-sound-notification-volume-num');
    if (soundVolSlider) soundVolSlider.value = Math.round(CONFIG.soundNotificationVolume * 100);
    if (soundVolNum)    soundVolNum.value    = Math.round(CONFIG.soundNotificationVolume * 100);

    const fullSoundCb = document.getElementById('setting-energy-full-sound-enabled');
    if (fullSoundCb) fullSoundCb.checked = Boolean(CONFIG.energyFullAlertSoundEnabled);

    const fullVolSlider = document.getElementById('setting-energy-full-volume');
    const fullVolNum    = document.getElementById('setting-energy-full-volume-num');
    if (fullVolSlider) fullVolSlider.value = Math.round(CONFIG.energyFullAlertVolume * 100);
    if (fullVolNum)    fullVolNum.value    = Math.round(CONFIG.energyFullAlertVolume * 100);

    const notifCb = document.getElementById('setting-notifications');
    if (notifCb) notifCb.checked = Boolean(CONFIG.sendNotification);

    const fullAlertCb = document.getElementById('setting-energy-full-alert');
    if (fullAlertCb) fullAlertCb.checked = Boolean(CONFIG.energyFullAlertEnabled);

    const stealthCb = document.getElementById('setting-stealth-jitter');
    if (stealthCb) stealthCb.checked = Boolean(CONFIG.stealthJitterEnabled);

    const sleepCb = document.getElementById('setting-sleep-schedule');
    if (sleepCb) sleepCb.checked = Boolean(CONFIG.sleepScheduleEnabled);

    const sleepStartSel = document.getElementById('setting-sleep-start');
    if (sleepStartSel) sleepStartSel.value = String(CONFIG.sleepStartHour ?? 1);

    const sleepEndSel = document.getElementById('setting-sleep-end');
    if (sleepEndSel) sleepEndSel.value = String(CONFIG.sleepEndHour ?? 6);

    ['showHide', 'workNow', 'pauseResume', 'openLog', 'openSettings'].forEach(actionId => {
        const inp = document.getElementById(`shortcut-${actionId}`);
        if (inp && CONFIG.shortcuts[actionId]) {
            inp.value = CONFIG.shortcuts[actionId].display || '';
            inp.style.color = '#00d4ff';
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
