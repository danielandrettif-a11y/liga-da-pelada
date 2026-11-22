import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  pgScoringRulesRepository,
  ScoringRulesPersistenceError,
} from "./pg-scoring-rules-repository.js";
import {
  BQ_SCORING_V5,
  DEFAULT_COLUMN_C_SCORING,
} from "../domain/scoring-policy.js";

describe("pgScoringRulesRepository", () => {
  const leagueId = "00000000-0000-4000-8000-000000000001";
  const actor = { userId: "00000000-0000-4000-8000-000000000002" };

  describe("getBQScoringRules", () => {
    it("returns rules from database converted to snapshot", async () => {
      const query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM public.ranking_rules")) {
          return {
            rows: [
              { event_type: "goal", points: 4 },
              { event_type: "assist", points: 2.5 },
              { event_type: "win", points: 3 },
              { event_type: "draw", points: 1 },
              { event_type: "loss", points: -2.5 },
              { event_type: "own_goal", points: -3 },
              { event_type: "goalkeeper_appearance", points: 2 },
              { event_type: "goal_conceded", points: -1 },
            ],
          };
        }
        return { rows: [] };
      });
      const pool = {
        connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      } as unknown as Pool;

      const repo = pgScoringRulesRepository(pool);
      const snapshot = await repo.getBQScoringRules(leagueId, actor);
      expect(snapshot).toEqual(BQ_SCORING_V5);
    });

    it("returns BQ_SCORING_V5 default when table has no rows", async () => {
      const query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM public.ranking_rules")) {
          return { rows: [] };
        }
        return { rows: [] };
      });
      const pool = {
        connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      } as unknown as Pool;

      const repo = pgScoringRulesRepository(pool);
      const snapshot = await repo.getBQScoringRules(leagueId, actor);
      expect(snapshot).toEqual(BQ_SCORING_V5);
    });
  });

  describe("getColumnCScoringRules", () => {
    it("returns settings from database", async () => {
      const query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM public.fantasy_settings")) {
          return {
            rows: [
              {
                attacker_goal_points: 4,
                attacker_assist_points: 2.5,
                line_goal_conceded_points: -0.5,
                defender_goal_points: 5,
                defender_assist_points: 3,
                defender_clean_sheet_points: 3,
                defender_one_goal_points: 1,
                defender_one_goal_conceded_points: -0.75,
                defender_two_goals_conceded_points: -1.75,
                goalkeeper_slot_appearance_points: 1,
                goalkeeper_slot_goal_conceded_points: -0.5,
                goalkeeper_slot_clean_sheet_points: 4,
                goalkeeper_slot_one_goal_points: 2,
              },
            ],
          };
        }
        return { rows: [] };
      });
      const pool = {
        connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      } as unknown as Pool;

      const repo = pgScoringRulesRepository(pool);
      const settings = await repo.getColumnCScoringRules(leagueId, actor);
      expect(settings).toEqual(DEFAULT_COLUMN_C_SCORING);
    });

    it("returns DEFAULT_COLUMN_C_SCORING when fantasy_settings has no row", async () => {
      const query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM public.fantasy_settings")) {
          return { rows: [] };
        }
        return { rows: [] };
      });
      const pool = {
        connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      } as unknown as Pool;

      const repo = pgScoringRulesRepository(pool);
      const settings = await repo.getColumnCScoringRules(leagueId, actor);
      expect(settings).toEqual(DEFAULT_COLUMN_C_SCORING);
    });
  });

  describe("saveBQScoringRules", () => {
    it("calls save_bq_scoring_rules RPC when user is admin", async () => {
      const query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("is_league_admin")) {
          return { rows: [{ is_admin: true }] };
        }
        if (sql.includes("save_bq_scoring_rules")) {
          return { rows: [{ result: { success: true, version: 5 } }] };
        }
        return { rows: [] };
      });
      const pool = {
        connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      } as unknown as Pool;

      const repo = pgScoringRulesRepository(pool);
      const result = await repo.saveBQScoringRules(leagueId, BQ_SCORING_V5, actor);
      expect(result).toEqual({ success: true, version: 5 });
    });

    it("throws 403 when user is not admin", async () => {
      const query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("is_league_admin")) {
          return { rows: [{ is_admin: false }] };
        }
        return { rows: [] };
      });
      const pool = {
        connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      } as unknown as Pool;

      const repo = pgScoringRulesRepository(pool);
      await expect(
        repo.saveBQScoringRules(leagueId, BQ_SCORING_V5, actor),
      ).rejects.toThrow(ScoringRulesPersistenceError);
    });
  });

  describe("saveColumnCScoringRules", () => {
    it("calls save_column_c_scoring_settings RPC and returns reprocessed counters", async () => {
      const query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("is_league_admin")) {
          return { rows: [{ is_admin: true }] };
        }
        if (sql.includes("save_column_c_scoring_settings")) {
          return {
            rows: [
              {
                result: {
                  rounds_reprocessed: 3,
                  player_rounds_reprocessed: 36,
                },
              },
            ],
          };
        }
        return { rows: [] };
      });
      const pool = {
        connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      } as unknown as Pool;

      const repo = pgScoringRulesRepository(pool);
      const result = await repo.saveColumnCScoringRules(
        leagueId,
        DEFAULT_COLUMN_C_SCORING,
        { reprocessRanked: true },
        actor,
      );
      expect(result).toEqual({
        success: true,
        roundsReprocessed: 3,
        playerRoundsReprocessed: 36,
      });
    });

    it("throws 403 when user is not admin", async () => {
      const query = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("is_league_admin")) {
          return { rows: [{ is_admin: false }] };
        }
        return { rows: [] };
      });
      const pool = {
        connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      } as unknown as Pool;

      const repo = pgScoringRulesRepository(pool);
      await expect(
        repo.saveColumnCScoringRules(
          leagueId,
          DEFAULT_COLUMN_C_SCORING,
          { reprocessRanked: false },
          actor,
        ),
      ).rejects.toThrow(ScoringRulesPersistenceError);
    });
  });
});
