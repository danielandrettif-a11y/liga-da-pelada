import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { pgRoundStatisticsRepository, RoundStatisticsPersistenceError } from "./pg-round-statistics-repository.js";

const actor = { userId: "11111111-1111-4111-8111-111111111111" };
const leagueId = "22222222-2222-4222-8222-222222222222";
const roundId = "33333333-3333-4333-8333-333333333333";

function pool(query: ReturnType<typeof vi.fn>): Pool {
  return { connect: vi.fn(async () => ({ query, release: vi.fn() } as unknown as PoolClient)) } as unknown as Pool;
}

describe("pgRoundStatisticsRepository", () => {
  it("authorizes, calculates and reconciles an official finished round in one transaction", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("FROM public.rounds") && sql.includes("suppress_goalkeeper_rewards")) return { rows: [{
        id: roundId, league_id: leagueId, date: "2026-10-30", number: 20,
        created_at: "2026-10-30T00:00:00Z", status: "finished", round_type: "official",
        suppress_goalkeeper_rewards: false, scoring_version: 14, scoring_snapshot: { version: 14 },
      }] };
      return { rows: [] };
    });

    await expect(pgRoundStatisticsRepository(pool(query)).recalculateRoundStats(actor, leagueId, roundId))
      .resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(
      "SELECT public.reconcile_fantasy_round_totals($1::uuid)",
      [roundId],
    );
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects a non-admin before reading or writing round data", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) =>
      sql.includes("is_league_admin") ? { rows: [{ allowed: false }] } : { rows: [] });

    await expect(pgRoundStatisticsRepository(pool(query)).recalculateRoundStats(actor, leagueId, roundId))
      .rejects.toBeInstanceOf(RoundStatisticsPersistenceError);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("suppress_goalkeeper_rewards"))).toBe(false);
  });

  it("returns a scoped round read model and filters registration-only rows", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, status, round_type")) return { rows: [{ id: roundId, status: "finished", round_type: "official" }] };
      if (sql.includes("FROM public.player_round_stats stats")) return { rows: [
        { games: 1, wins: 1, draws: 0, losses: 0, goals: 2, assists: 0, points: 9, player: { id: "p1", name: "A" } },
        { games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, points: 0, player: { id: "p2", name: "B" } },
      ] };
      return { rows: [] };
    });
    const result = await pgRoundStatisticsRepository(pool(query)).findRoundStatistics(actor, leagueId, roundId);
    expect(result?.entries).toHaveLength(1);
    expect(result?.highlights.scorers[0].player.id).toBe("p1");
  });

  it("maps friendly season statistics and goalkeeper awards", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.seasons")) return { rows: [{ id: "season-1" }] };
      if (sql.includes("FROM public.player_season_stats")) return { rows: [{
        player_id: "p1", player_name: "Atleta", player_member_category: "player", player_is_selectable: true,
        rounds_count: 2, games: 3, wins: 2, draws: 0, losses: 1, goals: 4, assists: 1,
      }] };
      if (sql.includes("best_goalkeeper_player_id")) return { rows: [{ best_goalkeeper_player_id: "p1" }] };
      return { rows: [] };
    });
    const result = await pgRoundStatisticsRepository(pool(query)).findFriendlyStats(actor, leagueId);
    expect(result).toEqual([expect.objectContaining({ rounds: 2, games: 3, bestGoalkeeper: 1 })]);
  });
});
