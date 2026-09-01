export const GENERATION_START_TIMEOUT = 20 * 1000;

export function submissionIndicatesActivity(submission) {
    return Boolean(submission?.generationObserved || submission?.responseObserved);
}

export function evaluateGenerationActivity({ activityDetected, generating, elapsedMs, startTimeoutMs = GENERATION_START_TIMEOUT }) {
    const nextActivityDetected = activityDetected || generating;
    return {
        activityDetected: nextActivityDetected,
        startedNow: generating && !activityDetected,
        abortForNoGeneration: !nextActivityDetected && elapsedMs >= startTimeoutMs,
        canCountStablePoll: nextActivityDetected && !generating
    };
}
