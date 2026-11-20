import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgCallupRepository } from "./pg-callup-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const callupId = "00000000-0000-4000-8000-000000000002";
const playerId = "00000000-0000-4000-8000-000000000003";
const roundId = "00000000-0000-4000-8000-000000000004";
const actor = { userId: "user-123" };

describe("pgCallupRepository", () => {
  it("keeps successful members when another player is rejected inside the batch", async () => {
    const rejectedId = "00000000-0000-4000-8000-000000000005";
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM unnest")) return { rows: [{ allowed: true }] };
      if (sql.includes("public.add_player_to_callup") && params?.[1] === rejectedId) {
        throw Object.assign(new Error("A lista de espera está cheia."), { code: "P0001" });
      }
      return { rows: [] };
    });
    const connect = vi.fn().mockResolvedValue({ query, release: vi.fn() });
    const pool = { connect } as unknown as Pool;
    const result = await pgCallupRepository(pool).addPlayers(leagueId, callupId, [playerId, rejectedId], actor);

    expect(result).toEqual({
      added: 1,
      failures: [{ playerId: rejectedId, error: "A lista de espera está cheia." }],
    });
    expect(connect).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith("ROLLBACK TO SAVEPOINT add_callup_player");
    expect(query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("lists active callups with entries and linked round details", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.callups c")) {
        return {
          rows: [
            {
              id: callupId,
              league_id: leagueId,
              date: "2026-10-30",
              start_time: "08:00:00",
              stadium_id: null,
              round_type: "official",
              status: "open",
              is_public: true,
              players_per_team: 6,
              teams_per_round: 4,
              capacity: 24,
              round_id: roundId,
              created_at: new Date("2026-10-27T10:00:00Z"),
              updated_at: null,
              round: { id: roundId, status: "draft", matches: [], teams: [] },
              entries: [{ id: "entry-1", player_id: playerId, joined_by_name: "Organizador" }],
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgCallupRepository(pool);
    const result = await repo.listActive(leagueId, actor);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(callupId);
    expect(result[0]?.entries).toHaveLength(1);
    expect(result[0]?.entries[0]?.joined_by_name).toBe("Organizador");
    expect(query).toHaveBeenCalledTimes(4);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set_config('role', 'authenticated'"), expect.any(Array));
  });

  it("lists agenda callups for a league", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.callups c")) {
        return {
          rows: [
            {
              id: callupId,
              league_id: leagueId,
              date: "2026-10-30",
              start_time: "08:00:00",
              round_type: "official",
              status: "open",
              round_id: null,
              created_at: new Date("2026-10-27T10:00:00Z"),
              playersCount: 14,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgCallupRepository(pool);
    const result = await repo.listAgenda(leagueId, actor);

    expect(result).toHaveLength(1);
    expect(result[0]?.playersCount).toBe(14);
  });

  it.each(["stale", "concurrent"])("refuses the %s version before changing a callup", async (scenario) => {
    const version = "2026-10-30T12:00:00.123456+00:00";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("AS matches_version")) return { rows: [{ matches_version: scenario === "concurrent" }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;

    await expect(pgCallupRepository(pool).setVisibility(leagueId, callupId, false, actor, version))
      .rejects.toMatchObject({ name: "CallupVersionConflict" });
    expect(query.mock.calls.some(([sql]) => sql.includes("FOR UPDATE"))).toBe(scenario === "concurrent");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE public.callups"))).toBe(false);
    expect(query.mock.lastCall).toEqual(["ROLLBACK"]);
  });

  it("creates a callup as admin", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("create_league_callup")) return { rows: [{ create_league_callup: callupId }] };
      if (sql.includes("save_round_prelist")) return { rows: [{ save_round_prelist: roundId }] };
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgCallupRepository(pool);
    const result = await repo.openCallup(
      leagueId,
      {
        date: "2026-10-30",
        startTime: "08:00",
        stadiumId: null,
        roundType: "official",
        playersPerTeam: 6,
        teamsPerRound: 4,
        capacity: 24,
      },
      actor,
    );

    expect(result.callupId).toBe(callupId);
    expect(result.roundId).toBe(roundId);
  });

  it("joins a callup and repairs player if needed", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.callups")) return { rows: [{ id: callupId }] };
      if (sql.includes("ensure_my_player_account")) return { rows: [] };
      if (sql.includes("join_callup")) {
        return { rows: [{ join_callup: { status: "confirmed", position: 5 } }] };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgCallupRepository(pool);
    const result = await repo.joinCallup(leagueId, callupId, actor);

    expect(result).toEqual({ status: "confirmed", position: 5 });
  });

  it("leaves a callup and returns linked roundId", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.callups")) return { rows: [{ round_id: roundId }] };
      if (sql.includes("leave_callup")) return { rows: [] };
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgCallupRepository(pool);
    const result = await repo.leaveCallup(leagueId, callupId, actor);

    expect(result).toEqual({ roundId });
  });

  it("does not lock an incomplete callup", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("confirmed_count")) return { rows: [{ capacity: 12, confirmed_count: 11 }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;

    await expect(pgCallupRepository(pool).lockCallup(leagueId, callupId, actor))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("SET status = 'locked'"), expect.anything());
  });

  it("returns the existing prelist without creating a duplicate", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("FROM public.callups") && sql.includes("round_id")) {
        return { rows: [{
          id: callupId,
          date: "2026-10-30",
          start_time: "08:00",
          stadium_id: null,
          stadium_name: null,
          stadium_map_url: null,
          round_type: "official",
          status: "open",
          round_id: roundId,
        }] };
      }
      if (sql.includes("preparation_stage")) {
        return { rows: [{ id: roundId, status: "draft", preparation_stage: "prelist" }] };
      }
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;

    await expect(pgCallupRepository(pool).createPrelist(leagueId, callupId, actor))
      .resolves.toEqual({ roundId, created: false });
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("save_round_prelist"), expect.anything());
  });
});
