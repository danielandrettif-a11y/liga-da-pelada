import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgPlayerProfilePerformanceRepository } from "./pg-player-profile-performance-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("pgPlayerProfilePerformanceRepository", () => {
  it("loads playtime intervals only from matches in the selected league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: true }] }
      : sql.includes("match_players") ? { rows: [{
        entered_elapsed_seconds: 30, left_elapsed_seconds: 120,
        started_at: "2026-10-20T10:00:00.000Z", finished_at: "2026-10-20T10:07:00.000Z",
        timer_started_at: null, timer_accumulated_seconds: 420, round_type: "official",
      }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgPlayerProfilePerformanceRepository(pool).listParticipations(leagueId, playerId, actor))
      .resolves.toMatchObject([{ enteredElapsedSeconds: 30, roundType: "official" }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("round_item.league_id = $1::uuid"), [leagueId, playerId]);
  });

  it("loads only goal events by the requested player and league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: true }] }
      : sql.includes("match_events") ? { rows: [{
        team_id: "team-1", team_name: "Azul", team_color: "#0000FF", crest_url: null,
        round_type: "friendly",
      }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgPlayerProfilePerformanceRepository(pool).listGoalEvents(leagueId, playerId, actor))
      .resolves.toMatchObject([{ teamName: "Azul", roundType: "friendly" }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("event.event_type = 'goal'"), [leagueId, playerId]);
  });

  it("does not query performance data when the actor is outside the league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgPlayerProfilePerformanceRepository(pool).listGoalEvents(leagueId, playerId, actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("match_events"))).toBe(false);
  });
});
