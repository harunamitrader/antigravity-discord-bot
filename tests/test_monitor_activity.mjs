import assert from 'node:assert/strict';
import test from 'node:test';

const {
    GENERATION_START_TIMEOUT,
    evaluateGenerationActivity
} = await import('../src/monitor_activity.js');

test('an unchanged idle session cannot count toward response completion', () => {
    const result = evaluateGenerationActivity({
        activityDetected: false,
        generating: false,
        elapsedMs: GENERATION_START_TIMEOUT - 1
    });

    assert.equal(result.activityDetected, false);
    assert.equal(result.abortForNoGeneration, false);
    assert.equal(result.canCountStablePoll, false);
});

test('an unchanged idle session is abandoned after the start timeout', () => {
    const result = evaluateGenerationActivity({
        activityDetected: false,
        generating: false,
        elapsedMs: GENERATION_START_TIMEOUT
    });

    assert.equal(result.abortForNoGeneration, true);
    assert.equal(result.canCountStablePoll, false);
});

test('observed generation enables stable completion polling', () => {
    const started = evaluateGenerationActivity({
        activityDetected: false,
        generating: true,
        elapsedMs: 1000
    });
    const completed = evaluateGenerationActivity({
        activityDetected: started.activityDetected,
        generating: false,
        elapsedMs: 3000
    });

    assert.equal(started.startedNow, true);
    assert.equal(started.abortForNoGeneration, false);
    assert.equal(completed.activityDetected, true);
    assert.equal(completed.abortForNoGeneration, false);
    assert.equal(completed.canCountStablePoll, true);
});
