import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../../shared/actor.js";
import {
  BQ_SCORING_V5,
  DEFAULT_COLUMN_C_SCORING,
} from "../domain/scoring-policy.js";
import {
  getBQScoringRules,
  getColumnCScoringRules,
  saveBQScoringRules,
  saveColumnCScoringRules,
  type ScoringRulesRepository,
  StatisticsValidationError,
} from "./manage-scoring-rules.js";

describe("manage-scoring-rules application", () => {
  const actor: Actor = {
    userId: "00000000-0000-4000-8000-000000000001",
  };
  const validLeagueId = "11111111-1111-4111-8111-111111111111";

  const createMockRepository = (): ScoringRulesRepository => ({
    getBQScoringRules: vi.fn().mockResolvedValue(BQ_SCORING_V5),
    getColumnCScoringRules: vi.fn().mockResolvedValue(DEFAULT_COLUMN_C_SCORING),
    saveBQScoringRules: vi.fn().mockResolvedValue({ success: true, version: 5 }),
    saveColumnCScoringRules: vi.fn().mockResolvedValue({
      success: true,
      roundsReprocessed: 2,
      playerRoundsReprocessed: 24,
    }),
  });

  describe("getBQScoringRules", () => {
    it("delegates to repository with valid leagueId", async () => {
      const repo = createMockRepository();
      const result = await getBQScoringRules(validLeagueId, actor, repo);
      expect(result).toEqual(BQ_SCORING_V5);
      expect(repo.getBQScoringRules).toHaveBeenCalledWith(validLeagueId, actor);
    });

    it("throws when leagueId is invalid", async () => {
      const repo = createMockRepository();
      await expect(getBQScoringRules("invalid-uuid", actor, repo)).rejects.toThrow(
        StatisticsValidationError,
      );
    });
  });

  describe("getColumnCScoringRules", () => {
    it("delegates to repository with valid leagueId", async () => {
      const repo = createMockRepository();
      const result = await getColumnCScoringRules(validLeagueId, actor, repo);
      expect(result).toEqual(DEFAULT_COLUMN_C_SCORING);
      expect(repo.getColumnCScoringRules).toHaveBeenCalledWith(validLeagueId, actor);
    });

    it("throws when leagueId is invalid", async () => {
      const repo = createMockRepository();
      await expect(getColumnCScoringRules("invalid-uuid", actor, repo)).rejects.toThrow(
        StatisticsValidationError,
      );
    });
  });

  describe("saveBQScoringRules", () => {
    it("validates snapshot and saves via repository", async () => {
      const repo = createMockRepository();
      const result = await saveBQScoringRules(validLeagueId, BQ_SCORING_V5, actor, repo);
      expect(result).toEqual({ success: true, version: 5 });
      expect(repo.saveBQScoringRules).toHaveBeenCalledWith(validLeagueId, BQ_SCORING_V5, actor);
    });

    it("throws when snapshot has missing values", async () => {
      const repo = createMockRepository();
      await expect(
        saveBQScoringRules(validLeagueId, { goal: 4 }, actor, repo),
      ).rejects.toThrow();
    });
  });

  describe("saveColumnCScoringRules", () => {
    it("validates settings and saves via repository with reprocess option", async () => {
      const repo = createMockRepository();
      const result = await saveColumnCScoringRules(
        validLeagueId,
        DEFAULT_COLUMN_C_SCORING,
        { reprocessRanked: true },
        actor,
        repo,
      );
      expect(result).toEqual({
        success: true,
        roundsReprocessed: 2,
        playerRoundsReprocessed: 24,
      });
      expect(repo.saveColumnCScoringRules).toHaveBeenCalledWith(
        validLeagueId,
        DEFAULT_COLUMN_C_SCORING,
        { reprocessRanked: true },
        actor,
      );
    });

    it("throws when conceded points are positive", async () => {
      const repo = createMockRepository();
      await expect(
        saveColumnCScoringRules(
          validLeagueId,
          { ...DEFAULT_COLUMN_C_SCORING, lineGoalConcededPoints: 2.0 },
          undefined,
          actor,
          repo,
        ),
      ).rejects.toThrow();
    });
  });
});
