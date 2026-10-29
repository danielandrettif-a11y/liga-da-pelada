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
    const playerId = "00000000-0000-4000-8000-000000000006";
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
      if (sql.includes("FROM public.teams team") && sql.includes("GROUP BY team.id")) {
        return { rows: [{ id: teamAId, name: "Time A" }] };
      }
      if (sql.includes("FROM public.rounds round_item") && sql.includes("round_players")) {
        return { rows: [{ id: roundId, league_id: leagueId }] };
      }
      if (sql.includes("FROM public.match_players mp")) {
        return { rows: [{ player_id: playerId, team_id: teamAId, player: { id: playerId, name: "Ana" } }] };
      }
      if (sql.includes("account_cosmetic_loadouts")) {
        return { rows: [{ player_id: playerId, banner_asset_key: "banner-a", frame_asset_key: null, aura_asset_key: "aura-a" }] };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgMatchRepository(pool);
    const result = await repo.getMatch(matchId, leagueId, actor);

    expect(result?.id).toBe(matchId);
    expect(result?.team_a?.name).toBe("Time A");
    expect(result?.match_players?.[0]?.player.name).toBe("Ana");
    expect(result?.player_cosmetics?.[playerId]?.bannerAssetKey).toBe("banner-a");
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T10:00:05.000Z"));
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) {
        return { rows: [{ allowed: true }] };
      }
      if (sql.includes("FOR UPDATE OF match_item")) {
        return { rows: [{
          id: matchId, round_id: roundId, status: "live", score_a: 1, score_b: 0,
          timer_started_at: "2026-10-29T10:00:00.000Z", timer_accumulated_seconds: 120,
          eligibility_elapsed_offset_seconds: 0, team_a_name: "Time A", team_b_name: "Time B",
        }] };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgMatchRepository(pool);
    try {
      const result = await repo.finishMatch(matchId, leagueId, actor);
      expect(result.roundId).toBe(roundId);
      expect(result.match.score_a).toBe(1);
      expect(query).toHaveBeenCalledWith(expect.stringContaining("left_elapsed_seconds"), [matchId, 125]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("deleteMatch removes match from database", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) {
        return { rows: [{ allowed: true }] };
      }
      if (sql.includes("FOR UPDATE OF match_item")) {
        return { rows: [{ round_id: roundId, status: "finished", round_status: "active" }] };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgMatchRepository(pool);
    const result = await repo.deleteMatch(matchId, leagueId, actor);

    expect(result.roundId).toBe(roundId);
  });

  it("builds the complete lineup before calling the idempotent creation RPC", async () => {
    const playerAId = "00000000-0000-4000-8000-000000000006";
    const playerBId = "00000000-0000-4000-8000-000000000007";
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("league.players_per_team")) return { rows: [{
        number: 1, status: "active", formation_mode: "manual", arrival_order_enabled: false,
        target_players_per_team: 1, players_per_team: 1,
      }] };
      if (sql.includes("team.fixed_goalkeeper_player_id")) return { rows: [
        { id: teamAId, name: "Time A", position: 1, fixed_goalkeeper_player_id: null,
          player_id: playerAId, goalkeeper_order: 1, loan_order: 1 },
        { id: teamBId, name: "Time B", position: 2, fixed_goalkeeper_player_id: null,
          player_id: playerBId, goalkeeper_order: 1, loan_order: 1 },
      ] };
      if (sql.includes("FROM public.round_players")) return { rows: [
        { player_id: playerAId, availability_status: "available", attendance_status: null },
        { player_id: playerBId, availability_status: "available", attendance_status: null },
      ] };
      if (sql.includes("count(*)::text AS count")) return { rows: [{ count: "0" }] };
      if (sql.includes("loan_count")) return { rows: [] };
      if (sql.includes("public.create_live_match")) return { rows: [{ receipt: {
        match_id: matchId, round_id: roundId, duration_seconds: 420,
        kickoff_at: "2026-10-29T10:00:00.000Z", idempotent: false,
      } }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const result = await pgMatchRepository(pool).createMatch({
      round_id: roundId, team_a_id: teamAId, team_b_id: teamBId,
      goalkeeper_a_id: playerAId, goalkeeper_b_id: playerBId,
      idempotency_key: "create-match-test",
    }, leagueId, actor);

    expect(result.matchId).toBe(matchId);
    const createCall = query.mock.calls.find(([sql]) => String(sql).includes("public.create_live_match"));
    expect(createCall?.[1]?.[7]).toContain('"participation_kind":"roster"');
    expect(createCall?.[1]?.[8]).toBe("create-match-test");
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

  it("keeps timer state scoped and claims notifications only after their threshold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T10:07:00.000Z"));
    const claimedAt = "2026-10-29T10:07:00.000Z";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("AS alerted_at")) return { rows: [{
        id: matchId, round_id: roundId, status: "live", score_a: 1, score_b: 0,
        duration_seconds: 420, timer_started_at: "2026-10-29T10:00:30.000Z",
        timer_accumulated_seconds: 0, alerted_at: null,
        team_a_name: "Time A", team_b_name: "Time B",
      }] };
      if (sql.includes("duration_seconds") && sql.includes("FROM public.matches match_item") && !sql.includes("FOR UPDATE")) {
        return { rows: [{ status: "live", duration_seconds: 420, timer_started_at: null, timer_accumulated_seconds: 20 }] };
      }
      if (sql.includes("eligibility_elapsed_offset_seconds") && sql.includes("FOR UPDATE")) {
        return { rows: [{ status: "live", timer_started_at: null, timer_accumulated_seconds: 20, eligibility_elapsed_offset_seconds: 5 }] };
      }
      if (sql.includes("FOR UPDATE OF match_item")) {
        return { rows: [{ status: "live", timer_started_at: null, timer_accumulated_seconds: 20 }] };
      }
      if (sql.includes("RETURNING match_item.duration_seconds")) return { rows: [{ duration_seconds: 480 }] };
      return { rows: [], rowCount: 1 };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgMatchRepository(pool);

    try {
      await expect(repo.getMatchTimerState(matchId, leagueId, actor)).resolves.toEqual({
        status: "live", durationSeconds: 420, accumulatedSeconds: 20, startedAt: null,
      });
      await expect(repo.updateMatchTimer(matchId, "start", claimedAt, leagueId, actor))
        .resolves.toEqual({ timerStartedAt: claimedAt, timerAccumulatedSeconds: 20 });
      await expect(repo.resetMatchTimer(matchId, leagueId, actor)).resolves.toEqual({ eligibilityOffset: 25 });
      await expect(repo.setMatchDuration(matchId, 480, leagueId, actor)).resolves.toEqual({ newDuration: 480 });
      const claim = await repo.notifyMatchTimerThreshold(matchId, "thirty_seconds", leagueId, actor);
      expect(claim.claimedAt).toBe(claimedAt);
      expect(claim.secondsLeft).toBe(30);
      expect(claim.match?.score_a).toBe(1);
      await repo.releaseMatchTimerThreshold(matchId, "thirty_seconds", claimedAt, leagueId, actor);
      expect(query).toHaveBeenCalledWith(expect.stringContaining("timer_thirty_seconds_alerted_at = NULL"), [
        matchId, claimedAt, leagueId,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
