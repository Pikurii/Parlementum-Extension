import { gaussianRandom, getHumanJitter, getEnergyJitterOffset, checkMicroBreak } from './humanizer.js';
import { setValue } from './storage.js';
import { broadcastTabMessage } from './broadcast.js';

/**
 * Returns true if the current page is the primary game dashboard where
 * live energy cards and active DOM updates reside.
 */
export function isDashboardPage() {
    if (typeof window === 'undefined') return true;
    const pathname = (window.location.pathname || '').toLowerCase();
    const cleanPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    return cleanPath === '/dashboard' || cleanPath.startsWith('/dashboard/') || cleanPath === '/' || cleanPath === '';
}

/** @returns {{ current: number, max: number }|null} */
export function getCurrentEnergy() {
    try {
        if (!isDashboardPage()) return null;

        const isExcluded = el => {
            if (!el) return true;
            return Boolean(el.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast'));
        };

        // ── Priority 0: Fast Target by TestID ─────────────────────────────────────
        const testIdCards = document.querySelectorAll('[data-testid="dash-energy"], [data-testid="energy"], [data-testid*="energy" i]');
        for (const card of testIdCards) {
            if (isExcluded(card)) continue;
            const text = (card.textContent || '').trim();
            const m = text.match(/(?:^|[^\d])(\d{1,3})\s*\/\s*(\d{2,3})(?:[^\d]|$)/);
            if (m) {
                const cur = parseInt(m[1], 10);
                const mx = parseInt(m[2], 10);
                if (mx >= 50 && mx <= 350 && cur <= mx) {
                    return { current: cur, max: mx };
                }
            }
        }

        // ── Priority 1: Unique "Penuh dalam" or "ISI" Card Signature ─────────────
        // On Parlementum dashboard, the energy card ALWAYS contains the unique text "Penuh dalam"
        const fullLabels = document.querySelectorAll('span, div, p');
        for (const el of fullLabels) {
            if (isExcluded(el)) continue;
            const txt = (el.textContent || '').trim();
            if (/^Penuh\s+dalam\b/i.test(txt) || /^(?:ISI|ISI\s*[-·])\s*\d+/i.test(txt)) {
                let card = el.parentElement;
                for (let lvl = 0; lvl < 4 && card && card !== document.body; lvl++) {
                    const cardText = (card.textContent || '').trim();
                    const m = cardText.match(/(?:(?:ENERGI|ENERGY)[\s\S]{0,30}?)?(\d{1,3})\s*\/\s*(\d{2,3})\b/i);
                    if (m) {
                        const cur = parseInt(m[1], 10);
                        const mx = parseInt(m[2], 10);
                        if (mx >= 50 && mx <= 350 && cur <= mx) {
                            return { current: cur, max: mx };
                        }
                    }
                    card = card.parentElement;
                }
            }
        }

        // ── Priority 2: Dedicated Dashboard "ENERGI" Card Header ─────────────────
        const energyHeaders = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p');
        for (const h of energyHeaders) {
            if (isExcluded(h)) continue;
            const t = (h.textContent || '').trim();
            if (/^(?:\u26A1)?\s*(?:ENERGI|ENERGY)$/i.test(t) || (/^(?:\u26A1)?\s*(?:ENERGI|ENERGY)\b/i.test(t) && t.length <= 20)) {
                let card = h.parentElement;
                for (let level = 0; level < 4 && card && card !== document.body; level++) {
                    if (card.getAttribute('data-testid') === 'dash-deck' || card.getAttribute('data-testid') === 'dash-col-you' || card.tagName === 'MAIN') {
                        break;
                    }
                    const cardText = (card.textContent || card.innerText || '').trim();
                    const m = cardText.match(/(?:(?:ENERGI|ENERGY)[\s\S]{0,40}?)?(\d{1,3})\s*\/\s*(\d{2,3})\b/i);
                    if (m) {
                        const current = parseInt(m[1], 10);
                        const max = parseInt(m[2], 10);
                        if (max >= 50 && max <= 350 && current <= max) {
                            return { current, max };
                        }
                    }

                    const children = card.querySelectorAll('span, div, p');
                    for (const child of children) {
                        if (isExcluded(child)) continue;
                        const childTxt = (child.textContent || '').trim();
                        if (!childTxt.includes('/') || childTxt.length > 20) continue;
                        if (/\b(?:LEVEL|XP|ROTI|SLOT|EMAS|USD|LV)\b/i.test(childTxt)) continue;
                        const cm = childTxt.match(/(\d{1,3})\s*\/\s*(\d{2,3})\b/);
                        if (cm) {
                            const cur = parseInt(cm[1], 10);
                            const mx = parseInt(cm[2], 10);
                            if (mx >= 50 && mx <= 350 && cur <= mx) {
                                return { current: cur, max: mx };
                            }
                        }
                    }
                    card = card.parentElement;
                }
            }
        }

        // ── Priority 3: Bottom Floating Status Bar or Top Nav [\u26A1 75/215] ─────────
        const statusCandidates = document.querySelectorAll('header, nav, footer, [role="banner"], [role="status"], div[class*="nav" i], div[class*="bar" i], div[class*="bottom" i], div[class*="fixed" i], div[class*="sticky" i]');
        for (const container of statusCandidates) {
            if (isExcluded(container)) continue;
            const els = container.querySelectorAll('span, div, p, a, button');
            for (const el of els) {
                if (isExcluded(el)) continue;
                const txt = (el.textContent || '').trim();
                if (!txt.includes('/') || txt.length > 25) continue;
                if (/\b(?:LEVEL|XP|MAKANAN|ROTI|SLOT|DOMPET|EMAS|USD|LATIHAN|KEKUATAN|PENDIDIKAN)\b/i.test(txt)) continue;
                const m = txt.match(/(?:\u26A1|\b)(\d{1,3})\s*\/\s*(\d{2,3})\b/);
                if (m) {
                    const current = parseInt(m[1], 10);
                    const max = parseInt(m[2], 10);
                    if (max >= 50 && max <= 350 && current <= max) {
                        return { current, max };
                    }
                }
            }
        }

        // ── Priority 4: Work Button Energy [KERJAKAN SATU GILIRAN \u26A1 86] ───────
        const workBtn = document.querySelector('button[data-testid="work"]') ||
            Array.from(document.querySelectorAll('button')).find(b =>
                !isExcluded(b) && /KERJAKAN\s+SATU\s+GILIRAN/i.test(b.textContent || '')
            );
        if (workBtn) {
            const btnText = (workBtn.textContent || '').trim();
            const btnMatch = btnText.match(/(?:\u26A1)\s*(\d{1,3})\b/);
            if (btnMatch) {
                const cur = parseInt(btnMatch[1], 10);
                if (cur >= 0 && cur <= 350) {
                    return { current: cur, max: 215 };
                }
            }
        }
    } catch { /* ignore */ }
    return null;
}

/**
 * Waits (up to maxWaitMs) for the energy element to appear in the DOM.
 * Useful on React SPAs where elements render after document_idle.
 * @param {number} maxWaitMs
 * @returns {Promise<{current:number,max:number}|null>}
 */
export function waitForEnergyElement(maxWaitMs = 15000) {
    return new Promise(resolve => {
        if (!isDashboardPage()) {
            return resolve(null);
        }
        const immediate = getCurrentEnergy();
        if (immediate) return resolve(immediate);

        const deadline = Date.now() + maxWaitMs;
        let done = false;

        const finish = (result) => {
            if (done) return;
            done = true;
            try { observer.disconnect(); } catch { /* ignore */ }
            if (pollTimer) clearInterval(pollTimer);
            resolve(result || getCurrentEnergy());
        };

        let rafPending = false;
        const observer = new MutationObserver(() => {
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                const result = getCurrentEnergy();
                if (result) finish(result);
                else if (Date.now() >= deadline) finish(null);
            });
        });

        try {
            observer.observe(document.documentElement, { childList: true, subtree: true });
        } catch { /* ignore */ }

        // Fast poll safety timer (every 50ms for first 1.5s, then 200ms)
        const startTime = Date.now();
        const pollTimer = setInterval(() => {
            const res = getCurrentEnergy();
            if (res) finish(res);
            else if (Date.now() >= deadline) finish(null);
        }, Date.now() - startTime < 1500 ? 50 : 200);

        setTimeout(() => finish(null), maxWaitMs);
    });
}

