import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgPlayerAwardsRepository } from "./pg-player-awards-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("pgPlayerAwardsRepository", () => {
  it("runs all projections through their scoped database functions", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: true }] }
      : sql.includes("get_player_achievement_belts") ? { rows: [{ belts: [] }] }
      : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgPlayerAwardsRepository(pool);
    await repository.listMonthlyAwards(leagueId, playerId, actor);
    await repository.listAchievementBelts(leagueId, playerId, actor);
    await repository.listMonthlyAwardWinners(leagueId, "2026-09-01", actor);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("get_monthly_awards_for_player_in_league"), [leagueId, playerId]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("get_player_achievement_belts"), [leagueId, playerId]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("get_monthly_award_winners_for_league"), [leagueId, "2026-09-01"]);
  });

  it("rejects actors outside the selected league before reading awards", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgPlayerAwardsRepository(pool).listMonthlyAwards(leagueId, playerId, actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("get_monthly_awards_for_player"))).toBe(false);
  });
});
