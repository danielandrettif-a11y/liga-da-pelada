import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgMatchRepository } from "./pg-match-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const matchId = "00000000-0000-4000-8000-000000000002";
const roundId = "00000000-0000-4000-8000-000000000003";
const teamAId = "00000000-0000-4000-8000-000000000004";
const teamBId = "00000000-0000-4000-8000-000000000005";
const actor = { userId: "user-123" };

describe("pgMatchRepository", () => {
  it("getMatch returns structured match details", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.matches m")) {
        return {
          rows: [
            {
              id: matchId,
              round_id: roundId,
              team_a_id: teamAId,
              team_b_id: teamBId,
              status: "live",
              score_a: 1,
              score_b: 0,
            },
          ],
        };
      }
      if (sql.includes("FROM public.teams WHERE id = $1")) {
        return { rows: [{ id: teamAId, name: "Time A" }] };
      }
      if (sql.includes("FROM public.rounds WHERE id = $1")) {
        return { rows: [{ id: roundId, league_id: leagueId }] };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgMatchRepository(pool);
    const result = await repo.getMatch(matchId, leagueId, actor);

    expect(result?.id).toBe(matchId);
    expect(result?.team_a?.name).toBe("Time A");
  });

  it("findLiveMatchForTeams queries match id", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.matches m")) {
        return { rows: [{ id: matchId }] };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgMatchRepository(pool);
    const result = await repo.findLiveMatchForTeams(roundId, teamAId, teamBId, leagueId, actor);

    expect(result).toBe(matchId);
  });

  it("finishMatch updates match status to finished", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) {
        return { rows: [{ allowed: true }] };
      }
      if (sql.includes("UPDATE public.matches")) {
        return { rows: [{ round_id: roundId }] };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgMatchRepository(pool);
    const result = await repo.finishMatch(matchId, leagueId, actor);

    expect(result.roundId).toBe(roundId);
  });

  it("deleteMatch removes match from database", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) {
        return { rows: [{ allowed: true }] };
      }
      if (sql.includes("SELECT round_id FROM public.matches")) {
        return { rows: [{ round_id: roundId }] };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgMatchRepository(pool);
    const result = await repo.deleteMatch(matchId, leagueId, actor);

    expect(result.roundId).toBe(roundId);
  });
});
