/**
 * humanizer.js — Natural human behavior simulation
 *
 * Implements Box-Muller Gaussian normal distribution and natural
 * coordinate variations to prevent bot detection analytics.
 */

/**
 * Generates a normally distributed number (Gaussian/Bell Curve)
 * centered at mean with standard deviation stdDev, clamped between min and max.
 *
 * @param {number} mean - Peak of the bell curve
 * @param {number} stdDev - Spread/variance around the mean
 * @param {number} min - Lower clamp bound
 * @param {number} max - Upper clamp bound
 * @returns {number}
 */
export function gaussianRandom(mean, stdDev, min = -Infinity, max = Infinity) {
    let u1 = 0;
    let u2 = 0;
    // Math.random() can return 0, which would break Math.log(0)
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();

    // Box-Muller transform
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const value = mean + z0 * stdDev;

    return Math.max(min, Math.min(max, value));
}

/**
 * Calculates humanized click coordinates inside a target DOM rectangle.
 * Real users naturally target the center of a button with slight motor variation.
 *
 * @param {DOMRect} rect
 * @returns {{ offsetX: number, offsetY: number, clientX: number, clientY: number }}
 */
export function getHumanClickCoordinates(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
        return { offsetX: 0, offsetY: 0, clientX: 0, clientY: 0 };
    }

    // Bell curve centered at 50% width & height, standard deviation 7%, bounded in 30%-70%
    const factorX = gaussianRandom(0.50, 0.07, 0.28, 0.72);
    const factorY = gaussianRandom(0.50, 0.07, 0.28, 0.72);

    const offsetX = Math.floor(rect.width * factorX);
    const offsetY = Math.floor(rect.height * factorY);
    const clientX = Math.round(rect.left + offsetX);
    const clientY = Math.round(rect.top + offsetY);

    return { offsetX, offsetY, clientX, clientY };
}

/**
 * Generates natural reaction/jitter delay in milliseconds.
 *
 * @param {number} min - Minimum delay in ms
 * @param {number} max - Maximum delay in ms
 * @param {number} [preferredPeak] - Optional preferred mean/peak
 * @returns {number}
 */
export function getHumanJitter(min, max, preferredPeak = null) {
    const mean = preferredPeak != null ? preferredPeak : min + (max - min) * 0.40;
    const stdDev = Math.max(1, (max - min) / 6);
    return Math.round(gaussianRandom(mean, stdDev, min, max));
}

/**
 * Calculates adaptive exponential backoff duration in milliseconds with jitter.
 *
 * @param {number} consecutiveErrors - 1, 2, 3...
 * @param {number} [baseMs=45000] - Base delay for first failure (e.g. 45s)
 * @param {number} [maxMs=480000] - Max delay cap (e.g. 8 mins)
 * @returns {number}
 */
export function calculateExponentialBackoff(consecutiveErrors, baseMs = 45000, maxMs = 480000) {
    if (consecutiveErrors <= 0) return 0;
    const exponent = Math.min(5, consecutiveErrors - 1);
    const raw = baseMs * Math.pow(1.8, exponent);
    const jitter = getHumanJitter(5000, 25000, 12000);
    return Math.min(maxMs, Math.round(raw + jitter));
}

/**
 * Generates an organic threshold jitter offset (e.g. -2, 0, +2)
 * so the bot doesn't trigger shifts on identical predictable energy numbers.
 *
 * @param {object} CONFIG
 * @returns {number} Integer offset
 */
export function getEnergyJitterOffset(CONFIG) {
    if (!CONFIG?.energyThresholdJitterEnabled) return 0;
    const maxRange = Math.max(1, Math.min(5, CONFIG.energyThresholdJitterRange || 3));
    // Gaussian distribution around 0, clamped between -maxRange and +maxRange
    return Math.round(gaussianRandom(0, maxRange * 0.45, -maxRange, maxRange));
}

/**
 * Checks and manages organic micro-breaks for active bot operation.
 * Simulates real human behavior taking occasional 8-15 minute breaks.
 *
 * @param {object} state
 * @param {object} CONFIG
 * @param {number} [nowMs=Date.now()]
 * @returns {{ inBreak: boolean, remainingMs: number, startingNow?: boolean, reason?: string }}
 */
export function checkMicroBreak(state, CONFIG, nowMs = Date.now()) {
    if (!CONFIG?.microBreaksEnabled) {
        state.microBreakUntil = 0;
        return { inBreak: false, remainingMs: 0 };
    }

    // 1. Currently inside an active micro-break
    if (state.microBreakUntil && nowMs < state.microBreakUntil) {
        return {
            inBreak: true,
            remainingMs: state.microBreakUntil - nowMs,
            reason: state.microBreakReason || 'Istirahat santai berkala'
        };
    }

    // 2. Micro-break has concluded
    if (state.microBreakUntil && nowMs >= state.microBreakUntil) {
        state.microBreakUntil = 0;
        state.microBreakReason = '';
    }

    // 3. Initialize next scheduled micro-break if not yet scheduled
    const freqHours = Math.max(1, CONFIG.microBreakFrequencyHours || 4);
    const freqMs = freqHours * 3600000;

    if (!state.nextMicroBreakScheduledAt) {
        // Schedule next break: frequency +/- 20% random jitter
        const jitter = getHumanJitter(-0.2 * freqMs, 0.2 * freqMs, 0);
        state.nextMicroBreakScheduledAt = nowMs + Math.max(1800000, freqMs + jitter);
    }

    // 4. Trigger micro-break if schedule reached
    if (nowMs >= state.nextMicroBreakScheduledAt) {
        const durMins = Math.max(5, Math.min(30, CONFIG.microBreakDurationMinutes || 10));
        const durMs = durMins * 60000 + getHumanJitter(-60000, 120000, 30000);
        state.microBreakUntil = nowMs + Math.max(180000, durMs);
        state.microBreakReason = 'Istirahat santai berkala';
        // Schedule following break
        const jitter = getHumanJitter(-0.2 * freqMs, 0.2 * freqMs, 0);
        state.nextMicroBreakScheduledAt = state.microBreakUntil + Math.max(1800000, freqMs + jitter);

        return {
            inBreak: true,
            startingNow: true,
            remainingMs: state.microBreakUntil - nowMs,
            reason: state.microBreakReason
        };
    }

    return { inBreak: false, remainingMs: 0 };
}
