export type MatchTimerAtFinish = {
  timerAccumulatedSeconds: number | null;
  timerStartedAt: string | null;
  eligibilityElapsedOffsetSeconds: number | null;
};

export function calculateMatchFinishTime(state: MatchTimerAtFinish, nowMs: number) {
  const elapsedSeconds = Math.max(
    0,
    Number(state.timerAccumulatedSeconds || 0)
      + (state.timerStartedAt
        ? Math.floor((nowMs - new Date(state.timerStartedAt).getTime()) / 1000)
        : 0),
  );
  return {
    elapsedSeconds,
    officialElapsedSeconds: elapsedSeconds + Number(state.eligibilityElapsedOffsetSeconds || 0),
  };
}
