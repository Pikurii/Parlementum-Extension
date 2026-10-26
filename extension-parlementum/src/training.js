/**
 * training.js — Auto Training Engine for Parlementum
 *
 * Automates stat training (Kekuatan, Pendidikan, Ekonomi):
 * 1. Reads current stats, active training timer, and wallet gold from DOM
 * 2. Calculates gold costs & remaining training requirements
 * 3. Enforces priorities (Pendidikan, Ekonomi, Kekuatan, or Balanced)
 * 4. Protects wallet gold reserves (minGoldReserve)
 * 5. Dispatches train requests via DOM click with transparent API fallback
 * 6. Synchronizes countdown timers and updates panel real-time
 */

import { getValue, setValue } from './storage.js';
import { saveLiveStatus } from './state.js';
import { broadcastTabMessage } from './broadcast.js';
import { isDashboardPage } from './energy.js';

export const STAT_NAMES = {
    education: 'Pendidikan',
    economy:   'Ekonomi',
    strength:  'Kekuatan'
};

/**
 * Calculates total gold cost to level up from currentLevel to targetLevel
 * Arithmetic series: sum of (currentLevel + 1) to targetLevel
 * @param {number} currentLevel
 * @param {number} targetLevel
 * @returns {number}
 */
export function calculateGoldCost(currentLevel, targetLevel) {
    const cur = Math.max(0, parseInt(currentLevel, 10) || 0);
    const target = Math.max(0, parseInt(targetLevel, 10) || 0);
    if (target <= cur) return 0;
    const count = target - cur;
    return Math.round((count * (cur + 1 + target)) / 2);
}

/**
 * Calculates training duration in seconds for level n given Education level Sedu
 * Official formula from game documentation:
 * time(n) = round(0.2894 * (n ^ 2.5) * (1 / (1 + 0.01 * Sedu)))
 * @param {number} targetLevel
 * @param {number} educationLevel
 * @returns {number} duration in seconds (minimum 1s)
 */
export function calculateLevelTrainingSeconds(targetLevel, educationLevel = 0) {
    const n = Math.max(1, parseInt(targetLevel, 10) || 1);
    const sedu = Math.max(0, parseInt(educationLevel, 10) || 0);
    const raw = 0.2894 * Math.pow(n, 2.5) * (1 / (1 + 0.01 * sedu));
    return Math.max(1, Math.round(raw));
}

/**
 * Calculates total accumulated training duration in seconds from currentLevel to targetLevel
 * @param {number} currentLevel
 * @param {number} targetLevel
 * @param {number} currentEducationLevel
 * @param {boolean} isEducation
 * @returns {number} total seconds
 */
export function calculateTotalTrainingSeconds(currentLevel, targetLevel, currentEducationLevel = 0, isEducation = false) {
    const cur = Math.max(0, parseInt(currentLevel, 10) || 0);
    const target = Math.max(0, parseInt(targetLevel, 10) || 0);
    if (target <= cur) return 0;

    let totalSec = 0;
    const baseEdu = Math.max(0, parseInt(currentEducationLevel, 10) || 0);

    for (let lvl = cur + 1; lvl <= target; lvl++) {
        const effectiveEdu = isEducation ? (lvl - 1) : baseEdu;
        totalSec += calculateLevelTrainingSeconds(lvl, effectiveEdu);
    }
    return totalSec;
}

/**
 * Formats seconds into human-readable accumulated duration (Indonesian)
 * @param {number} totalSec
 * @returns {string} e.g. "~4 hari 12 jam", "~5 jam 30 mnt", "< 1 mnt"
 */
export function formatAccumulatedDuration(totalSec) {
    if (totalSec <= 0) return '0 dtk';
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);

    if (days > 0) {
        return hours > 0 ? `~${days} hari ${hours} jam` : `~${days} hari`;
    }
    if (hours > 0) {
        return minutes > 0 ? `~${hours} jam ${minutes} mnt` : `~${hours} jam`;
    }
    if (minutes > 0) {
        return `~${minutes} mnt`;
    }
    return '< 1 mnt';
}

/**
 * Formats milliseconds into a readable countdown string (e.g. "31m 44s" or "1j 15m")
 * @param {number} ms
 * @returns {string}
 */