/**
 * Intentionally no-op: never mutate React host SPA DOM nodes directly,
 * as doing so wipes out child elements, styling, and breaks React virtual DOM.
 */
export function updatePageEnergyDOM(current, max) {
    return false;
}

/**
 * Pure mathematical projection of energy from a fixed anchor point.
 * Preserves fractional elapsed milliseconds so that zero seconds are lost across ticks.
 *
 * @param {object} syncBase { current, max, updatedAt, regenRate }
 * @param {number} [now=Date.now()]
 * @returns {number} Integer energy clamped between 0 and max
 */
export function calculateProjectedEnergy(syncBase, now = Date.now()) {
    if (!syncBase || typeof syncBase.current !== 'number') return 0;
    const max = syncBase.max || 115;
    if (syncBase.current >= max) return max;
    const updatedAt = syncBase.updatedAt || now;
    const elapsedMs = Math.max(0, now - updatedAt);
    const rate = Math.max(0.5, syncBase.regenRate || 1.0);
    // Parlamentum formula: `rate` energy per minute (60,000 ms)
    const gained = Math.floor((elapsedMs * rate) / 60000);
    return Math.min(max, syncBase.current + gained);
}

export const SCRIPT_LOAD_TIME = Date.now();

/**
 * Multi-layer hybrid energy calculation: Ground-truth DOM when fresh,
 * or mathematical projection from energySyncBase anchor when hidden or on unrefreshed post-shift DOM.
 * @param {object} state
 */
