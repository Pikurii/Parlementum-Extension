import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateGoldCost,
    calculateLevelTrainingSeconds,
    calculateTotalTrainingSeconds,
    formatAccumulatedDuration,
    getTrainingProgressPercentage
} from '../src/training.js';

test('calculateGoldCost calculates arithmetic progression correctly', () => {
    assert.equal(calculateGoldCost(0, 1), 1);
    assert.equal(calculateGoldCost(0, 10), 55);
    assert.equal(calculateGoldCost(94, 95), 95);
    assert.equal(calculateGoldCost(50, 50), 0);
    assert.equal(calculateGoldCost(50, 40), 0);
    assert.equal(calculateGoldCost(-5, 0), 0);
});

test('calculateLevelTrainingSeconds adheres to official Parlementum formula', () => {
    // Level 1 EDU 0: round(0.2894 * 1) = 0 -> clamped to 1s
    assert.equal(calculateLevelTrainingSeconds(1, 0), 1);

    // Level 10 EDU 0: round(0.2894 * (10 ^ 2.5)) = round(91.516) = 92s
    assert.equal(calculateLevelTrainingSeconds(10, 0), 92);

    // Level 10 with EDU 100: round(91.516 / 2) = round(45.758) = 46s
    assert.equal(calculateLevelTrainingSeconds(10, 100), 46);

    // Ensure always positive integer >= 1
    assert.ok(calculateLevelTrainingSeconds(50, 10) > 0);
});

test('calculateTotalTrainingSeconds sums multiple levels properly', () => {
    const single = calculateLevelTrainingSeconds(10, 0);
    assert.equal(calculateTotalTrainingSeconds(9, 10, 0, false), single);

    const multi = calculateTotalTrainingSeconds(5, 8, 10, false);
    const manualSum = calculateLevelTrainingSeconds(6, 10) +
                      calculateLevelTrainingSeconds(7, 10) +
                      calculateLevelTrainingSeconds(8, 10);
    assert.equal(multi, manualSum);
});

test('formatAccumulatedDuration formats seconds into clean Indonesian labels', () => {
    assert.equal(formatAccumulatedDuration(0), '0 dtk');
    assert.equal(formatAccumulatedDuration(45), '< 1 mnt');
    assert.equal(formatAccumulatedDuration(300), '~5 mnt');
    assert.equal(formatAccumulatedDuration(3600), '~1 jam');
    assert.equal(formatAccumulatedDuration(3720), '~1 jam 2 mnt');
    assert.equal(formatAccumulatedDuration(86400), '~1 hari');
    assert.equal(formatAccumulatedDuration(90000), '~1 hari 1 jam');
});

test('getTrainingProgressPercentage prioritizes domProgressPct for 100% game sync', () => {
    // When game DOM has 5% (like in user screenshot)
    const activeWithDom = {
        stat: 'strength',
        endsAt: new Date(Date.now() + 10260000).toISOString(),
        domProgressPct: 5
    };
    assert.equal(getTrainingProgressPercentage(activeWithDom), 5);

    // When domProgressPct is 0%
    assert.equal(getTrainingProgressPercentage({ endsAt: new Date(Date.now() + 1000).toISOString(), domProgressPct: 0 }), 0);

    // Fallback when domProgressPct is null
    const activeFallback = {
        stat: 'strength',
        targetLevel: 96,
        totalSeconds: 10800,
        endsAt: new Date(Date.now() + 5400000).toISOString(),
        domProgressPct: null
    };
    // 5400s left of 10800s total -> ~50%
    const pct = getTrainingProgressPercentage(activeFallback, { education: 50 });
    assert.ok(pct >= 49 && pct <= 51);
});
