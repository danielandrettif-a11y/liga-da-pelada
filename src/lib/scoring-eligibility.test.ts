import { describe, expect, it } from "vitest";
import {
  isParticipantScoringEligible,
  shouldExcludeReplacementScoring,
} from "./scoring-eligibility";

describe("corte da pontuação de substitutos", () => {
  it("preserva a pontuação dos substitutos até a rodada 6", () => {
    expect(shouldExcludeReplacementScoring(6)).toBe(false);
    expect(isParticipantScoringEligible(6, false)).toBe(true);
  });

  it("passa a respeitar scoring_eligible a partir da rodada 7", () => {
    expect(shouldExcludeReplacementScoring(7)).toBe(true);
    expect(isParticipantScoringEligible(7, false)).toBe(false);
    expect(isParticipantScoringEligible(7, true)).toBe(true);
  });
});