export function getSyncedEnergy(state) {
    const now    = Date.now();
    const isDash = isDashboardPage();

    // 1. Dashboard DOM check when on /dashboard
    if (isDash) {
        const pageEnergy = getCurrentEnergy();
        if (pageEnergy) {
            const rate = state.regenRate || getRegionHealthBonus() || 1.0;
            state.regenRate = rate;

            const isTabHidden = typeof document !== 'undefined' && document.hidden;
            const isRecentShift = Boolean(state.lastWorkTimestamp && (now - state.lastWorkTimestamp < 10000));

            // DOM is ONLY stale if the tab is hidden in the background with un-rendered old energy,
            // OR if a shift was executed in this tab in the last 10 seconds and React hasn't updated yet.
            // When the user has the tab open in foreground, the visible DOM is 100% authoritative!
            const isDomClearlyStale = Boolean(
                (isTabHidden && state.domEnergyStale && pageEnergy.current > (state.postShiftEnergy ?? 0) + 2) ||
                (isRecentShift && state.postShiftEnergy != null && pageEnergy.current > state.postShiftEnergy + 2)
            );

            if (!isDomClearlyStale) {
                // DOM is genuine ground-truth
                state.hasInitialDomEnergyRead = true;
                state.currentEnergy = pageEnergy.current;
                state.maxEnergy = pageEnergy.max;
                state.domEnergyStale = false;
                state.shiftExecutedInSession = false;

                // Ground the mathematical sync anchor whenever genuine DOM energy is read
                if (!state.energySyncBase || state.energySyncBase.current !== pageEnergy.current || Math.abs(calculateProjectedEnergy(state.energySyncBase, now) - pageEnergy.current) >= 1) {
                    state.energySyncBase = {
                        current: pageEnergy.current,
                        max: pageEnergy.max,
                        updatedAt: now,
                        regenRate: rate
                    };
                }
                return pageEnergy;
            }
        }
    }

    // 2. Mathematical Projection from energySyncBase (zero-drift fixed anchor)
    // Used when DOM is stale, on non-dashboard tabs (/map, /pasar), or during initial hydration
    if (!state.energySyncBase || typeof state.energySyncBase.current !== 'number') {
        state.energySyncBase = {
            current: state.currentEnergy || 0,
            max: state.maxEnergy || 115,
            updatedAt: now,
            regenRate: state.regenRate || getRegionHealthBonus() || 1.0
        };
    }
    const regenRate = state.regenRate || getRegionHealthBonus() || 1.0;
    state.regenRate = regenRate;
    state.energySyncBase.regenRate = regenRate;

    const max = state.energySyncBase.max || state.maxEnergy || 115;
    const calculated = calculateProjectedEnergy(state.energySyncBase, now);
    if (calculated > 0 || state.hasInitialDomEnergyRead || state.postShiftEnergy === 0) {
        state.currentEnergy = calculated;
    }
    state.maxEnergy = max;
    return { current: state.currentEnergy, max };
}

/** Checks if current local time is within configured sleep hours */
export function isSleepTime(CONFIG) {
    if (!CONFIG?.sleepScheduleEnabled) return false;
    const now = new Date();
    if (CONFIG.sleepStartTime && CONFIG.sleepEndTime) {
        const [sh, sm] = CONFIG.sleepStartTime.split(':').map(Number);
        const [eh, em] = CONFIG.sleepEndTime.split(':').map(Number);
        if (!isNaN(sh) && !isNaN(eh)) {
            const currentMins = now.getHours() * 60 + now.getMinutes();
            const startMins = sh * 60 + (sm || 0);
            const endMins = eh * 60 + (em || 0);
            if (startMins < endMins) {
                return currentMins >= startMins && currentMins < endMins;
            } else {
                return currentMins >= startMins || currentMins < endMins;
            }
        }
    }
    const currentHour = now.getHours();
    const start = CONFIG.sleepStartHour ?? 1;
    const end = CONFIG.sleepEndHour ?? 6;

    if (start < end) {
        return currentHour >= start && currentHour < end;
    } else {
        return currentHour >= start || currentHour < end;
    }
}

