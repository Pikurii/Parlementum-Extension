import test from 'node:test';
import assert from 'node:assert/strict';
import {
    gaussianRandom,
    getHumanClickCoordinates,
    getHumanJitter,
    calculateExponentialBackoff,
    getEnergyJitterOffset,
    checkMicroBreak
} from '../src/humanizer.js';

test('gaussianRandom produces bounded values within min and max', () => {
    for (let i = 0; i < 50; i++) {
        const val = gaussianRandom(50, 10, 20, 80);
        assert.ok(val >= 20, `Value ${val} should be >= 20`);
        assert.ok(val <= 80, `Value ${val} should be <= 80`);
    }
});

test('getHumanClickCoordinates stays within DOMRect boundaries', () => {
    const rect = { left: 100, top: 200, width: 80, height: 40 };
    for (let i = 0; i < 30; i++) {
        const coords = getHumanClickCoordinates(rect);
        assert.ok(coords.offsetX >= 0 && coords.offsetX <= rect.width);
        assert.ok(coords.offsetY >= 0 && coords.offsetY <= rect.height);
        assert.ok(coords.clientX >= rect.left && coords.clientX <= rect.left + rect.width);
        assert.ok(coords.clientY >= rect.top && coords.clientY <= rect.top + rect.height);
    }
});

test('calculateExponentialBackoff scales progressively and caps at maxMs', () => {
    const b0 = calculateExponentialBackoff(0);
    assert.equal(b0, 0);

    const b1 = calculateExponentialBackoff(1, 40000, 300000);
    assert.ok(b1 >= 40000 && b1 <= 80000);

    const b2 = calculateExponentialBackoff(2, 40000, 300000);
    assert.ok(b2 > b1, `b2 (${b2}) should be > b1 (${b1})`);

    const b10 = calculateExponentialBackoff(10, 40000, 300000);
    assert.ok(b10 <= 300000, `b10 (${b10}) should be capped at 300000`);
});

test('getEnergyJitterOffset returns integer in bounded range', () => {
    const CONFIG = { energyThresholdJitterEnabled: true, energyThresholdJitterRange: 3 };
    for (let i = 0; i < 20; i++) {
        const offset = getEnergyJitterOffset(CONFIG);
        assert.ok(Number.isInteger(offset));
        assert.ok(offset >= -3 && offset <= 3);
    }

    const disabledConfig = { energyThresholdJitterEnabled: false };
    assert.equal(getEnergyJitterOffset(disabledConfig), 0);
});

test('checkMicroBreak manages scheduled breaks cleanly', () => {
    const state = { microBreakUntil: 0, nextMicroBreakScheduledAt: 0 };
    const CONFIG = { microBreaksEnabled: false };

    // When disabled: never in break
    const res1 = checkMicroBreak(state, CONFIG, 100000);
    assert.equal(res1.inBreak, false);

    // When enabled and initialized
    const activeConfig = {
        microBreaksEnabled: true,
        microBreakFrequencyHours: 2,
        microBreakDurationMinutes: 10
    };
    const res2 = checkMicroBreak(state, activeConfig, 100000);
    assert.equal(res2.inBreak, false);
    assert.ok(state.nextMicroBreakScheduledAt > 100000);

    // Fast-forward past scheduled time: triggers break
    const triggerTime = state.nextMicroBreakScheduledAt + 10;
    const res3 = checkMicroBreak(state, activeConfig, triggerTime);
    assert.equal(res3.inBreak, true);
    assert.ok(state.microBreakUntil > triggerTime);
});
