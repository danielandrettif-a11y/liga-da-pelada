import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgPlayerHistoryRepository } from "./pg-player-history-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("pgPlayerHistoryRepository", () => {
  it("limits round history to the active season, league and requested type", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: true }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await pgPlayerHistoryRepository(pool).listRoundHistory(leagueId, playerId, "friendly", actor);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("season.status = 'active'"),
      [leagueId, playerId, "friendly"]);
  });

  it("loads finished official rounds and award competitors in one authenticated transaction", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_member")) return { rows: [{ allowed: true }] };
      if (sql.includes("season.number AS season_number")) return { rows: [{ id: "round-1", number: 1,
        date: "2026-10-20", season_id: "season-1", season_number: 2, season_status: "active",
        best_goalkeeper_player_id: null }] };
      if (sql.includes("player.member_category")) return { rows: [{ player_id: playerId, round_id: "round-1",
        goals: 2, assists: 1, wins: 1, points: 8, games: 2, defensive_clean_games: 0,
        defensive_one_goal_games: 0, team_goals_conceded: 2, player_profile: "offensive",
        member_category: "player", is_selectable: true }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgPlayerHistoryRepository(pool).readAwardHistory(leagueId, actor))
      .resolves.toMatchObject({ rounds: [{ seasonNumber: 2 }], stats: [{ playerId }] });
  });

  it("stops before history queries when the actor is outside the league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgPlayerHistoryRepository(pool).listRoundHistory(leagueId, playerId, "official", actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("player_round_stats"))).toBe(false);
  });
});