let _cachedRegionDetails = null;
let _lastRegionScanTime = 0;

/**
 * Scrapes the city/region Health index (Kesehatan) and region name from the dashboard DOM.
 * Cached for 30s in Eco-Mode to eliminate repetitive DOM querying every second.
 * @param {boolean} [force=false]
 * @returns {{ name: string, level: number, bonusPercent: number, bonusMultiplier: number }}
 */
/**
 * Reads the authoritative "Penuh dalam <time>" string directly from the game's dashboard DOM.
 * @returns {string|null} e.g. "1 j", "45 mnt", "1 j 15 mnt"
 */
export function getGameEnergyFullText() {
    try {
        const isExcluded = el => Boolean(
            el.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast')
        );
        const energyHeaders = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p');
        for (const h of energyHeaders) {
            if (isExcluded(h)) continue;
            const t = (h.textContent || '').trim();
            if (/^(?:\u26A1)?\s*(?:ENERGI|ENERGY)\b/i.test(t) && t.length <= 25) {
                let card = h.parentElement;
                for (let level = 0; level < 4 && card && card !== document.body; level++) {
                    const txt = card.innerText || card.textContent || '';
                    const m = txt.match(/Penuh\s+dalam\s+([0-9\sA-Za-z<]+?)(?:\n|$|\.|\()/i);
                    if (m && m[1]) {
                        const raw = m[1].trim();
                        if (raw.length > 0 && raw.length <= 15) return raw;
                    }
                    card = card.parentElement;
                }
            }
        }
        const bodyText = document.body ? (document.body.innerText || '') : '';
        const m = bodyText.match(/Penuh\s+dalam\s+([0-9\sA-Za-z<]+?)(?:\n|$|\.|\()/i);
        if (m && m[1]) {
            const raw = m[1].trim();
            if (raw.length > 0 && raw.length <= 15) return raw;
        }
    } catch { /* ignore */ }
    return null;
}

export function invalidateRegionCache() {
    _lastRegionScanTime = 0;
    _cachedRegionDetails = null;
}

if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => { _lastRegionScanTime = 0; });
}

