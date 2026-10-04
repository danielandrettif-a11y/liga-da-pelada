export const NON_SCORING_REPLACEMENTS_START_ROUND = 7;

export function shouldExcludeReplacementScoring(roundNumber: number | null | undefined) {
  return Number(roundNumber || 0) >= NON_SCORING_REPLACEMENTS_START_ROUND;
}

export function isParticipantScoringEligible(
  roundNumber: number | null | undefined,
  storedEligibility: boolean | null | undefined,
) {
  return !shouldExcludeReplacementScoring(roundNumber) || storedEligibility !== false;
}
