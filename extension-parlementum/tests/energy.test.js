import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateProjectedEnergy,
    isEnergyFlushActive,
    getEffectiveEnergyThreshold
} from '../src/energy.js';

test('calculateProjectedEnergy respects bounds and regeneration rate', () => {
    const now = 1000000;
    const syncBase = {
        current: 50,
        max: 100,
        updatedAt: now,
        regenRate: 1.0
    };

    // Exactly at sync time
    assert.equal(calculateProjectedEnergy(syncBase, now), 50);

    // 1 minute later: gained 1 EN
    assert.equal(calculateProjectedEnergy(syncBase, now + 60000), 51);

    // 30 minutes later: gained 30 EN
    assert.equal(calculateProjectedEnergy(syncBase, now + 1800000), 80);

    // 120 minutes later: clamped at max 100 EN
    assert.equal(calculateProjectedEnergy(syncBase, now + 7200000), 100);

    // Past time or negative delta: doesn't decrease below base
    assert.equal(calculateProjectedEnergy(syncBase, now - 60000), 50);
});

test('calculateProjectedEnergy handles faster regen rates properly', () => {
    const now = 1000000;
    const syncBase = {
        current: 20,
        max: 100,
        updatedAt: now,
        regenRate: 2.0 // 2 energy per minute
    };

    // 5 minutes later: gained 10 EN
    assert.equal(calculateProjectedEnergy(syncBase, now + 300000), 30);
});

test('getEffectiveEnergyThreshold returns expected values with and without flush', () => {
    const state = { unitEnergyCost: 10, currentEnergy: 50, maxEnergy: 100 };
    const CONFIG = { energyThreshold: 80, energyFlushEnabled: false };

    assert.equal(getEffectiveEnergyThreshold(state, CONFIG), 80);

    // With jitter enabled
    const jitterConfig = {
        energyThreshold: 80,
        energyFlushEnabled: false,
        energyThresholdJitterEnabled: true,
        energyThresholdJitterRange: 3
    };
    const jittered = getEffectiveEnergyThreshold(state, jitterConfig);
    assert.ok(jittered >= 77 && jittered <= 83);
});

test('isEnergyFlushActive returns false if disabled', () => {
    assert.equal(isEnergyFlushActive({ energyFlushEnabled: false }), false);
    assert.equal(isEnergyFlushActive(null), false);
});
