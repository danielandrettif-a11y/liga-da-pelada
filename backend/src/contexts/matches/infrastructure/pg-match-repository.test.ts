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
    expect(query).toHaveBeenCalledWith(expect.stringContaining("m.timer_started_at IS NOT NULL"), [
      roundId, teamAId, teamBId, leagueId,
    ]);
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

  it("delegates goals, goalkeepers and substitutions to the canonical scoped RPCs", async () => {
    const eventId = "00000000-0000-4000-8000-000000000006";
    const playerAId = "00000000-0000-4000-8000-000000000007";
    const playerBId = "00000000-0000-4000-8000-000000000008";
    const substitutionId = "00000000-0000-4000-8000-000000000009";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("SELECT match_item.round_id")) {
        return { rows: [{ round_id: roundId, status: "live", team_a_id: teamAId, team_b_id: teamBId }] };
      }
      if (sql.includes("SELECT event.match_id")) return { rows: [{ match_id: matchId, round_id: roundId }] };
      if (sql.includes("delete_match_event")) {
        return { rows: [{ receipt: { round_id: roundId, score_a: 1, score_b: 0 } }] };
      }
      if (sql.includes("correct_finished_goal_event") || sql.includes("correct_finished_goal($1")) {
        return { rows: [{ receipt: { round_id: roundId, match_id: matchId } }] };
      }
      if (sql.includes("add_finished_goal_event")) {
        return { rows: [{ receipt: { round_id: roundId, match_id: matchId } }] };
      }
      if (sql.includes("SELECT EXISTS") && sql.includes("public.teams team")) return { rows: [{ found: true }] };
      if (sql.includes("round_player.attendance_status")) {
        return { rows: [{ formation_mode: "balanced", attendance_status: "present" }] };
      }
      if (sql.includes("substitute_match_player")) return { rows: [{ id: substitutionId }] };
      if (sql.includes("SELECT EXISTS") && sql.includes("match_substitutions")) return { rows: [{ found: true }] };
      return { rows: [], rowCount: 1 };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgMatchRepository(pool);

    await expect(repo.deleteEvent(eventId, matchId, leagueId, actor))
      .resolves.toEqual({ roundId, scoreA: 1, scoreB: 0 });
    await repo.correctFinishedGoal(eventId, "CONFIRMAR", leagueId, actor);
    await repo.correctFinishedGoalEvent(eventId, playerAId, playerBId, "CONFIRMAR", leagueId, actor);
    await repo.addFinishedGoalEvent(matchId, teamAId, playerAId, playerBId, "CONFIRMAR", leagueId, actor);
    await repo.changeMatchGoalkeeper(matchId, teamAId, playerAId, 90, leagueId, actor);
    await repo.setRoundTeamFixedGoalkeeper(roundId, teamAId, playerAId, leagueId, actor);
    await expect(repo.substituteMatchPlayer({
      match_id: matchId,
      team_id: teamAId,
      player_out_id: playerAId,
      player_in_id: playerBId,
      reason: "injury",
      mark_injured: true,
    }, leagueId, actor)).resolves.toEqual({ roundId, substitutionId });
    await repo.undoLastMatchSubstitution(substitutionId, matchId, leagueId, actor);

    expect(query).toHaveBeenCalledWith("SELECT public.delete_match_event($1::uuid, $2::uuid) AS receipt", [eventId, matchId]);
    expect(query).toHaveBeenCalledWith("SELECT public.correct_finished_goal($1::uuid) AS receipt", [eventId]);
    expect(query).toHaveBeenCalledWith(
      "SELECT public.correct_finished_goal_event($1::uuid, $2::uuid, $3::uuid) AS receipt",
      [eventId, playerAId, playerBId],
    );
    expect(query).toHaveBeenCalledWith(
      "SELECT public.add_finished_goal_event($1::uuid, $2::uuid, $3::uuid, $4::uuid) AS receipt",
      [matchId, teamAId, playerAId, playerBId],
    );
    expect(query).toHaveBeenCalledWith(
      "SELECT public.change_match_goalkeeper($1::uuid, $2::uuid, $3::uuid, $4::integer)",
      [matchId, teamAId, playerAId, 90],
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("public.substitute_match_player"), [
      matchId, teamAId, playerAId, playerBId, "injury", true,
    ]);
    expect(query).toHaveBeenCalledWith("SELECT public.undo_last_match_substitution($1::uuid)", [substitutionId]);
  });

  it("filters finished-match audit entries to the supported correction actions", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("sports_admin_audit")
      ? { rows: [{ id: 1, action: "goal_corrected", changedByName: "ADM", payload: {}, createdAt: "2026-10-28" }] }
      : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;

    await expect(pgMatchRepository(pool).getFinishedMatchAudit(matchId, leagueId, actor)).resolves.toHaveLength(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("a.action IN"), [matchId, leagueId]);
  });
});