export function getRegionDetails(force = false) {
    if (typeof document === 'undefined') {
        return { name: 'Wilayah', level: 0, bonusPercent: 0, bonusMultiplier: 1.0 };
    }
    const now = Date.now();
    // Cache region details for 5 minutes (300,000ms) unless explicitly forced or on route change.
    // In Parlamentum, player region and health bonus never change during normal gameplay without traveling.
    if (!force && _cachedRegionDetails && (now - _lastRegionScanTime < 300000 || !isDashboardPage())) {
        return _cachedRegionDetails;
    }
    let name = '';
    let level = 0;
    let bonusPercent = 0;
    let scrapedRate = 0;
    let bodyText = '';

    try {
        // Collect text from targeted region/header containers first to avoid triggering full-body DOM reflow
        const textParts = [];
        const topContainer = document.querySelector('header, nav, [class*="topbar" i], [class*="region" i], [data-testid="region-index-health"]')?.closest('div, section') || null;
        if (topContainer) {
            textParts.push(topContainer.innerText || topContainer.textContent || '');
        } else if (document.body) {
            textParts.push(document.body.innerText || '');
        }

        const tooltips = document.querySelectorAll('[role="tooltip"], [data-radix-popper-content-wrapper], [class*="tooltip" i], [class*="popover" i]');
        for (const tip of tooltips) {
            textParts.push(tip.innerText || tip.textContent || '');
        }
        bodyText = textParts.join('\n');

        // 1. Region Name Priority A: "Kamu di sini — <Wilayah>"
        const kamuMatch = bodyText.match(/Kamu\s+di\s+sini\s*[—–-]\s*([A-Za-zÀ-ÿ\s]{2,30})/i);
        if (kamuMatch && kamuMatch[1]) {
            name = kamuMatch[1].trim();
        }

        // Priority B: "DITEMPATKAN DI \n <Wilayah>"
        if (!name) {
            const ditempatkanMatch = bodyText.match(/DITEMPATKAN\s+DI[^\n]*\n+([A-Za-zÀ-ÿ\s]{2,30})\n/i);
            if (ditempatkanMatch && ditempatkanMatch[1]) {
                const cand = ditempatkanMatch[1].trim();
                if (!/^(?:DI\s+PETA|PETA|MAP)\b/i.test(cand)) {
                    name = cand;
                }
            }
        }

        // Priority C: "Negara Kesatuan Republik Indonesia \n <Wilayah>"
        if (!name) {
            const nkriMatch = bodyText.match(/(?:Negara\s+Kesatuan\s+Republik\s+Indonesia|NKRI)[^\n]*\n+([A-Za-zÀ-ÿ\s]{2,30})\n/i);
            if (nkriMatch && nkriMatch[1]) {
                name = nkriMatch[1].trim();
            }
        }

        // Priority D: Topbar header
        if (!name) {
            const topMatch = bodyText.match(/\d\d:\d\d\s+UTC\s*\n*([A-Za-zÀ-ÿ\s]{2,30})/i);
            if (topMatch && topMatch[1]) {
                name = topMatch[1].trim();
            }
        }

        // Clean and format name to Title Case
        if (name) {
            name = name.split('\n')[0].trim();
            name = name.toLowerCase().replace(/\b[a-zÀ-ÿ]/g, c => c.toUpperCase());
        }

        // 2. Health Level / Regen Bonus & Rate Detection
        // Priority A: Scrape exact rate from game tooltip: "+1.54 / mnt" or "+1.5 / mnt"
        const rateMatch = bodyText.match(/(?:REGENERASI\s+ENERGI[^\n\d]*)?\+([0-9.]+)\s*\/\s*(?:mnt|min)/i);
        if (rateMatch && rateMatch[1]) {
            const val = parseFloat(rateMatch[1]);
            if (val >= 0.5 && val <= 10.0) {
                scrapedRate = val;
            }
        }

        // Priority B: Check for explicit tooltip "Kesehatan kota: +55%" or "+50%"
        const tipMatch = bodyText.match(/Kesehatan\s*(?:kota|wilayah)?\s*:\s*\+?(\d+)%/i);
        if (tipMatch && tipMatch[1]) {
            bonusPercent = parseInt(tipMatch[1], 10);
            level = Math.round(bonusPercent / 5);
        }

        // Priority C: Check for Crown Bonus multiplier: e.g. "BONUS INDEKS *1.10" or "BONUS INDEKS ×1.10"
        let crownMult = 1.0;
        const crownMatch = bodyText.match(/BONUS\s+INDEKS[^\d\n]*(\d+(?:\.\d+)?)/i);
        if (crownMatch && crownMatch[1]) {
            const parsedCrown = parseFloat(crownMatch[1]);
            if (parsedCrown >= 1.0 && parsedCrown <= 2.0) {
                crownMult = parsedCrown;
            }
        }

        // Priority D: Check for "KESEHATAN 10" in the index card
        if (!level && !bonusPercent) {
            const kesMatch = bodyText.match(/\bKESEHATAN\b[^\d\n]*(\d+)/i);
            if (kesMatch && kesMatch[1]) {
                level = parseInt(kesMatch[1], 10);
                // Health bonus = 5 * level * crownMult (e.g. 10 * 5 * 1.10 = 55%)
                bonusPercent = Math.round(level * 5 * crownMult);
            }
        }

        // Priority E: Check for data-testid as fallback
        if (!level && !bonusPercent) {
            const el = document.querySelector('[data-testid="region-index-health"]');
            if (el) {
                const aria = el.querySelector('[aria-label*="Kesehatan"]')?.getAttribute('aria-label');
                const m = aria?.match(/Kesehatan\s+(\d+)/i);
                if (m) {
                    level = parseInt(m[1], 10);
                    bonusPercent = Math.round(level * 5 * crownMult);
                }
            }
        }
    } catch (err) {
        console.error('[getRegionDetails] Error:', err);
    }

    // Mathematical calibration between bonusPercent and scrapedRate
    if (scrapedRate > 0 && !bonusPercent) {
        bonusPercent = Math.round((scrapedRate - 1) * 100);
    }
    if (bonusPercent > 0 && !scrapedRate) {
        // Parlamentum formula: tick interval = round(60 / (1 + bonus/100)), rate = 60 / tickSec
        const mult = 1 + (bonusPercent / 100);
        const tickSec = Math.round(60 / mult);
        scrapedRate = Math.round((60 / tickSec) * 100) / 100;
    }

    level = Math.max(0, Math.min(15, level || Math.round(bonusPercent / 5)));
    if (!bonusPercent && level > 0) {
        bonusPercent = level * 5;
    }

    // Preserve previously confirmed higher values for the same region (prevents drop if tooltip unmounts)
    if (_cachedRegionDetails && _cachedRegionDetails.name === (name || _cachedRegionDetails.name)) {
        if (_cachedRegionDetails.bonusPercent > bonusPercent && !bodyText.includes('Kesehatan')) {
            bonusPercent = _cachedRegionDetails.bonusPercent;
        }
        if (_cachedRegionDetails.bonusMultiplier > scrapedRate && !bodyText.includes('/mnt')) {
            scrapedRate = _cachedRegionDetails.bonusMultiplier;
        }
    }

    const finalMultiplier = scrapedRate > 0 ? scrapedRate : (1 + (bonusPercent / 100));

    const result = {
        name: name || (_cachedRegionDetails?.name) || 'Jawa Barat',
        level,
        bonusPercent: bonusPercent || (_cachedRegionDetails?.bonusPercent) || 0,
        bonusMultiplier: finalMultiplier || 1.0
    };

    if (name || level > 0 || bonusPercent > 0 || scrapedRate > 0) {
        _cachedRegionDetails = result;
        _lastRegionScanTime = now;
    }

    return result;
}

