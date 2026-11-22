import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgSpeedRatingRepository } from "./pg-speed-rating-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("pgSpeedRatingRepository", () => {
  it("checks league administration inside the authenticated transaction", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] }
      : sql.includes("SELECT player_id")
        ? { rows: [{ player_id: playerId, speed_rating: 3 }] }
        : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgSpeedRatingRepository(pool).listRatings(leagueId, actor)).resolves.toEqual({ [playerId]: 3 });
    expect(query.mock.calls.find(([sql]) => String(sql).includes("is_league_admin"))).toBeTruthy();
  });

  it("never updates a member before the scoped authorization check", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: false }] } : { rows: [{ id: "membership" }] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgSpeedRatingRepository(pool).setRating(leagueId, playerId, 2, actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE public.league_members"))).toBe(false);
  });

  it("returns only eligible players from the requested league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] }
      : sql.includes("JOIN public.players")
        ? { rows: [{ player_id: playerId, speed_rating: null }] }
        : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgSpeedRatingRepository(pool).listEligiblePlayers(leagueId, [playerId], actor))
      .resolves.toEqual([{ id: playerId, speedRating: null }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("player.member_category IN"), [leagueId, [playerId]]);
  });
});
