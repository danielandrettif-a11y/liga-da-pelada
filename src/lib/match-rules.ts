export function getMatchHalfSeconds(durationSeconds: number) {
  return Math.floor(Math.max(0, durationSeconds) / 2);
}

export function isEntryResultEligible(elapsedSeconds: number, durationSeconds: number) {
  return Math.max(0, elapsedSeconds) <= getMatchHalfSeconds(durationSeconds);
}

export function getOfficialElapsedSeconds(displayedElapsedSeconds: number, eligibilityOffsetSeconds: number) {
  return Math.max(0, displayedElapsedSeconds) + Math.max(0, eligibilityOffsetSeconds);
}

export type MatchTimerSnapshot = {
  startedAt: string | null;
  accumulated: number;
};

export function getMatchTimerElapsedSeconds(snapshot: MatchTimerSnapshot, nowMs = Date.now()) {
  const accumulated = Number.isFinite(snapshot.accumulated) ? Math.max(0, snapshot.accumulated) : 0;
  if (!snapshot.startedAt) return accumulated;

  const startedAtMs = Date.parse(snapshot.startedAt);
  if (!Number.isFinite(startedAtMs)) return accumulated;
  return accumulated + Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

export function transitionMatchTimer(
  snapshot: MatchTimerSnapshot,
  action: "start" | "pause",
  nowMs = Date.now(),
): MatchTimerSnapshot {
  if (action === "start") {
    if (snapshot.startedAt) return snapshot;
    return {
      startedAt: new Date(nowMs).toISOString(),
      accumulated: getMatchTimerElapsedSeconds(snapshot, nowMs),
    };
  }

  return {
    startedAt: null,
    accumulated: getMatchTimerElapsedSeconds(snapshot, nowMs),
  };
}