export function formatTrainingDuration(ms) {
    if (ms <= 0) return '0s';
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (hours > 0) {
        return `${hours}j ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

/**
 * Calculates current training progress percentage (0 - 100)
 * Uses game DOM bar if detected, or official game formula:
 * time(n) = round(0.2894 * (n ^ 2.5) * (1 / (1 + 0.01 * Sedu)))
 * @param {object} activeTraining
 * @param {object} trainingStats
 * @returns {number} percentage 0 to 100
 */
export function getTrainingProgressPercentage(activeTraining, trainingStats = null) {
    if (!activeTraining || !activeTraining.endsAt) return 0;

    // 1. If DOM measured percentage is directly available, use it directly (100% sync with game)
    if (typeof activeTraining.domProgressPct === 'number' && activeTraining.domProgressPct >= 0 && activeTraining.domProgressPct <= 100) {
        return Math.max(0, Math.min(100, activeTraining.domProgressPct));
    }

    const endsMs = new Date(activeTraining.endsAt).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, endsMs - now);

    if (diffMs <= 0) return 100;

    const targetLevel = activeTraining.targetLevel || 1;
    const eduLevel = trainingStats?.education || 0;
    const formulaSec = calculateLevelTrainingSeconds(targetLevel, eduLevel);
    const totalSec = activeTraining.totalSeconds || formulaSec || 3600;
    const totalMs = totalSec * 1000;

    // Safety: total session duration cannot be less than remaining time
    const effectiveTotalMs = Math.max(totalMs, diffMs + 1000);
    const elapsedMs = Math.max(0, effectiveTotalMs - diffMs);
    const pct = Math.round((elapsedMs / effectiveTotalMs) * 100);

    return Math.max(0, Math.min(100, pct));
}

/**
 * Reads stat levels from DOM elements using data-testid attributes & section fallbacks
 * @param {object} state
 */
export function readTrainingStatsFromDom(state) {
    if (typeof document === 'undefined') return false;
    if (!isDashboardPage()) return false;

    if (!state.trainingStats) {
        state.trainingStats = { strength: 0, education: 0, economy: 0 };
    }

    let changed = false;
    const isExcluded = el => Boolean(el?.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast'));

    const statPatterns = {
        strength:  /KEKUATAN/i,
        education: /PENDIDIKAN/i,
        economy:   /EKONOMI|PRODUKSI/i
    };

    // Strategy 1: Targeted scrape inside LATIHAN section cards
    // Target button level: "BERLATIH KE LV 83" (target = 83 -> cur = 82)
    // "LATIH - LV 51" (target = 51 -> cur = 50)
    // "LATIH - LV 52" (target = 52 -> cur = 51)
    try {
        const trainingHeaders = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p');
        for (const h of trainingHeaders) {
            if (isExcluded(h)) continue;
            const txt = (h.textContent || '').trim();
            if (/^LATIHAN\b/i.test(txt) && txt.length <= 15) {
                let container = h.parentElement;
                for (let lvl = 0; lvl < 4 && container && container !== document.body; lvl++) {
                    const cards = container.querySelectorAll('div, li, section');
                    for (const node of cards) {
                        if (isExcluded(node)) continue;
                        const nTxt = node.textContent || '';

                        for (const [stat, pat] of Object.entries(statPatterns)) {
                            if (pat.test(nTxt)) {
                                // Priority 1: Match target level in button/action
                                // Target level is ALWAYS current level + 1!
                                const btnMatch = nTxt.match(/(?:LATIH|BERLATIH)\s*(?:-|KE)?\s*LV\s*(\d{1,3})/i);
                                if (btnMatch) {
                                    const targetLv = parseInt(btnMatch[1], 10);
                                    if (targetLv >= 1 && targetLv <= 500) {
                                        const curLv = targetLv - 1;
                                        if (curLv !== state.trainingStats[stat]) {
                                            state.trainingStats[stat] = curLv;
                                            setValue(`aw_stat_${stat}`, curLv.toString());
                                            changed = true;
                                        }
                                        break;
                                    }
                                }

                                // Priority 2: Standalone level number element (e.g. "82", "50", "51")
                                const leafNodes = node.querySelectorAll('span, div, p, b, strong, h1, h2, h3, h4');
                                for (const leaf of leafNodes) {
                                    if (isExcluded(leaf)) continue;
                                    const lTxt = (leaf.textContent || '').trim();
                                    const numMatch = lTxt.match(/^(\d{1,3})$/);
                                    if (numMatch) {
                                        const val = parseInt(numMatch[1], 10);
                                        if (val >= 1 && val <= 500 && val !== state.trainingStats[stat]) {
                                            state.trainingStats[stat] = val;
                                            setValue(`aw_stat_${stat}`, val.toString());
                                            changed = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    container = container.parentElement;
                }
            }
        }
    } catch { /* ignore fallback errors */ }

    // Strategy 2: Data-testid matching with strict single-number guard (< 500)
    const testIdMap = {
        strength:  ['stat-strength', 'stat-kekuatan'],
        education: ['stat-education', 'stat-pendidikan'],
        economy:   ['stat-economy', 'stat-production', 'stat-economic', 'stat-ekonomi']
    };

    for (const [stat, ids] of Object.entries(testIdMap)) {
        if (state.trainingStats[stat] > 0) continue; // Already set by Strategy 1
        for (const id of ids) {
            const el = document.querySelector(`[data-testid="${id}"]`);
            if (el && !isExcluded(el)) {
                const singleNumMatch = (el.textContent || '').trim().match(/^(\d{1,3})$/);
                if (singleNumMatch) {
                    const val = parseInt(singleNumMatch[1], 10);
                    if (val >= 0 && val <= 500 && val !== state.trainingStats[stat]) {
                        state.trainingStats[stat] = val;
                        setValue(`aw_stat_${stat}`, val.toString());
                        changed = true;
                    }
                }
                break;
            }
        }
    }

    // Read wallet gold from DOMPET widget
    readWalletGoldFromDom(state);

    // Read active training timer from DOM
    readActiveTrainingFromDom(state);

    return changed;
}

/**
 * Reads wallet gold specifically from the DOMPET section or top navigation bar
 * @param {object} state
 */
export function readWalletGoldFromDom(state) {
    if (typeof document === 'undefined') return 0;
    try {
        const isExcluded = el => Boolean(el?.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast'));

        // Strategy 0: Direct official Parlementum data-testid="wallet-gold" (Most Accurate)
        const testIdEl = document.querySelector('[data-testid="wallet-gold"]');
        if (testIdEl && !isExcluded(testIdEl)) {
            const raw = (testIdEl.textContent || '').trim();
            const clean = raw.replace(/[^\d]/g, '');
            const gold = parseInt(clean, 10);
            if (!isNaN(gold) && gold >= 0) {
                state.walletGold = gold;
                setValue('aw_wallet_gold', gold.toString());
                return gold;
            }
        }

        // Strategy 1: Find inside [data-testid="wallet"] or [data-testid="wallet-button"]
        const walletBox = document.querySelector('[data-testid="wallet"], [data-testid="wallet-button"]');
        if (walletBox && !isExcluded(walletBox)) {
            const goldSpan = walletBox.querySelector('[data-testid="wallet-gold"]') ||
                             walletBox.querySelector('.text-gold-light, [class*="text-gold"]') ||
                             walletBox.querySelector('svg.lucide-coins, svg[class*="lucide-coins"]')?.parentElement;
            if (goldSpan) {
                const clean = (goldSpan.textContent || '').replace(/[^\d]/g, '');
                const gold = parseInt(clean, 10);
                if (!isNaN(gold) && gold >= 0) {
                    state.walletGold = gold;
                    setValue('aw_wallet_gold', gold.toString());
                    return gold;
                }
            }
        }

        // Strategy 2: Scan for EMAS cards on Dashboard with comma/dot separator support (e.g. "3,739" or "3.739")
        const candidates = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p, aside, section');
        for (const el of candidates) {
            if (isExcluded(el)) continue;
            const t = (el.textContent || '').trim();
            if (/^EMAS\b/i.test(t) && t.length <= 15) {
                let box = el.parentElement;
                for (let i = 0; i < 4 && box && box !== document.body; i++) {
                    const boxTxt = box.textContent || '';
                    // Match "3,739" or "3.739" or "3739" near EMAS
                    const m = boxTxt.match(/(?:EMAS[\s\S]{0,25}?)?([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{1,7})(?:[\s\S]{0,25}?EMAS)?/i);
                    if (m && m[1]) {
                        const clean = m[1].replace(/[.,]/g, '').replace(/[^\d]/g, '');
                        const gold = parseInt(clean, 10);
                        if (!isNaN(gold) && gold >= 0) {
                            state.walletGold = gold;
                            setValue('aw_wallet_gold', gold.toString());
                            return gold;
                        }
                    }
                    box = box.parentElement;
                }
            }
        }

        // Strategy 3: Find container whose title/heading is "DOMPET"
        for (const h of candidates) {
            if (isExcluded(h)) continue;
            const txt = (h.textContent || '').trim();
            if (/^DOMPET\b/i.test(txt) && txt.length <= 25) {
                let card = h.parentElement;
                for (let lvl = 0; lvl < 5 && card && card !== document.body; lvl++) {
                    const cardTxt = card.textContent || '';
                    if (/EMAS/i.test(cardTxt)) {
                        const m1 = cardTxt.match(/EMAS[\s\S]{0,30}?([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{1,7})/i);
                        if (m1 && m1[1]) {
                            const clean = m1[1].replace(/[.,]/g, '').replace(/[^\d]/g, '');
                            const gold = parseInt(clean, 10);
                            if (!isNaN(gold) && gold >= 0) {
                                state.walletGold = gold;
                                setValue('aw_wallet_gold', gold.toString());
                                return gold;
                            }
                        }
                    }
                    card = card.parentElement;
                }
            }
        }

        // Strategy 4: Header/Navbar currency container ("9,587 USD \n [coin] 3,739")
        const topElements = document.querySelectorAll('header, nav, [class*="navbar"], [class*="header"], [class*="topbar"]');
        for (const bar of topElements) {
            if (isExcluded(bar)) continue;
            const barTxt = bar.textContent || '';
            if (/USD/i.test(barTxt)) {
                const nums = barTxt.match(/\b([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{1,7})\b/g);
                if (nums && nums.length >= 1) {
                    for (const raw of nums) {
                        const isUsd = new RegExp(`${raw.replace(/[.,]/g, '[.,]')}\\s*USD`, 'i').test(barTxt);
                        if (!isUsd) {
                            const clean = raw.replace(/[.,]/g, '').replace(/[^\d]/g, '');
                            const gold = parseInt(clean, 10);
                            if (!isNaN(gold) && gold >= 0) {
                                state.walletGold = gold;
                                setValue('aw_wallet_gold', gold.toString());
                                return gold;
                            }
                        }
                    }
                }
            }
        }
    } catch { /* ignore DOM scan errors */ }
    return state.walletGold || 0;
}

/**
 * Reads active training timer from DOM: [data-testid^="train-timer-"] or "BERLATIH" cards
 * @param {object} state
 */
export function readActiveTrainingFromDom(state) {
    if (typeof document === 'undefined') return;
    if (!isDashboardPage()) return;

    const isExcluded = el => Boolean(el?.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast'));

    // Strategy 1: Data-testid matching
    const timerEl = document.querySelector('[data-testid^="train-timer-"]');
    if (timerEl && !isExcluded(timerEl)) {
        const testId = timerEl.getAttribute('data-testid') || '';
        const stat = testId.replace('train-timer-', '').trim();
        const txt = (timerEl.textContent || '').trim().toLowerCase();

        let totalSec = 0;
        const hMatch = txt.match(/(\d+)\s*j/i);
        const mMatch = txt.match(/(\d+)\s*mnt/i);
        const sMatch = txt.match(/(\d+)\s*dtk/i);
        if (hMatch) totalSec += parseInt(hMatch[1], 10) * 3600;
        if (mMatch) totalSec += parseInt(mMatch[1], 10) * 60;
        if (sMatch) totalSec += parseInt(sMatch[1], 10);

        if (totalSec > 0) {
            const endsAtMs = Date.now() + totalSec * 1000;
            const currentEndsAtMs = state.activeTraining?.endsAt ? new Date(state.activeTraining.endsAt).getTime() : 0;
            const targetLevel = (state.trainingStats?.[stat] || 0) + 1;
            let totalSeconds = calculateLevelTrainingSeconds(targetLevel, state.trainingStats?.education || 0);

            // Read progress bar directly from active training card DOM!
            let domProgressPct = null;
            const card = timerEl.closest('li, div.mt-3, section') || timerEl.parentElement?.parentElement;
            if (card) {
                const widthEls = card.querySelectorAll('[style*="width"]');
                for (const el of widthEls) {
                    const w = el.style.width?.trim() || el.getAttribute('style') || '';
                    const m = w.match(/([\d.]+)%/);
                    if (m) {
                        const val = parseFloat(m[1]);
                        if (val >= 0 && val <= 100) {
                            domProgressPct = Math.round(val * 10) / 10;
                            break;
                        }
                    }
                }
                if (domProgressPct === null) {
                    const barContainer = card.querySelector('[class*="rounded-full"][class*="overflow-hidden"], [class*="bg-gold/[0.08]"]');
                    const barFill = barContainer?.querySelector('div');
                    if (barContainer && barFill && barContainer.offsetWidth > 10) {
                        const ratio = Math.round((barFill.offsetWidth / barContainer.offsetWidth) * 1000) / 10;
                        if (ratio >= 0 && ratio <= 100) {
                            domProgressPct = ratio;
                        }
                    }
                }
            }

            // If progress % from DOM is known (e.g. 5%), calculate exact total training duration
            if (domProgressPct !== null && domProgressPct > 0 && domProgressPct < 100) {
                const inferredTotal = Math.round(totalSec / (1 - (domProgressPct / 100)));
                if (inferredTotal > 0 && inferredTotal < 864000) {
                    totalSeconds = inferredTotal;
                }
            }

            if (!state.activeTraining || Math.abs(currentEndsAtMs - endsAtMs) > 8000 || state.activeTraining.stat !== stat) {
                state.activeTraining = {
                    stat,
                    endsAt: new Date(endsAtMs).toISOString(),
                    targetLevel,
                    totalSeconds,
                    domProgressPct
                };
                setValue('aw_active_training', state.activeTraining);
            } else {
                let updated = false;
                if (domProgressPct !== null && state.activeTraining.domProgressPct !== domProgressPct) {
                    state.activeTraining.domProgressPct = domProgressPct;
                    updated = true;
                }
                if (totalSeconds && state.activeTraining.totalSeconds !== totalSeconds) {
                    state.activeTraining.totalSeconds = totalSeconds;
                    updated = true;
                }
                if (updated) setValue('aw_active_training', state.activeTraining);
            }
            return;
        }
    }

    // Strategy 2: Scan LATIHAN section for active "BERLATIH" cards with live timers
    const statKeys = {
        strength:  /KEKUATAN/i,
        education: /PENDIDIKAN/i,
        economy:   /EKONOMI|PRODUKSI/i
    };

    const allHeaders = document.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p');
    for (const h of allHeaders) {
        if (isExcluded(h)) continue;
        const txt = (h.textContent || '').trim();
        if (/^LATIHAN\b/i.test(txt) && txt.length <= 15) {
            let container = h.parentElement;
            for (let lvl = 0; lvl < 4 && container && container !== document.body; lvl++) {
                const cTxt = container.textContent || '';
                if (/BERLATIH/i.test(cTxt)) {
                    const cards = container.querySelectorAll('div, section, li');
                    for (const card of cards) {
                        if (isExcluded(card)) continue;
                        const cardText = card.textContent || '';
                        // Must match active training verb "BERLATIH", not idle "LATIH"
                        if (/\bBERLATIH\b/i.test(cardText) && !/\bLATIH\s*-/i.test(cardText)) {
                            let activeStat = null;
                            for (const [st, regex] of Object.entries(statKeys)) {
                                if (regex.test(cardText)) {
                                    activeStat = st;
                                    break;
                                }
                            }
                            if (activeStat) {
                                const lvMatch = cardText.match(/BERLATIH\s*(?:KE\s*)?LV\s*(\d+)/i);
                                const targetLevel = lvMatch ? parseInt(lvMatch[1], 10) : ((state.trainingStats?.[activeStat] || 0) + 1);

                                let totalSec = 0;
                                const hMatch = cardText.match(/(\d+)\s*j(?:am)?\b/i);
                                const mMatch = cardText.match(/(\d+)\s*mnt\b/i);
                                const sMatch = cardText.match(/(\d+)\s*dtk\b/i);
                                if (hMatch) totalSec += parseInt(hMatch[1], 10) * 3600;
                                if (mMatch) totalSec += parseInt(mMatch[1], 10) * 60;
                                if (sMatch) totalSec += parseInt(sMatch[1], 10);

                                if (totalSec > 0) {
                                    const endsAtMs = Date.now() + totalSec * 1000;
                                    const currentEndsAtMs = state.activeTraining?.endsAt ? new Date(state.activeTraining.endsAt).getTime() : 0;
                                    const eduLevel = state.trainingStats?.education || 0;
                                    const totalSeconds = calculateLevelTrainingSeconds(targetLevel, eduLevel);

                                    // Detect DOM progress percentage if present in game card
                                    let domProgressPct = null;
                                    const widthEls = card.querySelectorAll('[style*="width"]');
                                    for (const el of widthEls) {
                                        const w = el.style.width?.trim() || el.getAttribute('style') || '';
                                        const m = w.match(/([\d.]+)%/);
                                        if (m) {
                                            const val = parseFloat(m[1]);
                                            if (val >= 0 && val <= 100) {
                                                domProgressPct = Math.round(val * 10) / 10;
                                                break;
                                            }
                                        }
                                    }
                                    if (domProgressPct === null) {
                                        const pb = card.querySelector('[role="progressbar"], [aria-valuenow]');
                                        if (pb) {
                                            const val = parseFloat(pb.getAttribute('aria-valuenow'));
                                            const max = parseFloat(pb.getAttribute('aria-valuemax') || '100');
                                            if (!isNaN(val) && max > 0) {
                                                domProgressPct = Math.round((val / max) * 100);
                                            }
                                        }
                                    }
                                    if (domProgressPct === null) {
                                        const candidates = card.querySelectorAll('div, span');
                                        for (const el of candidates) {
                                            const bg = window.getComputedStyle?.(el)?.backgroundColor || '';
                                            if (/rgb\(2[0-5]\d,\s*(?:1\d\d|2[0-5]\d),\s*\d+\)/.test(bg)) {
                                                const parent = el.parentElement;
                                                if (parent && parent.offsetWidth > 40 && el.offsetWidth > 0 && el.offsetWidth <= parent.offsetWidth) {
                                                    const ratio = Math.round((el.offsetWidth / parent.offsetWidth) * 100);
                                                    if (ratio > 0 && ratio <= 100) {
                                                        domProgressPct = ratio;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    if (!state.activeTraining || Math.abs(currentEndsAtMs - endsAtMs) > 8000 || state.activeTraining.stat !== activeStat) {
                                        state.activeTraining = {
                                            stat: activeStat,
                                            endsAt: new Date(endsAtMs).toISOString(),
                                            targetLevel,
                                            totalSeconds,
                                            domProgressPct
                                        };
                                        setValue('aw_active_training', state.activeTraining);
                                    } else {
                                        let updated = false;
                                        if (domProgressPct !== null && state.activeTraining.domProgressPct !== domProgressPct) {
                                            state.activeTraining.domProgressPct = domProgressPct;
                                            updated = true;
                                        }
                                        if (!state.activeTraining.totalSeconds || state.activeTraining.totalSeconds !== totalSeconds) {
                                            state.activeTraining.totalSeconds = totalSeconds;
                                            updated = true;
                                        }
                                        if (updated) setValue('aw_active_training', state.activeTraining);
                                    }
                                    return;
                                }
                            }
                        }
                    }
                }
                container = container.parentElement;
            }
        }
    }

    // Check if previous active training has expired
    if (state.activeTraining && state.activeTraining.endsAt) {
        const expiresAt = new Date(state.activeTraining.endsAt).getTime();
        if (Date.now() >= expiresAt) {
            state.activeTraining = null;
            setValue('aw_active_training', null);
        }
    }
}

/**
 * Dispatches a full, authentic synthetic event sequence to activate a button
 * Compatible with React 18, Radix UI Dialog primitives, and synthetic handlers.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export function clickElement(el) {
    if (!el) return false;

    try {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
    } catch {
        try { el.scrollIntoView(); } catch { /* ignore */ }
    }

    try {
        el.focus?.();
    } catch { /* ignore */ }

    const rect = el.getBoundingClientRect();
    const clientX = Math.round(rect.left + (rect.width > 0 ? rect.width / 2 : 10));
    const clientY = Math.round(rect.top + (rect.height > 0 ? rect.height / 2 : 10));

    const eventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX,
        clientY,
        screenX: clientX + (window.screenX || 0),
        screenY: clientY + (window.screenY || 0),
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
    };

    // 1. Pointer & Mouse down sequence (crucial for Radix UI Dialog)
    try {
        el.dispatchEvent(new PointerEvent('pointerover', eventInit));
        el.dispatchEvent(new MouseEvent('mouseover', eventInit));
        el.dispatchEvent(new PointerEvent('pointerdown', eventInit));
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
    } catch { /* ignore */ }

    // 2. Pointer & Mouse up sequence
    try {
        el.dispatchEvent(new PointerEvent('pointerup', eventInit));
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
    } catch { /* ignore */ }

    // 3. Native DOM click
    try {
        el.click();
    } catch { /* ignore */ }

    // 4. React Fiber / synthetic event handler invocation fallback
    try {
        const propKey = Object.keys(el).find(k => k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers'));
        if (propKey && typeof el[propKey]?.onClick === 'function') {
            el[propKey].onClick({
                preventDefault: () => {},
                stopPropagation: () => {},
                target: el,
                currentTarget: el,
                bubbles: true
            });
        }
    } catch { /* ignore */ }

    return true;
}

/**
 * Determines whether training is currently active (either via timer or disabled buttons)
 * @param {object} state
 * @returns {boolean}
 */
export function isTrainingActive(state) {
    // If confirmation modal is currently open in DOM, training is waiting for confirmation, NOT active yet!
    if (typeof document !== 'undefined') {
        if (getTrainingConfirmStartButton()) return false;
        if (document.querySelector('[data-testid="train-confirm"], [data-testid="train-confirm-start"], [data-testid="train-confirm-cancel"]')) {
            return false;
        }
    }

    if (state.activeTraining && state.activeTraining.endsAt) {
        if (new Date(state.activeTraining.endsAt).getTime() > Date.now()) {
            return true;
        }
    }
    if (typeof document !== 'undefined') {
        const timerEl = document.querySelector('[data-testid^="train-timer-"]');
        if (timerEl) return true;

        const disabledBtn = document.querySelector('[data-testid="train-strength"][disabled], [data-testid="train-education"][disabled], [data-testid="train-economy"][disabled], [data-testid="train-production"][disabled]');
        if (disabledBtn && document.querySelector('[data-testid="dash-training"]')) {
            const sectionText = document.querySelector('[data-testid="dash-training"]')?.textContent || '';
            if (/berlatih ke lv/i.test(sectionText)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Detects if the training confirmation popup ("MULAI PELATIHAN") is present in DOM
 * and returns the start button element.
 * @returns {HTMLButtonElement|null}
 */
export function getTrainingConfirmStartButton() {
    if (typeof document === 'undefined') return null;

    const isExcluded = el => Boolean(el?.closest?.('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast'));

    // Priority 1: Exact testid data-testid="train-confirm-start"
    const directBtn = document.querySelector('[data-testid="train-confirm-start"]');
    if (directBtn && !isExcluded(directBtn)) return directBtn;

    // Priority 2: Fuzzy testid
    const fuzzyBtn = document.querySelector('[data-testid*="confirm-start"], [data-testid="train-confirm"] button.btn-gold');
    if (fuzzyBtn && !isExcluded(fuzzyBtn)) return fuzzyBtn;

    // Priority 3: Inside modal containers: [data-testid="train-confirm"], [role="dialog"], dialog, or fixed overlay wrappers
    const modalContainers = document.querySelectorAll('[data-testid="train-confirm"], div[role="dialog"], dialog, div.fixed.inset-0');
    for (const modal of modalContainers) {
        if (isExcluded(modal)) continue;

        const modalText = (modal.textContent || '').toLowerCase();
        if (modalText.includes('pelatihan') || modalText.includes('latihan')) {
            // Find the gold button inside
            const goldBtn = modal.querySelector('button.btn-gold');
            if (goldBtn && !isExcluded(goldBtn)) return goldBtn;

            // Find any button whose text contains "mulai pelatihan"
            for (const b of modal.querySelectorAll('button, [role="button"]')) {
                if (isExcluded(b)) continue;
                const txt = (b.textContent || '').trim().toLowerCase();
                if (txt.includes('mulai pelatihan')) return b;
            }
        }
    }

    // Priority 4: Global scan across all buttons on the page for "mulai pelatihan"
    const allButtons = document.querySelectorAll('button, div[role="button"], a[role="button"]');
    for (const b of allButtons) {
        if (isExcluded(b)) continue;
        const txt = (b.textContent || '').trim().toLowerCase();
        if (txt.includes('mulai pelatihan')) return b;
    }

    return null;
}

/**
 * Finds the train button on the dashboard stat card
 * @param {string} stat - 'strength' | 'education' | 'economy'
 * @returns {HTMLButtonElement|null}
 */
export function findTrainButton(stat) {
    if (typeof document === 'undefined') return null;
    const isExcluded = el => Boolean(el?.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast, [data-testid="train-confirm"]'));

    const testIdMap = {
        strength:  ['train-strength', 'train-kekuatan'],
        education: ['train-education', 'train-pendidikan'],
        economy:   ['train-economy', 'train-production', 'train-economic', 'train-ekonomi', 'train-produksi']
    };

    // Strategy 1: Data-testid matching
    const ids = testIdMap[stat] || [`train-${stat}`];
    for (const id of ids) {
        const btn = document.querySelector(`[data-testid="${id}"]`);
        if (btn && !isExcluded(btn)) return btn;
    }

    // Strategy 2: Search within LATIHAN section cards
    const statPatterns = {
        strength:  /KEKUATAN/i,
        education: /PENDIDIKAN/i,
        economy:   /EKONOMI|PRODUKSI/i
    };
    const pat = statPatterns[stat];
    if (!pat) return null;

    const cards = document.querySelectorAll('div, li, section, [class*="card"]');
    for (const card of cards) {
        if (isExcluded(card)) continue;
        const txt = card.textContent || '';
        if (pat.test(txt) && /(?:LATIH|BERLATIH)/i.test(txt)) {
            const btns = card.querySelectorAll('button');
            for (const b of btns) {
                if (isExcluded(b)) continue;
                const bTxt = (b.textContent || '').trim();
                if (/(?:LATIH|BERLATIH)/i.test(bTxt)) {
                    return b;
                }
            }
        }
    }

    return null;
}

/**
 * Waits for the confirmation modal [data-testid="train-confirm-start"] to appear and clicks it
 * @param {Function} log
 * @param {number} maxWaitMs
 * @returns {Promise<boolean>}
 */
async function waitForAndClickConfirmModal(log, maxWaitMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const confirmBtn = getTrainingConfirmStartButton();
        if (confirmBtn) {
            if (confirmBtn.disabled || confirmBtn.getAttribute('aria-disabled') === 'true') {
                log?.('[Auto Latihan] Pop up konfirmasi muncul namun tombol dinonaktifkan (kemungkinan emas tidak cukup).', 'warn');
                return false;
            }
            log?.('[Auto Latihan] Mengonfirmasi popup "Mulai Pelatihan"...', 'info');
            clickElement(confirmBtn);
            return true;
        }
        await new Promise(r => setTimeout(r, 60));
    }
    return false;
}

/**
 * Automatically confirms any open training confirmation modal if auto-train is enabled.
 * Returns true if a modal confirmation button was clicked.
 * @param {object} ctx
 * @returns {Promise<boolean>}
 */
export async function autoConfirmTrainingModal(ctx) {
    const { CONFIG, log, state, updatePanel } = ctx;
    if (!CONFIG.autoTrainEnabled) return false;

    const confirmBtn = getTrainingConfirmStartButton();
    if (!confirmBtn) return false;

    if (confirmBtn.disabled || confirmBtn.getAttribute('aria-disabled') === 'true') {
        return false;
    }

    if (state._confirmModalInFlight) return false;
    state._confirmModalInFlight = true;

    try {
        log?.('[Auto Latihan] Pop up konfirmasi "Mulai Pelatihan" terdeteksi, mengonfirmasi otomatis...', 'info');
        clickElement(confirmBtn);
        await new Promise(r => setTimeout(r, 800));
        readTrainingStatsFromDom(state);
        updatePanel?.();
        return true;
    } catch (err) {
        log?.(`[Auto Latihan] Gagal konfirmasi popup: ${err?.message || err}`, 'warn');
        return false;
        setTimeout(() => {
            state._confirmModalInFlight = false;
        }, 800);
    }
}

/**
 * Determines the next stat to train based on user priority and targets
 * @param {object} state
 * @param {object} CONFIG
 * @returns {{ stat: string, cost: number, targetLevel: number, insufficientGold: boolean, minReserve: number } | null}
 */
export function getNextStatToTrain(state, CONFIG) {
    if (!CONFIG.autoTrainEnabled) return null;
    if (isTrainingActive(state)) return null;

    const isEnabled = {
        strength:  CONFIG.trainStrengthEnabled !== false,
        education: CONFIG.trainEducationEnabled !== false,
        economy:   CONFIG.trainEconomyEnabled !== false
    };

    const hasAnyEnabled = isEnabled.strength || isEnabled.education || isEnabled.economy;
    if (!hasAnyEnabled) {
        return { noActiveStats: true };
    }

    const targets = {
        education: CONFIG.targetEducation ?? 100,
        economy:   CONFIG.targetEconomy ?? 100,
        strength:  CONFIG.targetStrength ?? 100
    };

    const cur = state.trainingStats || { education: 0, economy: 0, strength: 0 };
    const candidates = ['education', 'economy', 'strength'].filter(s => isEnabled[s] && (cur[s] || 0) < targets[s]);

    if (candidates.length === 0) return null; // All targets achieved

    const priority = CONFIG.trainPriority || 'education';
    let chosen = null;

    if (priority === 'balanced') {
        // Sort ascending by current level to balance all active stats evenly
        candidates.sort((a, b) => {
            const diff = (cur[a] || 0) - (cur[b] || 0);
            if (diff !== 0) return diff;
            // Tie-break: education > economy > strength
            const order = { education: 1, economy: 2, strength: 3 };
            return order[a] - order[b];
        });
        chosen = candidates[0];
    } else if (isEnabled[priority] && candidates.includes(priority)) {
        chosen = priority;
    } else {
        // Fallback: education > economy > strength among candidates
        const fallbackOrder = ['education', 'economy', 'strength'];
        chosen = fallbackOrder.find(s => candidates.includes(s)) || candidates[0];
    }

    if (!chosen) return null;

    const nextCost = (cur[chosen] || 0) + 1;
    const minReserve = CONFIG.minGoldReserve ?? 50;

    // Guard: Check gold reserves
    const currentGold = state.walletGold || 0;
    const insufficientGold = currentGold > 0 && (currentGold - nextCost) < minReserve;

    return {
        stat: chosen,
        cost: nextCost,
        targetLevel: nextCost,
        insufficientGold,
        minReserve
    };
}

/**
 * Formats the live training status text for the panel UI
 * @param {object} state
 * @param {object} CONFIG
 * @returns {{ text: string, timerText: string, isActive: boolean, isOff: boolean }}
 */
export function getTrainingStatusDisplay(state, CONFIG) {
    if (state.activeTraining && state.activeTraining.endsAt) {
        const remainingMs = new Date(state.activeTraining.endsAt).getTime() - Date.now();
        if (remainingMs > 0) {
            const statName = STAT_NAMES[state.activeTraining.stat] || state.activeTraining.stat;
            const target = state.activeTraining.targetLevel ? ` Lv ${state.activeTraining.targetLevel}` : '';
            return {
                text: `Latih ${statName}${target}`,
                timerText: formatTrainingDuration(remainingMs),
                isActive: true,
                isOff: false
            };
        }
    }

    if (!CONFIG.autoTrainEnabled) {
        return { text: 'Latihan Stats: Nonaktif', timerText: 'OFF', isActive: false, isOff: true };
    }

    const next = getNextStatToTrain(state, CONFIG);
    if (!next) {
        return { text: 'Semua Target Tercapai', timerText: 'MAX', isActive: false, isOff: false };
    }

    if (next.noActiveStats) {
        return { text: 'Siaga (0 Stat Dipilih)', timerText: 'STANDBY', isActive: false, isOff: false };
    }

    if (next.insufficientGold) {
        return { text: `Emas Kurang (< ${next.minReserve} Cadangan)`, timerText: 'PAUSE', isActive: false, isOff: false };
    }

    const statName = STAT_NAMES[next.stat] || next.stat;
    return {
        text: `Siap Latih ${statName} Lv ${next.targetLevel}`,
        timerText: 'SIAP',
        isActive: false,
        isOff: false
    };
}

let _lastInsufficientGoldLogAt = 0;

/**
 * Executes the auto-training step: clicks the DOM button or calls API directly
 * @param {object} ctx
 */
export async function executeAutoTrain(ctx) {
    const { state, CONFIG, log, updatePanel } = ctx;

    if (!CONFIG.autoTrainEnabled) return;
    if (state.trainingInFlight) return;

    // Respect tab leadership if managed
    if (state.tabLockManaged && !state.isTabLockOwner) return;

    // Step 0: Check if confirmation popup ("MULAI PELATIHAN") is ALREADY open
    const openConfirmBtn = getTrainingConfirmStartButton();
    if (openConfirmBtn) {
        if (openConfirmBtn.disabled || openConfirmBtn.getAttribute('aria-disabled') === 'true') {
            log?.('[Auto Latihan] Pop up konfirmasi "Mulai Pelatihan" terbuka namun tombol dinonaktifkan (kemungkinan emas tidak mencukupi).', 'warn');
            return;
        }
        state.trainingInFlight = true;
        try {
            log?.('[Auto Latihan] Pop up konfirmasi "Mulai Pelatihan" terdeteksi, mengonfirmasi otomatis...', 'info');
            clickElement(openConfirmBtn);
            await new Promise(r => setTimeout(r, 1000));
            readTrainingStatsFromDom(state);
            updatePanel?.();
        } finally {
            state.trainingInFlight = false;
        }
        return;
    }

    readTrainingStatsFromDom(state);

    const next = getNextStatToTrain(state, CONFIG);
    if (!next) {
        if (!state._allTargetsCompletedLogged && !isTrainingActive(state)) {
            const hasAnyEnabled = (CONFIG.trainStrengthEnabled !== false) || (CONFIG.trainEducationEnabled !== false) || (CONFIG.trainEconomyEnabled !== false);
            if (hasAnyEnabled) {
                state._allTargetsCompletedLogged = true;
                log('[Auto Latihan] Selamat! Seluruh target latihan level telah tercapai. Auto Latihan memasuki mode siaga (MAX).', 'success');
            }
        }
        return;
    }
    state._allTargetsCompletedLogged = false;
    if (next.noActiveStats) return;

    if (next.insufficientGold) {
        const now = Date.now();
        if (now - _lastInsufficientGoldLogAt > 300000) { // Log once every 5 minutes
            _lastInsufficientGoldLogAt = now;
            log(`[Auto Latihan] Ditunda: Emas di dompet (${state.walletGold || 0}) tidak cukup untuk cadangan minimal (${next.minReserve} Emas).`, 'warn');
        }
        return;
    }

    state.trainingInFlight = true;
    const statName = STAT_NAMES[next.stat] || next.stat;

    try {
        log(`[Auto Latihan] Memulai latihan ${statName} Lv ${next.targetLevel} (Biaya: ${next.cost} Emas)...`, 'info');

        // Step 1: Attempt DOM click if element exists on page
        const btn = findTrainButton(next.stat);
        if (btn && !btn.disabled) {
            clickElement(btn);

            // Step 1b: Wait for the confirmation modal [data-testid="train-confirm-start"] to appear!
            const modalConfirmed = await waitForAndClickConfirmModal(log, 6000);
            if (modalConfirmed) {
                await new Promise(r => setTimeout(r, 1000));
                readTrainingStatsFromDom(state);
                updatePanel?.();
                return;
            }

            // Fallback: If modal didn't appear after 6s, give DOM/network a moment to update
            await new Promise(r => setTimeout(r, 800));
            readTrainingStatsFromDom(state);
            updatePanel?.();
            return;
        }

        // Step 2: Fallback to direct API call if button is not present/clickable
        if (state.currentToken) {
            const resp = await fetch('https://parlamentum.org/api/player/train', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.currentToken}`
                },
                body: JSON.stringify({ stat: next.stat })
            });

            if (resp.ok) {
                const data = await resp.json();
                handleTrainSuccess({
                    stat: next.stat,
                    endsAt: data.endsAt || data.ends_at,
                    targetLevel: Number(data.targetLevel ?? data.target_level ?? next.targetLevel),
                    costGold: Number(data.costGold ?? data.cost_gold ?? next.cost * 100),
                    raw: data
                }, state, CONFIG, ctx);
            } else {
                let errText = 'Server menolak latihan';
                try {
                    const errData = await resp.json();
                    if (errData.message || errData.error) errText = errData.message || errData.error;
                } catch { /* ignore */ }
                log(`[Auto Latihan] Gagal: ${errText} (${resp.status})`, 'warn');
            }
        }
    } catch (err) {
        log(`[Auto Latihan] Error eksekusi: ${err?.message || err}`, 'error');
    } finally {
        state.trainingInFlight = false;
        updatePanel?.();
    }
}