/**
 * Scrapes the city/region Health index (Kesehatan) from the dashboard DOM.
 * Each level of Health gives +5% passive energy recovery.
 * E.g., Level 9/10 in Jakarta gives +45% bonus -> multiplier 1.45.
 * @returns {number} Multiplier (e.g. 1.45, or 1.0 if not found)
 */
export function getRegionHealthBonus() {
    return getRegionDetails().bonusMultiplier;
}

/** Milliseconds remaining until sleep hours conclude */
export function getMsUntilSleepEnd(CONFIG) {
    const now = new Date();
    const end = new Date();
    end.setHours(CONFIG.sleepEndHour ?? 6, 0, 0, 0);
    if (end <= now) end.setDate(end.getDate() + 1);
    return Math.max(1000, end.getTime() - now.getTime());
}

/** @param {object} CONFIG @returns {boolean} */
export function isEnergyFlushActive(CONFIG) {
    if (!CONFIG?.energyFlushEnabled) return false;
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    // 23:15 s/d 23:59 UTC (45 menit sebelum reset server harian)
    return utcHours === 23 && utcMinutes >= 15;
}

/** @param {object} state @param {object} CONFIG @returns {number} */
export function getEffectiveEnergyThreshold(state, CONFIG) {
    if (isEnergyFlushActive(CONFIG)) {
        // If server recently rejected with "not enough energy to produce even one unit",
        // temporarily suspend flush and respect the user's normal threshold
        if (state?.energyFlushLockoutUntil && Date.now() < state.energyFlushLockoutUntil) {
            return CONFIG?.energyThreshold || 20;
        }
        // If the workplace unit production requires more than 10 EN (e.g. 20 EN for 8 XP),
        // use that requirement so we never send invalid requests
        const minCost = state?.unitEnergyCost || 10;
        return Math.min(CONFIG?.energyThreshold || minCost, minCost);
    }
    const base = CONFIG?.energyThreshold || 10;
    if (CONFIG?.energyThresholdJitterEnabled && !isEnergyFlushActive(CONFIG)) {
        const offset = getEnergyJitterOffset(CONFIG);
        const maxEn = state?.maxEnergy || 115;
        return Math.max(10, Math.min(maxEn, base + offset));
    }
    return base;
}

/** @param {object} state @param {object} CONFIG @returns {number} milliseconds to wait */
export function getNextWorkDelay(state, CONFIG) {
    if (isSleepTime(CONFIG)) {
        return getMsUntilSleepEnd(CONFIG);
    }

    const isFlush = isEnergyFlushActive(CONFIG);
    let threshold = getEffectiveEnergyThreshold(state, CONFIG);

    if (!isFlush && CONFIG.stealthJitterEnabled) {
        // Humanizer: variasi Gaussian (0 s/d +2 energi, tidak pernah kurang dari threshold user)
        const variance = Math.max(0, Math.round(gaussianRandom(0.4, 0.8, 0, 2)));
        threshold = Math.min(100, Math.max(10, threshold + variance));
    }

    if (state.currentEnergy >= threshold) {
        // Dynamic Humanizer Timing Jitter: kurva reaksi normal Gaussian
        if (CONFIG.stealthJitterEnabled) {
            const maxJitter = (CONFIG.stealthJitterMaxSeconds || 25) * 1000;
            return getHumanJitter(4000, maxJitter, 7000 + (maxJitter - 4000) * 0.28);
        }
        return 3000;
    }

    const energyNeeded = threshold - state.currentEnergy;
    const regenRate = state.regenRate || getRegionHealthBonus() || 1.0;
    state.regenRate = regenRate;
    const msNeeded = (energyNeeded / regenRate) * 60000;
    const jitter = getHumanJitter(2500, 8500, 4800);
    return Math.round(msNeeded + jitter);
}

