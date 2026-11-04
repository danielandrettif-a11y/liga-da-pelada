import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { RoundStatisticsRepository } from "../../statistics/application/manage-round-statistics.js";
import { PgFantasyAdminRepository } from "./pg-fantasy-admin-repository.js";

describe("Infrastructure: PgFantasyAdminRepository", () => {
  const roundStatistics = { recalculateRoundStats: vi.fn().mockResolvedValue(undefined),
    findRoundStatistics: vi.fn(), findFriendlyStats: vi.fn() } as unknown as RoundStatisticsRepository;
  const createMockPool = (queryHandler: (sql: string, params?: any[]) => Promise<any>): Pool => {
    const client = {
      query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("SET LOCAL ROLE")) return Promise.resolve({});
        return queryHandler(sql, params);
      }),
      release: vi.fn(),
    };
    return {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;
  };

  it("builds the canonical enriched ranking contract", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("SELECT fantasy_season.id")) return { rows: [{ id: "fs1" }] };
      if (sql.includes("SELECT fantasy_round.id")) return { rows: [{ id: "fr1", round_id: "r1", market_status: "finished", date: "2026-01-01", number: 1, status: "finished" }] };
      if (sql.includes("WITH lineup_metrics")) {
        return {
          rows: [
            {
              user_id: "u1",
              total_points: 150.5,
              current_budget: 100,
              rounds_played: 5,
            },
          ],
        };
      }
      if (sql.includes("FROM public.account_profiles")) return { rows: [{ user_id: "u1", player: { name: "Cartoleiro 1", avatar_url: null } }] };
      if (sql.includes("FROM public.account_cosmetic_loadouts")) return { rows: [] };
      return { rows: [] };
    });

    const repo = new PgFantasyAdminRepository(pool, roundStatistics);
    const rows = await repo.getRanking("l1", "season", "viewer-1");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ user_id: "u1", total_points: 150.5, position: 1,
      player: { name: "Cartoleiro 1", avatar_url: null } });
  });

  it("returns user history scoped to the selected league and active season", async () => {
    const pool = createMockPool(async (sql, params) => {
      if (sql.includes("FROM public.account_profiles profile")) {
        expect(params).toEqual(["league-1", "user-1"]);
        return { rows: [{ user_id: "user-1", players: { name: "Alice", avatar_url: null } }] };
      }
      if (sql.includes("FROM public.fantasy_accounts account")) {
        expect(params).toEqual(["league-1", "user-1"]);
        return { rows: [{ total_points: "42.5", current_budget: "61.25", rounds_played: 2,
          best_round_points: "25.5" }] };
      }
      if (sql.includes("FROM public.fantasy_lineups lineup")) {
        expect(sql).toContain("core.status='active'");
        expect(sql).toContain("lineup.status='scored'");
        return { rows: [{ id: "lineup-1", fantasy_round: { round_id: "round-1" },
          round: { number: 1, date: "2026-01-01", status: "finished" } }] };
      }
      if (sql.includes("FROM public.fantasy_card_activations activation")) {
        return { rows: [{ round_id: "round-1", status: "APPLIED", result_bonus: "3",
          result_details: { description: "Bônus" },
          card: { name: "Carta", slug: "card", rarity: "COMMON", description: null } }] };
      }
      return { rows: [] };
    });

    const history = await new PgFantasyAdminRepository(pool, roundStatistics)
      .getUserHistory("league-1", "user-1", "viewer-1");

    expect(history).toMatchObject({
      userId: "user-1",
      player: { name: "Alice", avatar_url: null },
      account: { totalPoints: 42.5, currentBudget: 61.25, roundsPlayed: 2, bestRoundPoints: 25.5 },
      lineups: [{ id: "lineup-1", fantasyRound: { round_id: "round-1" },
        activeCard: { slug: "card", bonus: 3 } }],
    });
  });

  it("updates fantasy settings initial budget", async () => {
    const executedSql: string[] = [];
    const pool = createMockPool(async (sql) => {
      executedSql.push(sql);
      return { rows: [] };
    });

    const repo = new PgFantasyAdminRepository(pool, roundStatistics);
    const res = await repo.updateSettings("l1", { initial_budget: 120 }, "admin-1");
    expect(res.success).toBe(true);
    expect(executedSql.some((sql) => sql.includes("update_fantasy_settings_for_league"))).toBe(true);
  });

  it("handles test session create and reset", async () => {
    const pool = createMockPool(async (sql) => sql.includes("create_fantasy_test_session")
      || sql.includes("process_fantasy_test_round") || sql.includes("reset_fantasy_test_session")
      ? { rows: [{ data: true }] }
      : { rows: [] });
    const repo = new PgFantasyAdminRepository(pool, roundStatistics);

    expect((await repo.createTestSession("l1", "r1", "admin-1")).success).toBe(true);
    expect((await repo.processTestSession("l1", "r1", "admin-1")).success).toBe(true);
    expect((await repo.resetTestSession("l1", "r1", "admin-1")).success).toBe(true);
  });
});