/**
 * Handles TRAIN_SUCCESS event from network interceptor or direct API response
 * @param {object} msg
 * @param {object} state
 * @param {object} CONFIG
 * @param {object} ctx
 */
export function handleTrainSuccess(msg, state, CONFIG, ctx) {
    const endsAt = msg.endsAt || msg.ends_at;
    const targetLevel = Number(msg.targetLevel ?? msg.target_level ?? 0);
    const costGold = Number(msg.costGold ?? msg.cost_gold ?? 0);
    const stat = msg.stat || 'strength';
    const totalSeconds = calculateLevelTrainingSeconds(targetLevel, state.trainingStats?.education || 0);

    state.activeTraining = {
        stat,
        endsAt,
        targetLevel,
        costGold,
        totalSeconds,
        domProgressPct: 0
    };
    setValue('aw_active_training', state.activeTraining);

    // Deduct wallet gold optimistically
    if (costGold > 0 && state.walletGold > 0) {
        const goldSpent = Math.round(costGold >= 100 ? costGold / 100 : costGold);
        state.walletGold = Math.max(0, state.walletGold - goldSpent);
        setValue('aw_wallet_gold', state.walletGold.toString());
    }

    // Schedule next auto-train trigger slightly after completion
    if (endsAt) {
        const endsMs = new Date(endsAt).getTime();
        state.nextTrainCheckTimestamp = endsMs + 3500;
    }

    saveLiveStatus(state, CONFIG, true);
    broadcastTabMessage({
        type: 'TRAIN_UPDATED',
        activeTraining: state.activeTraining,
        walletGold: state.walletGold,
        timestamp: Date.now()
    });

    const statName = STAT_NAMES[stat] || stat;
    const finishTime = endsAt ? new Date(endsAt).toLocaleTimeString() : 'segera';
    ctx?.log?.(`[Auto Latihan] Sukses: Latihan ${statName} Lv ${targetLevel} aktif. Selesai pukul ${finishTime}.`, 'success');
    ctx?.updatePanel?.();
}

/**
 * Handles TRAIN_REJECTED event from network interceptor
 * @param {object} msg
 * @param {object} state
 * @param {object} CONFIG
 * @param {object} ctx
 */
export function handleTrainRejected(msg, state, CONFIG, ctx) {
    const reason = msg.message || 'Latihan ditolak oleh server.';
    ctx?.log?.(`[Auto Latihan] Rejection: ${reason}`, 'warn');
}