/** @param {object} state @param {object} CONFIG @returns {string} */
export function getLiveCountdown(state, CONFIG) {
    if (isSleepTime(CONFIG)) return 'Tidur';

    // Check Micro-Breaks
    const brk = checkMicroBreak(state, CONFIG);
    if (brk.inBreak) {
        const m = Math.ceil(brk.remainingMs / 60000);
        return `Istirahat ${m}m`;
    }

    // Check Network Backoff
    if (state.backoffUntil && Date.now() < state.backoffUntil) {
        const total = Math.ceil((state.backoffUntil - Date.now()) / 1000);
        return `Retry ${total}s`;
    }

    if (isDashboardPage() && !state.hasInitialDomEnergyRead && (!state.currentEnergy || state.currentEnergy <= 0)) {
        return 'Sinkronisasi...';
    }
    const isFlush = isEnergyFlushActive(CONFIG);
    const threshold = getEffectiveEnergyThreshold(state, CONFIG);
    const curEnergy = state.currentEnergy ?? 0;
    const regenRate = Math.max(0.5, state.regenRate || 1.0);

    // 1. Check if server cooldown or rejection penalty is active
    if (state.serverCooldownUntil && Date.now() < state.serverCooldownUntil) {
        const remaining = state.serverCooldownUntil - Date.now();
        const total = Math.ceil(remaining / 1000);
        return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
    }

    // 2. Ready to work
    if (curEnergy >= threshold) {
        if (state.nextWorkTimestamp && state.nextWorkTimestamp > Date.now()) {
            const jitterSec = Math.ceil((state.nextWorkTimestamp - Date.now()) / 1000);
            if (jitterSec > 0 && jitterSec <= 35) {
                return `${jitterSec}s`;
            }
        }
        return isFlush ? 'Flush!' : 'Siap';
    }

    // 3. Below threshold: accurately compute time needed based on regeneration rate
    const energyNeeded = Math.max(1, threshold - curEnergy);
    let remainingMs = Math.round((energyNeeded / regenRate) * 60000);

    // If a future schedule is set and roughly aligns with energy regeneration, synchronize with it
    if (state.nextWorkTimestamp && state.nextWorkTimestamp > Date.now()) {
        const schedMs = state.nextWorkTimestamp - Date.now();
        if (schedMs >= remainingMs - 120000) {
            remainingMs = schedMs;
        }
    }

    if (remainingMs <= 0) return isFlush ? 'Flush...' : 'Menunggu energi...';
    const total = Math.ceil(remainingMs / 1000);
    return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

/** @param {object} state @returns {string} */
export function getTimeToFullEnergy(state) {
    if (isDashboardPage() && !state.hasInitialDomEnergyRead && (!state.currentEnergy || state.currentEnergy <= 0)) {
        return 'Sinkronisasi...';
    }
    const maxE = Math.max(50, state.maxEnergy || 115);
    const curE = Math.max(0, state.currentEnergy ?? 0);
    const needed = Math.max(0, maxE - curE);
    if (needed <= 0) return 'Penuh!';

    // Priority 1: Use authoritative game DOM text if available (matches game 100%)
    const gameFull = getGameEnergyFullText();
    if (gameFull) {
        return gameFull.replace(/\s+/g, ' ').trim();
    }

    const regenRate = Math.max(0.5, state.regenRate || 1.0);
    const exactMinutes = Math.max(1, Math.round(needed / regenRate));

    if (exactMinutes < 60) {
        return `~${exactMinutes} mnt`;
    }
    const h = Math.max(0, Math.floor(exactMinutes / 60));
    const m = Math.max(0, exactMinutes % 60);
    if (m === 0) return `~${h}j`;
    if (h < 24) return `~${h}j ${m}m`;
    const d = Math.floor(h / 24);
    return `~${d}h ${h % 24}j`;
}

let _playerLevelLastScan = 0;

/** @param {object} state @returns {number} */
export function getPlayerLevel(state) {
    if (Date.now() - _playerLevelLastScan < 10000) return state.playerLevel;
    _playerLevelLastScan = Date.now();
    try {
        const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const m = node.textContent.trim().match(/^Level\s+(\d+)$/i);
            if (m) return parseInt(m[1], 10);
        }
    } catch { /* ignore */ }
    return state.playerLevel;
}

