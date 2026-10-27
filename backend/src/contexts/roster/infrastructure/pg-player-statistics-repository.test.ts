import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgPlayerStatisticsRepository } from "./pg-player-statistics-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

function poolWith(query: ReturnType<typeof vi.fn>): Pool {
  return { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
}

describe("pgPlayerStatisticsRepository", () => {
  it("reads active-season totals scoped by league and round type", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: true }] }
      : sql.includes("player_season_stats") ? { rows: [{
        player_id: playerId, rounds_count: "2", games: 4, goals: 3, assists: 1,
        wins: 1, draws: 1, losses: 0, points: "4", ranking_points: "9.5",
      }] } : { rows: [] });
    const result = await pgPlayerStatisticsRepository(poolWith(query)).listSeasonTotals(leagueId, "official", actor);
    expect(result).toMatchObject([{ playerId, rounds: "2", rankingPoints: "9.5" }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("season.league_id = $1::uuid"), [leagueId, "official"]);
  });

  it("does not read statistics when the actor is outside the league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    await expect(pgPlayerStatisticsRepository(poolWith(query)).listSeasonTotals(leagueId, "official", actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("player_season_stats"))).toBe(false);
  });

  it("maps the latest positional OVR projection", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: true }] }
      : sql.includes("get_latest_player_card_overalls_for_league") ? { rows: [{
        player_id: playerId, overall: "82", def_overall: "80", ala_mei_overall: "83",
        ata_overall: "85", gol_overall: "70",
      }] } : { rows: [] });
    await expect(pgPlayerStatisticsRepository(poolWith(query)).listLatestOveralls(leagueId, actor))
      .resolves.toEqual([{ playerId, overall: "82", defOverall: "80", alaMeiOverall: "83", ataOverall: "85", golOverall: "70" }]);
  });
});
