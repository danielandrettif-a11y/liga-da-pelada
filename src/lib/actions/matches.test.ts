import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  adminClient: vi.fn(),
  selectedLeague: vi.fn(),
  revalidatePath: vi.fn(),
  matchApi: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: (cb: () => void) => cb?.(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("../auth", () => ({
  getCurrentAccount: mocks.account,
  getAdminClient: mocks.adminClient,
}));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/matches/infrastructure/match-api-session", () => ({ matchApiFor: mocks.matchApi }));

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
  setRoundTeamFixedGoalkeeper,
  substituteMatchPlayer,
  undoLastMatchSubstitution,
  updateMatchTimer,
} from "./matches";

const leagueId = "00000000-0000-4000-8000-000000000001";
const matchId = "00000000-0000-4000-8000-000000000002";
const roundId = "00000000-0000-4000-8000-000000000003";
const teamAId = "00000000-0000-4000-8000-000000000004";
const teamBId = "00000000-0000-4000-8000-000000000005";
const playerAId = "00000000-0000-4000-8000-000000000006";
const playerBId = "00000000-0000-4000-8000-000000000007";
const eventId = "00000000-0000-4000-8000-000000000008";
const subId = "00000000-0000-4000-8000-000000000009";

describe("matches actions via API gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const client = {
      from: vi.fn(),
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "test-token" } },
          error: null,
        }),
      },
    };

    mocks.account.mockResolvedValue({
      user: { id: "user-123" },
      isAdmin: true,
      client,
    });
    mocks.adminClient.mockResolvedValue(client);
    mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "admin" });
  });

  it("routes findLiveMatchForTeams to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      findLiveMatchForTeams: vi.fn().mockResolvedValue({ matchId }),
    });

    const res = await findLiveMatchForTeams(roundId, teamAId, teamBId);
    expect(res).toBe(matchId);
  });

  it("routes createMatch to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      createMatch: vi.fn().mockResolvedValue({ success: true, matchId }),
    });

    const res = await createMatch({
      round_id: roundId,
      team_a_id: teamAId,
      team_b_id: teamBId,
      goalkeeper_a_id: playerAId,
      goalkeeper_b_id: playerBId,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.matchId).toBe(matchId);
    }
  });

  it("routes getMatch to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      getMatch: vi.fn().mockResolvedValue({ id: matchId }),
    });

    const res = await getMatch(matchId);
    expect(res?.id).toBe(matchId);
  });

  it("routes getFinishedMatchAudit to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      getFinishedMatchAudit: vi.fn().mockResolvedValue([{ id: 1, action: "goal" }]),
    });

    const res = await getFinishedMatchAudit(matchId);
    expect(res).toHaveLength(1);
  });

  it("routes finishMatch to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      finishMatch: vi.fn().mockResolvedValue({ success: true, roundId }),
    });

    const res = await finishMatch(matchId);
    expect(res.success).toBe(true);
  });

  it("routes deleteMatch to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      deleteMatch: vi.fn().mockResolvedValue({ success: true, roundId }),
    });

    const res = await deleteMatch(matchId);
    expect(res.success).toBe(true);
  });

  it("routes deleteEvent to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      deleteEvent: vi.fn().mockResolvedValue({ success: true, roundId, scoreA: 2, scoreB: 1 }),
    });

    const res = await deleteEvent(eventId, matchId);
    expect(res.success).toBe(true);
    expect(res.scoreA).toBe(2);
  });

  it("routes correctFinishedGoal to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      correctFinishedGoal: vi.fn().mockResolvedValue({ success: true, roundId, matchId }),
    });

    const res = await correctFinishedGoal(eventId, "CONFIRMAR");
    expect(res.success).toBe(true);
  });

  it("routes correctFinishedGoalEvent to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      correctFinishedGoalEvent: vi.fn().mockResolvedValue({ success: true, roundId, matchId }),
    });

    const res = await correctFinishedGoalEvent(eventId, playerAId, null, "CONFIRMAR");
    expect(res.success).toBe(true);
  });

  it("routes addFinishedGoalEvent to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      addFinishedGoalEvent: vi.fn().mockResolvedValue({ success: true, roundId, matchId }),
    });

    const res = await addFinishedGoalEvent(matchId, teamAId, playerAId, null, "CONFIRMAR");
    expect(res.success).toBe(true);
  });

  it("routes changeMatchGoalkeeper to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      changeMatchGoalkeeper: vi.fn().mockResolvedValue({ success: true, roundId }),
    });

    const res = await changeMatchGoalkeeper(matchId, teamAId, playerBId, 60);
    expect(res.success).toBe(true);
  });

  it("routes setRoundTeamFixedGoalkeeper to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      setRoundTeamFixedGoalkeeper: vi.fn().mockResolvedValue({ success: true, roundId }),
    });

    const res = await setRoundTeamFixedGoalkeeper(roundId, teamAId, playerAId);
    expect(res.success).toBe(true);
  });

  it("routes substituteMatchPlayer to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      substituteMatchPlayer: vi.fn().mockResolvedValue({ success: true, roundId, substitutionId: subId }),
    });

    const res = await substituteMatchPlayer({
      match_id: matchId,
      team_id: teamAId,
      player_out_id: playerAId,
      player_in_id: playerBId,
      reason: "other",
    });
    expect(res.success).toBe(true);
    expect(res.substitutionId).toBe(subId);
  });

  it("routes undoLastMatchSubstitution to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      undoLastMatchSubstitution: vi.fn().mockResolvedValue({ success: true, roundId }),
    });

    const res = await undoLastMatchSubstitution(subId, matchId);
    expect(res.success).toBe(true);
  });

  it("routes updateMatchTimer to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      updateMatchTimer: vi.fn().mockResolvedValue({ success: true }),
    });

    const res = await updateMatchTimer(matchId, "start");
    expect(res.success).toBe(true);
  });

  it("routes resetMatchTimer to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      resetMatchTimer: vi.fn().mockResolvedValue({ success: true }),
    });

    const res = await resetMatchTimer(matchId);
    expect(res.success).toBe(true);
  });

  it("routes addMatchExtraTime to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      addMatchExtraTime: vi.fn().mockResolvedValue({ success: true, newDuration: 480 }),
    });

    const res = await addMatchExtraTime(matchId, 60);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.newDuration).toBe(480);
    }
  });

  it("routes notifyMatchTimerThreshold to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      notifyMatchTimerThreshold: vi.fn().mockResolvedValue({ success: true, sent: true }),
    });

    const res = await notifyMatchTimerThreshold(matchId, "one_minute");
    expect(res.success).toBe(true);
  });

  it("routes dispatchMatchTimerThreshold to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      dispatchMatchTimerThreshold: vi.fn().mockResolvedValue({ success: true, sent: true }),
    });

    const res = await dispatchMatchTimerThreshold({} as any, matchId, "finished");
    expect(res.success).toBe(true);
  });
});
