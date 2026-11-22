import { describe, expect, it, vi } from "vitest";
import {
  addFinishedGoalEvent,
  addMatchExtraTime,
  changeMatchGoalkeeper,
  correctFinishedGoal,
  correctFinishedGoalEvent,
  createMatch,
  deleteEvent,
  deleteMatch,
  dispatchMatchTimerThreshold,
  findLiveMatchForTeams,
  finishMatch,
  getFinishedMatchAudit,
  getMatch,
  notifyMatchTimerThreshold,
  resetMatchTimer,
  selectBestGoalkeeper,
  setRoundTeamFixedGoalkeeper,
  substituteMatchPlayer,
  undoLastMatchSubstitution,
  updateMatchTimer,
  type MatchRepository,
} from "./manage-matches.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const matchId = "00000000-0000-4000-8000-000000000003";
const teamAId = "00000000-0000-4000-8000-000000000004";
const teamBId = "00000000-0000-4000-8000-000000000005";
const playerAId = "00000000-0000-4000-8000-000000000006";
const playerBId = "00000000-0000-4000-8000-000000000007";
const eventId = "00000000-0000-4000-8000-000000000008";
const subId = "00000000-0000-4000-8000-000000000009";

const actor = { userId: "00000000-0000-4000-8000-000000000010" };

function createMockRepository(): MatchRepository {
  return {
    getMatch: vi.fn().mockResolvedValue({ id: matchId }),
    findLiveMatchForTeams: vi.fn().mockResolvedValue(matchId),
    getFinishedMatchAudit: vi.fn().mockResolvedValue([]),
    createMatch: vi.fn().mockResolvedValue({ matchId, idempotent: false }),
    finishMatch: vi.fn().mockResolvedValue({ roundId }),
    deleteMatch: vi.fn().mockResolvedValue({ roundId }),
    deleteEvent: vi.fn().mockResolvedValue({ roundId, scoreA: 1, scoreB: 0 }),
    correctFinishedGoal: vi.fn().mockResolvedValue({ roundId, matchId }),
    correctFinishedGoalEvent: vi.fn().mockResolvedValue({ roundId, matchId }),
    addFinishedGoalEvent: vi.fn().mockResolvedValue({ roundId, matchId }),
    changeMatchGoalkeeper: vi.fn().mockResolvedValue({ roundId }),
    setRoundTeamFixedGoalkeeper: vi.fn().mockResolvedValue({ roundId }),
    substituteMatchPlayer: vi.fn().mockResolvedValue({ roundId, substitutionId: subId }),
    undoLastMatchSubstitution: vi.fn().mockResolvedValue({ roundId }),
    getMatchTimerState: vi.fn().mockResolvedValue({
      status: "live", durationSeconds: 420, accumulatedSeconds: 0, startedAt: null,
    }),
    updateMatchTimer: vi.fn().mockResolvedValue({ timerStartedAt: new Date().toISOString() }),
    resetMatchTimer: vi.fn().mockResolvedValue({ eligibilityOffset: 0 }),
    setMatchDuration: vi.fn().mockResolvedValue({ newDuration: 480 }),
    notifyMatchTimerThreshold: vi.fn().mockResolvedValue({ skipped: true, reason: "already_alerted" }),
    releaseMatchTimerThreshold: vi.fn().mockResolvedValue(undefined),
    dispatchMatchTimerThresholdSystem: vi.fn().mockResolvedValue({ skipped: true, reason: "already_alerted" }),
    releaseMatchTimerThresholdSystem: vi.fn().mockResolvedValue(undefined),
  };
}

describe("manage-matches application layer", () => {
  it("calls getMatch and findLiveMatchForTeams", async () => {
    const repo = createMockRepository();
    const match = await getMatch(matchId, leagueId, actor, repo);
    expect(match?.id).toBe(matchId);

    const live = await findLiveMatchForTeams(roundId, teamAId, teamBId, leagueId, actor, repo);
    expect(live).toBe(matchId);
  });

  it("calls createMatch, finishMatch and deleteMatch", async () => {
    const repo = createMockRepository();
    const created = await createMatch({
      round_id: roundId,
      team_a_id: teamAId,
      team_b_id: teamBId,
      goalkeeper_a_id: playerAId,
      goalkeeper_b_id: playerBId,
    }, leagueId, actor, repo);
    expect(created.matchId).toBe(matchId);

    const finished = await finishMatch(matchId, leagueId, actor, repo);
    expect(finished.roundId).toBe(roundId);

    const deleted = await deleteMatch(matchId, leagueId, actor, repo);
    expect(deleted.roundId).toBe(roundId);
  });

  it("handles timer actions", async () => {
    const repo = createMockRepository();
    const scheduler = { schedule: vi.fn().mockResolvedValue(undefined) };
    const timer = await updateMatchTimer(matchId, "start", leagueId, actor, repo, scheduler);
    expect(timer.timerStartedAt).toBeDefined();
    expect(scheduler.schedule).toHaveBeenCalledWith(expect.objectContaining({ matchId, durationSeconds: 420 }));

    const reset = await resetMatchTimer(matchId, leagueId, actor, repo);
    expect(reset.eligibilityOffset).toBe(0);

    const extra = await addMatchExtraTime(matchId, 60, leagueId, actor, repo, scheduler);
    expect(extra.newDuration).toBe(480);

    const notified = await notifyMatchTimerThreshold(matchId, "one_minute", leagueId, actor, repo);
    expect(notified.skipped).toBe(true);

    const dispatched = await dispatchMatchTimerThreshold(matchId, "finished", leagueId, actor, repo);
    expect(dispatched.skipped).toBe(true);
  });

  it("handles substitutions and goalkeepers", async () => {
    const repo = createMockRepository();
    const sub = await substituteMatchPlayer({
      match_id: matchId,
      team_id: teamAId,
      player_out_id: playerAId,
      player_in_id: playerBId,
      reason: "other",
    }, leagueId, actor, repo);
    expect(sub.substitutionId).toBe(subId);

    const undo = await undoLastMatchSubstitution(subId, matchId, leagueId, actor, repo);
    expect(undo.roundId).toBe(roundId);

    const gk = await changeMatchGoalkeeper(matchId, teamAId, playerBId, 120, leagueId, actor, repo);
    expect(gk.roundId).toBe(roundId);

    const fixed = await setRoundTeamFixedGoalkeeper(roundId, teamAId, playerAId, leagueId, actor, repo);
    expect(fixed.roundId).toBe(roundId);
  });

  it("handles events and corrections", async () => {
    const repo = createMockRepository();
    const delEvent = await deleteEvent(eventId, matchId, leagueId, actor, repo);
    expect(delEvent.scoreA).toBe(1);

    const corr1 = await correctFinishedGoal(eventId, "CONFIRMAR", leagueId, actor, repo);
    expect(corr1.roundId).toBe(roundId);

    const corr2 = await correctFinishedGoalEvent(eventId, playerAId, null, "CONFIRMAR", leagueId, actor, repo);
    expect(corr2.roundId).toBe(roundId);

    const added = await addFinishedGoalEvent(matchId, teamAId, playerAId, null, "CONFIRMAR", leagueId, actor, repo);
    expect(added.roundId).toBe(roundId);
  });

  it("returns compatibility response for selectBestGoalkeeper", () => {
    const result = selectBestGoalkeeper(roundId, playerAId);
    expect(result.success).toBe(false);
  });
});
