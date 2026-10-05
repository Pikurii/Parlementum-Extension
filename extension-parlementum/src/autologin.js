/**
 * autologin.js — Automated credential management and React-safe re-login execution
 */

import { getValue, setValue } from './storage.js';

export function getSavedCredentials() {
    const raw = getValue('aw_login_creds', null);
    if (!raw) return null;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed.email === 'string' && typeof parsed.password === 'string') {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

export function saveCredentials(email, password) {
    const creds = {
        email: email.trim(),
        password: password,
        savedAt: Date.now()
    };
    setValue('aw_login_creds', JSON.stringify(creds));
    return creds;
}

export function clearCredentials() {
    setValue('aw_login_creds', '');
}

/**
 * React SPA inputs ignore direct element.value assignments because React tracks value state via internal descriptor.
 * We must invoke the native prototype setter and dispatch synthetic 'input' + 'change' events.
 */
export function setReactInputValue(input, value) {
    if (!input) return;
    try {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, value);
        } else {
            input.value = value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 * Automatically captures credentials when user manually submits on the /login page.
 * Uses passive/safe event listening and filters out extension elements.
 */
export function setupLoginCapture(logFn) {
    if (!/^\/(login|register|signup)/i.test(window.location.pathname)) return;

    function handleCapture() {
        try {
            const inputs = Array.from(document.querySelectorAll('input')).filter(el =>
                !el.closest('#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal')
            );
            const emailInput = inputs.find(el => el.type === 'email' || /email|username/i.test(el.name || el.placeholder || ''))
                            || inputs.find(el => el.type === 'text' && /@/i.test(el.placeholder || ''));
            const passInput  = inputs.find(el => el.type === 'password');

            if (emailInput?.value && passInput?.value) {
                saveCredentials(emailInput.value, passInput.value);
                console.log('[Auto Worker] 🔐 Kredensial login berhasil disimpan otomatis untuk Auto Re-Login.');
                logFn?.('🔐 Kredensial login berhasil diperbarui otomatis!', 'info');
            }
        } catch { /* ignore */ }
    }

    document.addEventListener('submit', handleCapture, true);
    document.addEventListener('click', (e) => {
        try {
            const btn = e.target?.closest?.('button');
            if (btn && /masuk|login|sign in|enter/i.test(btn.textContent || '')) {
                handleCapture();
            }
        } catch { /* ignore */ }
    }, true);
}

/**
 * Searches for login inputs and submit button on /login.
 * Explicitly ignores extension UI nodes to avoid any collision.
 */
function waitForLoginInputs(timeoutMs = 12000) {
    return new Promise(resolve => {
        const find = () => {
            const inputs = Array.from(document.querySelectorAll('input')).filter(el =>
                !el.closest('#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal')
            );
            const emailInput = inputs.find(el => el.type === 'email' || /email|username/i.test(el.name || el.placeholder || ''))
                            || inputs.find(el => el.type === 'text' && /@/i.test(el.placeholder || ''));
            const passInput  = inputs.find(el => el.type === 'password');
            const buttons    = Array.from(document.querySelectorAll('button')).filter(el =>
                !el.closest('#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal')
            );
            const submitBtn  = buttons.find(b => /masuk|login|sign in|enter/i.test(b.textContent || ''))
                            || document.querySelector('button[type="submit"]')
                            || buttons.find(b => b.offsetWidth > 100);

            if (emailInput && passInput && submitBtn) {
                return { emailInput, passInput, submitBtn };
            }
            return null;
        };

        const immediate = find();
        if (immediate) return resolve(immediate);

        const start = Date.now();
        const interval = setInterval(() => {
            const found = find();
            if (found) {
                clearInterval(interval);
                resolve(found);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                resolve(null);
            }
        }, 350);
    });
}

/**
 * Executes automated login if enabled and on /login page.
 */
export async function tryAutoLogin(CONFIG, logFn, sendNotificationFn) {
    if (!/^\/login/i.test(window.location.pathname)) {
        // When user is successfully past login (e.g. on /dashboard), reset attempt counter
        try { sessionStorage.removeItem('aw_login_attempts'); } catch { /* ignore */ }
        return false;
    }

    if (!CONFIG?.autoReloginEnabled) return false;

    const creds = getSavedCredentials();
    if (!creds?.email || !creds?.password) {
        console.log('[Auto Worker] 🔐 Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan.');
        logFn?.('🔐 Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan. Silakan isi di Settings atau login manual sekali.', 'info');
        return false;
    }

    // Anti-lockout guard: limit to 2 consecutive attempts per session
    let attempts = 0;
    try {
        attempts = parseInt(sessionStorage.getItem('aw_login_attempts') || '0', 10);
    } catch { /* ignore */ }

    if (attempts >= 2) {
        console.warn('[Auto Worker] ⚠️ Auto Re-Login dihentikan sementara: telah mencoba 2x.');
        logFn?.('⚠️ Auto Re-Login dihentikan sementara: telah mencoba 2x. Silakan login manual untuk verifikasi akun.', 'error');
        sendNotificationFn?.(CONFIG, 'Auto Re-Login Dihentikan', 'Mencapai batas 2x percobaan. Silakan periksa akun.');
        return false;
    }

    console.log('[Auto Worker] ⏳ Halaman login terdeteksi. Mempersiapkan Auto Re-Login...');
    logFn?.('⏳ Halaman login terdeteksi. Memulai Auto Re-Login dalam 1.5 detik...', 'info');

    // Give React SPA 1.2s to finish hydrating its component tree
    await new Promise(r => setTimeout(r, 1200));

    const elements = await waitForLoginInputs(10000);
    if (!elements) {
        console.warn('[Auto Worker] ⚠️ Elemen form login tidak ditemukan dalam 10 detik.');
        logFn?.('⚠️ Elemen form login tidak ditemukan dalam 10 detik.', 'warn');
        return false;
    }

    const { emailInput, passInput, submitBtn } = elements;

    try {
        sessionStorage.setItem('aw_login_attempts', (attempts + 1).toString());
    } catch { /* ignore */ }

    // Human-like typing delay to prevent anti-bot detection
    await new Promise(r => setTimeout(r, 600));
    setReactInputValue(emailInput, creds.email);

    await new Promise(r => setTimeout(r, 450));
    setReactInputValue(passInput, creds.password);

    await new Promise(r => setTimeout(r, 600));

    console.log(`[Auto Worker] 🔑 Mengirim login otomatis untuk ${creds.email}...`);
    logFn?.(`🔑 Mengirim login otomatis untuk ${creds.email}...`, 'info');
    sendNotificationFn?.(CONFIG, 'Auto Re-Login', `Mencoba masuk otomatis sebagai ${creds.email}...`);

    submitBtn.click();
    return true;
}