/** @param {number} level @returns {number} */
export function getMaxEnergyForLevel(level) {
    return Math.min(300, 100 + 5 * (level - 1));
}

/**
 * Intentionally a complete safe NO-OP:
 * Never mutate or tamper with the host page React DOM text nodes or progress bars.
 * Doing so wipes React virtual DOM bindings, creates visual glitches, and confuses
 * the extension's ground-truth DOM scrapers.
 * 
 * @param {number} current
 * @param {number} [max]
 * @param {boolean} [force=false]
 */
export function patchPageVisualEnergy(current, max, force = false) {
    return false;
}

let _lastLoggedFoodCap = null;
let _lastLoggedEatenCount = null;

/**
 * Reads the official bread / rations quota directly from the game's dashboard DOM.
 * Element: <span data-testid="bread-today">Sisa roti hari ini 9/20</span>
 *
 * Accurately extracts:
 * - maxFoodDaily (10 for standard, 20 for premium)
 * - foodEatenToday (maxFoodDaily - remaining)
 *
 * @param {object} state
 * @param {object} CONFIG
 * @param {Function} [log]
 * @returns {{ remaining: number, maxCap: number, eaten: number, changed: boolean }|null}
 */
export function readBreadQuotaFromDom(state, CONFIG, log = null) {
    if (typeof document === 'undefined') return null;
    if (!isDashboardPage()) return null;

    const isExcluded = el => Boolean(el?.closest?.('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast'));

    try {
        // Priority 1: Official data-testid="bread-today"
        let el = document.querySelector('[data-testid="bread-today"]');
        if (el && isExcluded(el)) el = null;

        // Priority 2: Inside [data-testid="rations"]
        if (!el) {
            const rations = document.querySelector('[data-testid="rations"]');
            if (rations && !isExcluded(rations)) {
                el = rations.querySelector('[data-testid="bread-today"]') ||
                     rations.querySelector('span.tabular-nums');
            }
        }

        // Priority 3: Fuzzy text search for "sisa roti"
        if (!el) {
            const spans = document.querySelectorAll('span, p, div');
            for (const s of spans) {
                if (isExcluded(s)) continue;
                const txt = (s.textContent || '').trim();
                if (/sisa\s*roti/i.test(txt) && /\d+\s*\/\s*\d+/.test(txt)) {
                    el = s;
                    break;
                }
            }
        }

        if (!el) return null;

        const text = (el.textContent || '').trim();
        const match = text.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
        if (!match) return null;

        const remaining = parseInt(match[1], 10);
        const maxCap = parseInt(match[2], 10);

        if (isNaN(remaining) || isNaN(maxCap) || maxCap < 5 || maxCap > 50) return null;

        const eaten = Math.max(0, Math.min(maxCap, maxCap - remaining));
        let changed = false;

        // 1. Synchronize maxFoodDaily (Standard 10 vs Premium 20)
        if (CONFIG && (CONFIG.maxFoodDaily !== maxCap || state.maxFoodDaily !== maxCap)) {
            const prevCap = CONFIG.maxFoodDaily;
            CONFIG.maxFoodDaily = maxCap;
            state.maxFoodDaily = maxCap;
            setValue('aw_maxFoodDaily', maxCap.toString());
            setValue('maxFoodDaily', maxCap);
            if (log && _lastLoggedFoodCap !== maxCap && prevCap && prevCap !== maxCap) {
                _lastLoggedFoodCap = maxCap;
                log(`[Auto Roti] Kuota roti otomatis terdeteksi dari game: ${maxCap} slot (${maxCap === 20 ? 'Akun Premium' : 'Akun Standar'}).`, 'info');
            }
            changed = true;
        }

        // 2. Synchronize foodEatenToday
        if (state.foodEatenToday !== eaten) {
            const prevEaten = state.foodEatenToday;
            state.foodEatenToday = eaten;
            setValue('aw_foodEatenToday', eaten.toString());
            broadcastTabMessage({
                type: 'FOOD_UPDATED',
                foodEatenToday: eaten,
                maxFoodDaily: maxCap,
                timestamp: Date.now()
            });
            if (log && prevEaten !== undefined && eaten > prevEaten && _lastLoggedEatenCount !== eaten) {
                _lastLoggedEatenCount = eaten;
                log(`Makan roti terdeteksi (+${eaten - prevEaten}): ${eaten}/${maxCap} slot (${remaining} sisa).`, 'info');
            }
            changed = true;
        }

        return { remaining, maxCap, eaten, changed };
    } catch {
        return null;
    }
}



