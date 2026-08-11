export function getMatchHalfSeconds(durationSeconds: number) {
  return Math.floor(Math.max(0, durationSeconds) / 2);
}

export function isEntryResultEligible(elapsedSeconds: number, durationSeconds: number) {
  return Math.max(0, elapsedSeconds) <= getMatchHalfSeconds(durationSeconds);
}

export function getOfficialElapsedSeconds(displayedElapsedSeconds: number, eligibilityOffsetSeconds: number) {
  return Math.max(0, displayedElapsedSeconds) + Math.max(0, eligibilityOffsetSeconds);
}
