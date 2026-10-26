import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_CONFIG,
    NUMERIC_BOUNDS,
    normalizeConfig
} from '../src/config.js';

test('DEFAULT_CONFIG contains all expected stealth and optimization properties', () => {
    assert.equal(typeof DEFAULT_CONFIG.microBreaksEnabled, 'boolean');
    assert.equal(typeof DEFAULT_CONFIG.microBreakFrequencyHours, 'number');
    assert.equal(typeof DEFAULT_CONFIG.microBreakDurationMinutes, 'number');
    assert.equal(typeof DEFAULT_CONFIG.energyThresholdJitterEnabled, 'boolean');
    assert.equal(typeof DEFAULT_CONFIG.energyThresholdJitterRange, 'number');
});

test('NUMERIC_BOUNDS clamps stealth settings properly in normalizeConfig', () => {
    // Valid bounded values
    const valid = normalizeConfig({
        microBreakFrequencyHours: 6,
        microBreakDurationMinutes: 15,
        energyThresholdJitterRange: 4
    });
    assert.equal(valid.microBreakFrequencyHours, 6);
    assert.equal(valid.microBreakDurationMinutes, 15);
    assert.equal(valid.energyThresholdJitterRange, 4);

    // Out of bounds values should fall back to default when non-strict
    const invalid = normalizeConfig({
        microBreakFrequencyHours: 99, // exceeds max 12
        microBreakDurationMinutes: 0, // below min 3
        energyThresholdJitterRange: 50 // exceeds max 10
    });
    assert.equal(invalid.microBreakFrequencyHours, DEFAULT_CONFIG.microBreakFrequencyHours);
    assert.equal(invalid.microBreakDurationMinutes, DEFAULT_CONFIG.microBreakDurationMinutes);
    assert.equal(invalid.energyThresholdJitterRange, DEFAULT_CONFIG.energyThresholdJitterRange);
});

test('normalizeConfig handles strict mode validation correctly', () => {
    assert.equal(normalizeConfig('invalid', true), null);
    assert.equal(normalizeConfig({ microBreakFrequencyHours: 999 }, true), null);
    assert.ok(normalizeConfig({ microBreaksEnabled: true }, true) !== null);
});
