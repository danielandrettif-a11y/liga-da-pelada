import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgSeasonRepository } from "./pg-season-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("pgSeasonRepository", () => {
  it("reads scoped season projections under verified claims", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.seasons WHERE") && sql.includes("status = 'active'")) return { rows: [{
        id: "season-1", league_id: leagueId, number: 1, status: "active",
        started_at: new Date("2026-01-01T00:00:00Z"), ended_at: null, stats_snapshot: null,
        created_at: new Date("2026-01-01T00:00:00Z"),
      }] };
      if (sql.includes("JOIN public.seasons")) return { rows: [{ id: "round-1" }] };
      if (sql.includes("status = 'finished'")) return { rows: [{ stats_snapshot: { seasonId: "old" } }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgSeasonRepository(pool);
    await expect(repository.getActive(leagueId, actor)).resolves.toMatchObject({ id: "season-1", started_at: "2026-01-01T00:00:00.000Z" });
    await expect(repository.getActiveRoundIds(leagueId, "official", actor)).resolves.toEqual(["round-1"]);
    await expect(repository.getLatestFinishedSummary(leagueId, actor)).resolves.toMatchObject({ seasonId: "old" });
    expect(query.mock.calls.filter(([sql]) => sql === "SET LOCAL ROLE authenticated")).toHaveLength(3);
  });

  it("builds and commits the snapshot in the same authenticated transaction", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("FOR UPDATE OF season")) return { rows: [{
        league_name: "Pelada BQ", id: "season-1", number: 1, started_at: new Date("2026-01-01T00:00:00Z"),
      }] };
      if (sql.includes("FROM public.rounds WHERE")) return { rows: [{ id: "round-1", status: "finished", round_type: "official" }] };
      if (sql.includes("FROM public.matches")) return { rows: [{ status: "finished", event_count: 2 }] };
      if (sql.includes("FROM public.round_players")) return { rows: [{ player_id: "player-1" }] };
      if (sql.includes("FROM public.player_round_stats")) return { rows: [{
        id: "player-1", name: "Ana", nickname: null, games: 1, wins: 1, draws: 0, losses: 0,
        goals: 2, assists: 0, points: "4",
      }] };
      if (sql.includes("public.finish_season")) return { rows: [{ new_season_number: 2 }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const result = await pgSeasonRepository(pool).finish(leagueId, actor, "2026-10-26T12:00:00.000Z");
    expect(result.newSeasonNumber).toBe(2);
    expect(result.summary).toMatchObject({ seasonId: "season-1", roundCount: 1, goalCount: 2, playerCount: 1 });
    const rpcCall = query.mock.calls.find(([sql]) => String(sql).includes("public.finish_season"));
    expect(JSON.parse(String(rpcCall?.[1]?.[1]))).toMatchObject({ seasonId: "season-1", leagueName: "Pelada BQ" });
    expect(query).toHaveBeenCalledWith("COMMIT");
  });
});
