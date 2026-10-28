import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgCallupRepository } from "./pg-callup-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const callupId = "00000000-0000-4000-8000-000000000002";
const playerId = "00000000-0000-4000-8000-000000000003";
const roundId = "00000000-0000-4000-8000-000000000004";
const actor = { userId: "user-123" };

describe("pgCallupRepository", () => {
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
            },
          ],
        };
      }
      if (sql.includes("FROM public.rounds")) {
        return { rows: [{ id: roundId, status: "draft" }] };
      }
      if (sql.includes("FROM public.matches")) {
        return { rows: [] };
      }
      if (sql.includes("FROM public.teams")) {
        return { rows: [] };
      }
      if (sql.includes("FROM public.callup_entries ce")) {
        return {
          rows: [
            {
              id: "entry-1",
              callup_id: callupId,
              player_id: playerId,
              status: "confirmed",
              position: 1,
              created_at: new Date("2026-10-27T10:05:00Z"),
              p_id: playerId,
              p_name: "Jogador Teste",
              p_nickname: "Teste",
              p_avatar_url: null,
              p_player_profile: "midfield",
              p_is_goalkeeper: false,
              p_member_category: "monthly",
            },
          ],
        };
      }
      if (sql.includes("get_callup_entry_joiners")) {
        return { rows: [{ callup_entry_id: "entry-1", joined_by_name: "Organizador" }] };
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
    expect(query).toHaveBeenCalledWith("SET LOCAL ROLE authenticated");
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

  it("creates a callup as admin", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("create_league_callup")) return { rows: [{ create_league_callup: callupId }] };
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
});
