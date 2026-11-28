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

  it("rejects reprocessing before the RPC when the actor is not a league/app admin", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => sql.includes("is_app_admin")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    await expect(pgSeasonOperationsRepository(pool(query)).executeReprocess(actor, leagueId))
      .rejects.toBeInstanceOf(SeasonOperationsPersistenceError);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("prepare_reprocess_active_season_v15"))).toBe(false);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("prepares v15 under privileged boundary, drops role to authenticated, recalculates rounds and audits fantasy", async () => {
    const roundA = "44444444-4444-4444-8444-444444444444";
    const roundB = "55555555-5555-4555-8555-555555555555";
    const callOrder: string[] = [];
    const recalculateRound = vi.fn(async (_client: PoolClient, _leagueId: string, roundId: string) => {
      callOrder.push(`recalc:${roundId}`);
    });
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_app_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("prepare_reprocess_active_season_v15")) {
        callOrder.push("prepare");
        return { rows: [{ result: {
          success: true,
          season_id: "33333333-3333-4333-8333-333333333333",
          round_ids: [roundA, roundB],
          first_round_id: roundA,
          rounds_count: 2,
          lineups_count: 36,
        } }] };
      }
      if (sql.includes("set_config('role', 'authenticated', true)")) {
        callOrder.push("drop_role");
        return { rows: [] };
      }
      if (sql.includes("reprocess_fantasy_from_round")) {
        callOrder.push("reprocess_fantasy");
        return { rows: [] };
      }
      if (sql === "SELECT set_config('role', 'reprocess_executor', true)") {
        callOrder.push("elevate_executor");
        return { rows: [] };
      }
      if (sql.includes("finalize_reprocess_active_season_v15")) {
        callOrder.push("finalize_and_audit");
        return { rows: [] };
      }
      return { rows: [] };
    });
    await expect(pgSeasonOperationsRepository(pool(query), recalculateRound).executeReprocess(actor, leagueId))
      .resolves.toMatchObject({ success: true, rounds_reprocessed: 2, lineups_reprocessed: 36 });
    expect(callOrder).toEqual([
      "prepare",
      "drop_role",
      `recalc:${roundA}`,
      `recalc:${roundB}`,
      "reprocess_fantasy",
      "elevate_executor",
      "finalize_and_audit",
    ]);
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("rolls back the entire transaction when round calculation or fantasy audit fails", async () => {
    const roundA = "44444444-4444-4444-8444-444444444444";
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("is_app_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("prepare_reprocess_active_season_v15")) return { rows: [{ result: {
        success: true,
        season_id: "33333333-3333-4333-8333-333333333333",
        round_ids: [roundA],
        first_round_id: roundA,
        rounds_count: 1,
        lineups_count: 18,
      } }] };
      if (sql.includes("finalize_reprocess_active_season_v15")) {
        throw new Error("Divergência detectada na auditoria do Cartola pós-reprocessamento");
      }
      return { rows: [] };
    });
    await expect(pgSeasonOperationsRepository(pool(query), async () => undefined).executeReprocess(actor, leagueId))
      .rejects.toThrow("Divergência detectada na auditoria do Cartola");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
  });
});
