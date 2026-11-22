import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { pgSeasonOperationsRepository, SeasonOperationsPersistenceError } from "./pg-season-operations-repository.js";

const actor = { userId: "11111111-1111-4111-8111-111111111111" };
const leagueId = "22222222-2222-4222-8222-222222222222";
const pool = (query: ReturnType<typeof vi.fn>) => ({
  connect: vi.fn(async () => ({ query, release: vi.fn() } as unknown as PoolClient)),
}) as unknown as Pool;

describe("pgSeasonOperationsRepository", () => {
  it("returns only active player card overalls", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("league_members")) return { rows: [{ player_id: "p1" }] };
      if (sql.includes("get_latest_player_card_overalls")) return { rows: [{ player_id: "p1", overall: 80 }, { player_id: "p2", overall: 90 }] };
      return { rows: [] };
    });
    const result = await pgSeasonOperationsRepository(pool(query)).findPlayerCardOveralls(actor, leagueId);
    expect(Object.keys(result)).toEqual(["p1"]);
  });

  it("builds standings from the active scoped season", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.seasons")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
      if (sql.includes("FROM public.rounds")) return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] };
      if (sql.includes("FROM public.teams")) return { rows: [
        { id: "a", round_id: "44444444-4444-4444-8444-444444444444", name: "Meia Boca Juniors", crest_url: null },
        { id: "b", round_id: "44444444-4444-4444-8444-444444444444", name: "MilamB", crest_url: null },
      ] };
      if (sql.includes("FROM public.matches")) return { rows: [{ id: "m", round_id: "44444444-4444-4444-8444-444444444444", status: "finished", team_a_id: "a", team_b_id: "b", score_a: 1, score_b: 0 }] };
      return { rows: [] };
    });
    const result = await pgSeasonOperationsRepository(pool(query)).findTeamStandings(actor, leagueId);
    expect(result[0]).toMatchObject({ name: "Meia Boca Juniors", points: 3 });
  });

  it("rejects reprocessing before the RPC when the actor is not an app admin", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => sql.includes("is_app_admin")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    await expect(pgSeasonOperationsRepository(pool(query)).executeReprocess(actor, leagueId))
      .rejects.toBeInstanceOf(SeasonOperationsPersistenceError);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("reprocess_active_season_v5"))).toBe(false);
  });

  it("executes the legacy atomic RPC as the authenticated administrator", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_app_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("reprocess_active_season_v5")) return { rows: [{ result: { success: true, rounds_reprocessed: 3 } }] };
      return { rows: [] };
    });
    await expect(pgSeasonOperationsRepository(pool(query)).executeReprocess(actor, leagueId))
      .resolves.toMatchObject({ success: true, rounds_reprocessed: 3 });
    expect(query).toHaveBeenCalledWith("COMMIT");
  });
});
