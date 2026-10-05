/**
 * notifications.js — Sound alerts, toast notifications, and browser notifications
 *
 * Replaces GM_notification with chrome.notifications API.
 */

let toastTimer = null;

/** Creates or updates the toast notification element. */
export function showInPageNotification(title, message) {
    if (!document.body) return;
    let toast = document.getElementById('aw-notification-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'aw-notification-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.style.cssText = [
            'position:fixed', 'top:16px', 'right:16px', 'z-index:100010',
            'display:none', 'width:min(360px,calc(100vw - 32px))', 'padding:12px 14px',
            'background:rgba(10,10,20,.97)', 'border:1px solid #00aaff',
            'border-left:4px solid #00e99a', 'border-radius:6px',
            'box-shadow:0 6px 24px rgba(0,0,0,.55)', 'color:#eee',
            'font:12px/1.45 Segoe UI,Tahoma,sans-serif', 'pointer-events:none'
        ].join(';');
        document.body.appendChild(toast);
    }

    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText = 'font-weight:700;color:#00e99a;margin-bottom:3px;';
    const detail = document.createElement('div');
    detail.textContent = message;
    detail.style.color = '#ddd';
    toast.replaceChildren(heading, detail);
    toast.style.display = 'block';

    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; toastTimer = null; }, 6000);
}

/**
 * Sends a toast + chrome.notifications (replaces GM_notification).
 * Supports both sendNotification(CONFIG, title, message) and sendNotification(title, message).
 */
export function sendNotification(arg1, arg2, arg3) {
    let CONFIG = null, title = '', message = '';
    if (typeof arg1 === 'object' && arg1 !== null) {
        CONFIG = arg1;
        title = typeof arg2 === 'string' ? arg2 : String(arg2 || '');
        message = typeof arg3 === 'string' ? arg3 : String(arg3 || '');
    } else {
        title = typeof arg1 === 'string' ? arg1 : String(arg1 || '');
        message = typeof arg2 === 'string' ? arg2 : String(arg2 || '');
    }

    if (CONFIG && !CONFIG.sendNotification) return;
    showInPageNotification(title, message);

    try {
        const isCritical = /expired|401|habis|kadaluarsa|dijeda|login/i.test(`${title} ${message}`);
        chrome.runtime.sendMessage({
            type: 'NOTIFY',
            title,
            message,
            priority: isCritical ? 2 : 1,
            requireInteraction: isCritical
        });
    } catch { /* extension context may be invalidated */ }
}

/**
 * Plays sound feedback for success or error.
 * Supports both playNotificationSound(CONFIG, type) and playNotificationSound(type).
 */
export function playNotificationSound(arg1, arg2) {
    let CONFIG = null, type = 'success';
    if (typeof arg1 === 'object' && arg1 !== null) {
        CONFIG = arg1;
        type = typeof arg2 === 'string' ? arg2 : 'success';
    } else if (typeof arg1 === 'string') {
        type = arg1;
        if (typeof arg2 === 'object' && arg2 !== null) {
            CONFIG = arg2;
        }
    }

    if (CONFIG && !CONFIG.soundNotificationEnabled) return;
    // Avoid triggering AudioContext on hidden background tabs to respect browser autoplay policy
    if (typeof document !== 'undefined' && document.hidden) return;

    const volume = CONFIG?.soundNotificationVolume != null ? CONFIG.soundNotificationVolume : 0.3;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    let ctx = null;
    try {
        ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = volume;

        if (type === 'success') {
            osc.frequency.value = 800;
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
            setTimeout(() => {
                try {
                    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
                    o2.connect(g2); g2.connect(ctx.destination);
                    g2.gain.value = volume;
                    o2.frequency.value = 1000;
                    o2.start(); o2.stop(ctx.currentTime + 0.1);
                    setTimeout(() => ctx.close().catch(() => {}), 150);
                } catch { try { ctx.close().catch(() => {}); } catch { /* ignore */ } }
            }, 100);
        } else {
            osc.frequency.value = 200;
            osc.start(); osc.stop(ctx.currentTime + 0.3);
            setTimeout(() => ctx.close().catch(() => {}), 400);
        }
    } catch {
        try { ctx?.close().catch(() => {}); } catch { /* ignore */ }
    }
}

/**
 * Plays the full-energy chime sequence.
 * Supports both playEnergyFullAlarm(CONFIG) and playEnergyFullAlarm().
 */
export function playEnergyFullAlarm(CONFIG = null) {
    if (CONFIG && !CONFIG.energyFullAlertSoundEnabled) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const volume = CONFIG?.energyFullAlertVolume != null ? CONFIG.energyFullAlertVolume : 0.3;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    let ctx = null;
    try {
        ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const start = ctx.currentTime;
        [660, 880, 1100].forEach((freq, i) => {
            const osc = ctx.createOscillator(), g = ctx.createGain();
            const t = start + i * 0.18;
            osc.type = 'sine'; osc.frequency.value = freq;
            g.gain.value = volume;
            osc.connect(g); g.connect(ctx.destination);
            osc.start(t); osc.stop(t + 0.13);
        });
        setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch {
        try { ctx?.close().catch(() => {}); } catch { /* ignore */ }
    }
}
