import { describe, expect, it } from "vitest";
import {
  BQ_SCORING_V5,
  DEFAULT_COLUMN_C_SCORING,
  rankingRulesToSnapshot,
  ScoringPolicyValidationError,
  validateBQScoringSnapshot,
  validateColumnCScoringSettings,
} from "./scoring-policy.js";

describe("scoring-policy domain", () => {
  describe("validateBQScoringSnapshot", () => {
    it("validates a standard BQ v5 snapshot", () => {
      const result = validateBQScoringSnapshot(BQ_SCORING_V5);
      expect(result).toEqual(BQ_SCORING_V5);
    });

    it("throws when a mandatory scout is missing or non-numeric", () => {
      const invalid = { ...BQ_SCORING_V5, goal: "four" as unknown as number };
      expect(() => validateBQScoringSnapshot(invalid)).toThrow(ScoringPolicyValidationError);
      expect(() => validateBQScoringSnapshot(invalid)).toThrow("O scout 'goal' é obrigatório");
    });

    it("throws when any scout exceeds the allowed boundary (-100 to +100)", () => {
      const outOfBounds = { ...BQ_SCORING_V5, goal: 101 };
      expect(() => validateBQScoringSnapshot(outOfBounds)).toThrow(ScoringPolicyValidationError);
      expect(() => validateBQScoringSnapshot(outOfBounds)).toThrow("excede o limite permitido");
    });

    it("accepts optional positional properties", () => {
      const withPositional = {
        ...BQ_SCORING_V5,
        defenderGoal: 5,
        defenderCleanSheet: 3,
      };
      const result = validateBQScoringSnapshot(withPositional);
      expect(result.defenderGoal).toBe(5);
      expect(result.defenderCleanSheet).toBe(3);
    });
  });

  describe("validateColumnCScoringSettings", () => {
    it("validates default Column C scoring settings", () => {
      const result = validateColumnCScoringSettings(DEFAULT_COLUMN_C_SCORING);
      expect(result).toEqual(DEFAULT_COLUMN_C_SCORING);
    });

    it("throws when conceded goal values are positive", () => {
      const invalid = {
        ...DEFAULT_COLUMN_C_SCORING,
        lineGoalConcededPoints: 1.0,
      };
      expect(() => validateColumnCScoringSettings(invalid)).toThrow(ScoringPolicyValidationError);
      expect(() => validateColumnCScoringSettings(invalid)).toThrow("Pontos por gol sofrido devem ser zero ou negativos");
    });

    it("throws when a field is missing", () => {
      const { attackerGoalPoints: _, ...incomplete } = DEFAULT_COLUMN_C_SCORING;
      expect(() => validateColumnCScoringSettings(incomplete)).toThrow(ScoringPolicyValidationError);
      expect(() => validateColumnCScoringSettings(incomplete)).toThrow("O campo 'attackerGoalPoints' é obrigatório");
    });
  });

  describe("rankingRulesToSnapshot", () => {
    it("converts DB ranking_rules array to snapshot", () => {
      const rules = [
        { event_type: "goal", points: 4.5 },
        { event_type: "assist", points: 3 },
        { event_type: "win", points: 2 },
        { event_type: "draw", points: 1 },
        { event_type: "loss", points: -2 },
        { event_type: "own_goal", points: -3.5 },
        { event_type: "goalkeeper_appearance", points: 2.5 },
        { event_type: "goal_conceded", points: -1.5 },
      ];
      const snapshot = rankingRulesToSnapshot(rules, 5);
      expect(snapshot).toEqual({
        version: 5,
        goal: 4.5,
        assist: 3,
        win: 2,
        draw: 1,
        loss: -2,
        ownGoal: -3.5,
        goalkeeperAppearance: 2.5,
        goalkeeperGoalConceded: -1.5,
      });
    });

    it("uses default values for missing rule types", () => {
      const snapshot = rankingRulesToSnapshot([], 5);
      expect(snapshot).toEqual(BQ_SCORING_V5);
    });
  });
});

