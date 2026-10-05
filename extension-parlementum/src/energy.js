/**
 * energy.js — DOM energy scraping and time-based sync estimation
 */

/** @returns {{ current: number, max: number }|null} */
export function getCurrentEnergy() {
    try {
        const isExcluded = el => Boolean(
            el.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast')
        );

        // ── Priority 1: Top Navigation Bar Spatial Search (Fastest: < 0.2ms) ──
        // Top header renders the compact pill with [⚡ 44/110] across all pages
        const topCandidates = document.querySelectorAll('header, nav, [role="banner"], [class*="nav" i], [class*="header" i], [class*="topbar" i], [class*="navbar" i]');
        for (const container of topCandidates) {
            if (isExcluded(container)) continue;
            const els = container.querySelectorAll('*');
            const matches = [];
            for (const el of els) {
                if (isExcluded(el)) continue;
                const text = (el.textContent || '').trim();
                if (!text.includes('/')) continue;
                if (text.length > 30) continue; // must be a compact pill/label
                const m = text.match(/(?:⚡|\b)(\d+)\s*\/\s*(\d+)\b/);
                if (m) {
                    const current = parseInt(m[1], 10), max = parseInt(m[2], 10);
                    if (max >= 50 && max <= 350 && current <= max) {
                        matches.push({ current, max, len: text.length });
                    }
                }
            }
            if (matches.length > 0) {
                matches.sort((a, b) => a.len - b.len);
                return { current: matches[0].current, max: matches[0].max };
            }
        }

        // ── Priority 2: Dedicated Dashboard "ENERGI" Card ─────────────────────
        // On parlamentum.org/dashboard, the main energy card has a heading with "ENERGI"
        const energyHeaders = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p');
        for (const h of energyHeaders) {
            if (isExcluded(h)) continue;
            const t = (h.textContent || '').trim();
            if (/^⚡?\s*(?:ENERGI|ENERGY)\b/i.test(t) && t.length <= 30) {
                // Search in parent card (up to 4 levels up)
                let card = h.parentElement;
                for (let level = 0; level < 4 && card && card !== document.body; level++) {
                    const innerEls = card.querySelectorAll('*');
                    for (const el of innerEls) {
                        if (isExcluded(el)) continue;
                        const txt = (el.textContent || '').trim();
                        if (!txt.includes('/') || txt.length > 25) continue;
                        const m = txt.match(/(?:⚡|\b)(\d+)\s*\/\s*(\d+)/);
                        if (m) {
                            const current = parseInt(m[1], 10), max = parseInt(m[2], 10);
                            if (max >= 50 && max <= 350 && current <= max) {
                                return { current, max };
                            }
                        }
                    }
                    const cardText = (card.textContent || '').trim();
                    const m = cardText.match(/(\d+)\s*\/\s*(\d+)/);
                    if (m) {
                        const current = parseInt(m[1], 10), max = parseInt(m[2], 10);
                        if (max >= 50 && max <= 350 && current <= max) {
                            return { current, max };
                        }
                    }
                    card = card.parentElement;
                }
            }
        }

        // ── Priority 3: Innermost Elements in Document with \d+/\d+ ──────────
        const allCandidates = document.querySelectorAll('div, span, p, a, button, [role="status"]');
        const matches = [];
        for (const el of allCandidates) {
            if (isExcluded(el)) continue;
            const text = (el.textContent || '').trim();
            if (!text.includes('/')) continue;
            if (text.length > 35) continue;
            const m = text.match(/(?:⚡|\b)(\d+)\s*\/\s*(\d+)\b/);
            if (m) {
                const current = parseInt(m[1], 10), max = parseInt(m[2], 10);
                if (max >= 50 && max <= 350 && current <= max) {
                    const hasIcon = text.includes('⚡') || Boolean(el.querySelector('svg'));
                    matches.push({ current, max, len: text.length, hasIcon });
                }
            }
        }

        if (matches.length > 0) {
            matches.sort((a, b) => (b.hasIcon ? 1 : 0) - (a.hasIcon ? 1 : 0) || a.len - b.len);
            return { current: matches[0].current, max: matches[0].max };
        }

        // ── Priority 4: Split React Spans (<span current> / <span max>) ──────
        const slashEls = document.querySelectorAll('span, div');
        for (const el of slashEls) {
            if (isExcluded(el)) continue;
            if ((el.textContent || '').trim() === '/') {
                const prev = el.previousElementSibling;
                const next = el.nextElementSibling;
                if (prev && next) {
                    const current = parseInt((prev.textContent || '').trim(), 10);
                    const max = parseInt((next.textContent || '').trim(), 10);
                    if (Number.isSafeInteger(current) && Number.isSafeInteger(max) && max >= 50 && max <= 350 && current <= max) {
                        return { current, max };
                    }
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
        const immediate = getCurrentEnergy();
        if (immediate) return resolve(immediate);

        const deadline = Date.now() + maxWaitMs;
        const observer = new MutationObserver(() => {
            const result = getCurrentEnergy();
            if (result) {
                observer.disconnect();
                resolve(result);
            } else if (Date.now() >= deadline) {
                observer.disconnect();
                resolve(null);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // Safety timeout in case MutationObserver doesn't fire
        setTimeout(() => {
            observer.disconnect();
            resolve(getCurrentEnergy());
        }, maxWaitMs);
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
 * Returns energy using page DOM when visible, or time-based estimation when tab is in background.
 * @param {object} state
 */
export function getSyncedEnergy(state) {
    const isHidden = typeof document !== 'undefined' && document.hidden;
    const now      = Date.now();

    // 1. Eco Mode / Background Tab: Use O(1) mathematical calculation when invisible
    // Eliminates redundant DOM traversal while running smoothly in background!
    if (isHidden && state.energySyncBase && typeof state.energySyncBase.current === 'number') {
        const syncBase = state.energySyncBase;
        const max = syncBase.max || state.maxEnergy || 115;
        const elapsedMins = syncBase.updatedAt ? (now - syncBase.updatedAt) / 60000 : 0;
        const regenRate = state.regenRate || 1.0;
        const gained = Math.floor(elapsedMins * regenRate);
        const calculated = Math.min(max, syncBase.current + Math.max(0, gained));
        return { current: calculated, max };
    }

    const pageEnergy = getCurrentEnergy();

    // 2. Stale DOM protection: If a shift occurred recently (within 5 minutes),
    // an un-refreshed background tab still has the old pre-shift HTML in memory.
    if (state.lastWorkTimestamp && (now - state.lastWorkTimestamp < 300000)) {
        const elapsedMins = Math.floor((now - state.lastWorkTimestamp) / 60000);
        const postShiftEnergy = state.postShiftEnergy ?? 0;
        const theoreticalMax = Math.min(state.maxEnergy || 115, postShiftEnergy + elapsedMins);
        if (pageEnergy && pageEnergy.current > theoreticalMax + 2) {
            // DOM still displays old pre-shift number. Use legitimate regenerated energy.
            return { current: theoreticalMax, max: state.maxEnergy || 115 };
        }
    }

    // 3. Visible DOM is ground truth when page is active and not hidden
    if (pageEnergy && !isHidden && !state.domEnergyStale) {
        state.domEnergyStale = false;
        if (!state.energySyncBase || state.energySyncBase.current !== pageEnergy.current || state.energySyncBase.max !== pageEnergy.max) {
            state.energySyncBase = { current: pageEnergy.current, max: pageEnergy.max, updatedAt: now };
        }
        return pageEnergy;
    }

    // 4. Fallback estimation when DOM is empty or transitioning
    const syncBase = state.energySyncBase;
    if (syncBase && typeof syncBase.current === 'number') {
        const max = syncBase.max || state.maxEnergy || 115;
        const elapsedMins = syncBase.updatedAt ? (now - syncBase.updatedAt) / 60000 : 0;
        const regenRate = state.regenRate || 1.0;
        const gained = Math.floor(elapsedMins * regenRate);
        const calculated = Math.min(max, syncBase.current + Math.max(0, gained));
        return { current: calculated, max };
    }

    if (pageEnergy) {
        return pageEnergy;
    }

    return { current: state.currentEnergy || 0, max: state.maxEnergy || 115 };
}

/** Checks if current local time is within configured sleep hours */
export function isSleepTime(CONFIG) {
    if (!CONFIG?.sleepScheduleEnabled) return false;
    const now = new Date();
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
export function getRegionDetails(force = false) {
    if (typeof document === 'undefined') {
        return { name: 'Wilayah', level: 0, bonusPercent: 0, bonusMultiplier: 1.0 };
    }
    const now = Date.now();
    if (!force && _cachedRegionDetails && (now - _lastRegionScanTime < 30000)) {
        return _cachedRegionDetails;
    }
    let name = '';
    let level = 0;
    try {
        // 1. Check for "DITEMPATKAN DI" card heading
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p');
        for (const h of allHeadings) {
            const txt = (h.textContent || '').trim();
            if (/^DITEMPATKAN\s+DI\b/i.test(txt) && txt.length < 30) {
                let next = h.nextElementSibling;
                if (!next && h.parentElement) {
                    const children = Array.from(h.parentElement.children);
                    const idx = children.indexOf(h);
                    if (idx !== -1 && idx + 1 < children.length) {
                        next = children[idx + 1];
                    }
                }
                if (next) {
                    const candidate = (next.textContent || '').trim();
                    if (candidate && candidate.length < 40) {
                        name = candidate;
                        break;
                    }
                }
            }
        }

        // 2. Fallback: check user profile subtitle under avatar (e.g. "Jakarta, Negara Kesatuan...")
        if (!name) {
            const topbar = document.querySelector('header, nav, [role="banner"]');
            if (topbar) {
                const subtext = topbar.querySelectorAll('span, div, p');
                for (const st of subtext) {
                    const t = (st.textContent || '').trim();
                    if (t.includes('Negara Kesatuan Republik') || t.includes('USD')) {
                        const parts = t.split(/[,·]/);
                        if (parts.length > 0 && parts[0].trim().length < 30) {
                            name = parts[0].trim();
                            break;
                        }
                    }
                }
            }
        }

        // 3. Health bonus level
        const el = document.querySelector('[data-testid="region-index-health"]');
        if (el) {
            const aria = el.querySelector('[aria-label*="Kesehatan"]')?.getAttribute('aria-label');
            const ariaMatch = aria?.match(/Kesehatan\s+(\d+)/i);
            if (ariaMatch) {
                level = parseInt(ariaMatch[1], 10);
            } else {
                const text = (el.textContent || '').trim();
                const matches = text.match(/\b([0-9]|10)\b/g);
                if (matches && matches.length > 0) {
                    level = parseInt(matches[matches.length - 1], 10);
                }
            }
        }
    } catch { /* ignore */ }

    level = Math.max(0, Math.min(10, level));
    const bonusPercent = level * 5;
    const bonusMultiplier = 1 + (bonusPercent / 100);

    const result = {
        name: name || 'Wilayah',
        level,
        bonusPercent,
        bonusMultiplier
    };
    _cachedRegionDetails = result;
    _lastRegionScanTime = now;
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

/** @param {object} state @param {object} CONFIG @returns {number} milliseconds to wait */
export function getNextWorkDelay(state, CONFIG) {
    if (isSleepTime(CONFIG)) {
        return getMsUntilSleepEnd(CONFIG);
    }

    let threshold = CONFIG.energyThreshold;
    if (CONFIG.stealthJitterEnabled) {
        // Humanizer: variasi acak -1 s/d +2 energi
        const variance = Math.floor(Math.random() * 4) - 1;
        threshold = Math.min(100, Math.max(10, threshold + variance));
    }

    if (state.currentEnergy >= threshold) return 3000;
    const energyNeeded = threshold - state.currentEnergy;
    const regenRate = state.regenRate || getRegionHealthBonus() || 1.0;
    state.regenRate = regenRate;
    const msNeeded = (energyNeeded / regenRate) * 60000;
    const jitter = Math.floor(Math.random() * 7000) + 3000;
    return Math.round(msNeeded + jitter);
}

/** @param {object} state @param {object} CONFIG @returns {string} */
export function getLiveCountdown(state, CONFIG) {
    if (isSleepTime(CONFIG)) return '🌙 Tidur';
    const threshold = CONFIG.energyThreshold || 10;
    const curEnergy = state.currentEnergy ?? 0;
    if (curEnergy >= threshold) return 'Now!';
    let remaining = (state.nextWorkTimestamp || 0) - Date.now();
    if (!state.nextWorkTimestamp && curEnergy < threshold) {
        const regenRate = state.regenRate || 1.0;
        remaining = Math.max(1, (threshold - curEnergy) / regenRate) * 60000;
    }
    if (remaining <= 0) return 'Menunggu energi...';
    const total = Math.ceil(remaining / 1000);
    return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

/** @param {object} state @returns {string} */
export function getTimeToFullEnergy(state) {
    const needed = state.maxEnergy - state.currentEnergy;
    if (needed <= 0) return 'Penuh!';
    const regenRate = state.regenRate || 1.0;
    const minutes = Math.ceil(needed / regenRate);
    if (minutes < 60) return `~${minutes}m`;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    if (h < 24) return `~${h}h ${m}m`;
    const d = Math.floor(h / 24);
    return `~${d}d ${h % 24}h`;
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

let _lastPatchedCurrent = null;
let _lastPatchedMax = null;
let _lastPatchTime = 0;

/**
 * Safely updates the visual energy indicators on the host page (top navigation pill,
 * dashboard "ENERGI" card, progress bar, and "KERJAKAN SATU GILIRAN" button state).
 * 
 * Modifies text values via existing text nodes (node.nodeValue) and element styles
 * without destroying or replacing React DOM elements.
 * 
 * @param {number} current
 * @param {number} [max]
 * @param {boolean} [force=false]
 */
export function patchPageVisualEnergy(current, max, force = false) {
    if (typeof document === 'undefined') return;
    try {
        const safeCurrent = Math.max(0, Math.round(current));
        const safeMax = (typeof max === 'number' && max > 0) ? Math.round(max) : 115;
        const now = Date.now();

        // Throttle redundant calls if energy hasn't changed within 1000ms
        if (!force && safeCurrent === _lastPatchedCurrent && safeMax === _lastPatchedMax && (now - _lastPatchTime < 1000)) {
            return;
        }
        _lastPatchedCurrent = safeCurrent;
        _lastPatchedMax = safeMax;
        _lastPatchTime = now;

        const pct = Math.min(100, Math.max(0, (safeCurrent / safeMax) * 100)).toFixed(1);

        const FORBIDDEN_WORDS = /(?:KESEHATAN|PENDIDIKAN|MILITER|INDUSTRI|LISTRIK|KAPASITAS|MISI|KEMAJUAN|KEKUATAN|EKONOMI|KOTA|INFRASTRUKTUR|PASAR|BARANG)/i;

        const isExcluded = el => {
            if (!el) return true;
            if (el.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast')) return true;
            const container = el.closest('div, section, article');
            if (container) {
                const text = container.textContent || '';
                if (FORBIDDEN_WORDS.test(text) && !/^\s*⚡?\s*ENERGI\b/i.test(text)) {
                    return true;
                }
            }
            return false;
        };

        function patchTextInElement(el) {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node;
            let patched = false;
            while ((node = walker.nextNode())) {
                const val = node.nodeValue || '';
                if (val.includes('/') && /\d+\s*\/\s*\d+/.test(val)) {
                    node.nodeValue = val.replace(/(\d+)(\s*\/\s*)(\d+)/, (match, p1, p2, p3) => {
                        const mMax = parseInt(p3, 10);
                        if (mMax >= 50 && mMax <= 350) {
                            patched = true;
                            return `${safeCurrent}${p2}${safeMax || mMax}`;
                        }
                        return match;
                    });
                }
            }
            if (!patched) {
                const text = (el.textContent || '').trim();
                const m = text.match(/^(\d+)(\s*\/\s*)(\d+)$/);
                if (m) {
                    const mMax = parseInt(m[3], 10);
                    if (mMax >= 50 && mMax <= 350) {
                        const walker2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                        let firstTextNode = walker2.nextNode();
                        if (firstTextNode && /^\d+$/.test(firstTextNode.nodeValue?.trim() || '')) {
                            firstTextNode.nodeValue = String(safeCurrent);
                        }
                    }
                }
            }
        }

        // 1. Dashboard "ENERGI" card ONLY (Strictly isolated, never touching ancestor containers)
        const energyHeaders = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p');
        for (const h of energyHeaders) {
            if (isExcluded(h)) continue;
            const t = (h.textContent || '').trim();
            if (/^⚡?\s*(?:ENERGI|ENERGY)\b/i.test(t) && t.length <= 15) {
                let card = h.parentElement;
                while (card && card !== document.body) {
                    const cardText = (card.textContent || '').trim();
                    // STOP if it bleeds into other dashboard cards or widgets!
                    if (FORBIDDEN_WORDS.test(cardText)) break;

                    // The real energy card contains the energy numbers (e.g. 74/115) and has short text (< 120 chars)
                    if (cardText.includes('/') && /\d+\s*\/\s*\d+/.test(cardText) && cardText.length < 120) {
                        // Patch only text nodes with \d+/\d+ inside this exact energy card
                        const innerEls = card.querySelectorAll('*');
                        for (const el of innerEls) {
                            if (isExcluded(el)) continue;
                            const txt = (el.textContent || '').trim();
                            if (txt.includes('/') && txt.length <= 25 && /\d+\s*\/\s*\d+/.test(txt)) {
                                patchTextInElement(el);
                            }
                        }

                        // Patch ONLY the progress bar inside this isolated energy card
                        const bars = card.querySelectorAll('[role="progressbar"], div[style*="width"], span[style*="width"]');
                        for (const bar of bars) {
                            if (isExcluded(bar)) continue;
                            if (bar.style.width && bar.style.width.includes('%')) {
                                bar.style.width = `${pct}%`;
                            }
                            if (bar.hasAttribute('aria-valuenow')) {
                                bar.setAttribute('aria-valuenow', String(safeCurrent));
                            }
                            if (bar.hasAttribute('aria-valuemax')) {
                                bar.setAttribute('aria-valuemax', String(safeMax));
                            }
                        }
                        break; // Stop immediately after patching the isolated energy card
                    }
                    card = card.parentElement;
                }
            }
        }

        // 2. Top Navigation Bar energy pill ONLY (Text only, NEVER touch progress bars)
        const topCandidates = document.querySelectorAll('header, nav, [role="banner"], [class*="nav" i], [class*="header" i], [class*="topbar" i], [class*="navbar" i]');
        for (const container of topCandidates) {
            if (isExcluded(container)) continue;
            const els = container.querySelectorAll('*');
            for (const el of els) {
                if (isExcluded(el)) continue;
                const txt = (el.textContent || '').trim();
                if (txt.includes('/') && txt.length <= 30 && /\d+\s*\/\s*\d+/.test(txt)) {
                    patchTextInElement(el);
                }
            }
        }

        // 3. Work button visual state
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            if (isExcluded(btn)) continue;
            const btnText = (btn.textContent || '').trim();
            if (/KERJAKAN\s+SATU\s+GILIRAN/i.test(btnText)) {
                if (safeCurrent < 10) {
                    btn.style.opacity = '0.55';
                    btn.style.filter = 'grayscale(0.6)';
                    btn.title = `Energi saat ini ${safeCurrent}/${safeMax}⚡ (butuh minimal 10⚡ untuk giliran kerja)`;
                } else {
                    btn.style.opacity = '1';
                    btn.style.filter = 'none';
                    btn.title = '';
                }
            }
        }
    } catch { /* ignore */ }
}


