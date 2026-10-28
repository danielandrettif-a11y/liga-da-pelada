import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoundRepository } from "./application/manage-rounds.js";
import type { GoalRepository } from "../matches/application/register-goal.js";
import { createApp } from "../../presentation/app.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

const leagueId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const teamId = "00000000-0000-4000-8000-000000000003";
const draftId = "00000000-0000-4000-8000-000000000004";
const seasonId = "00000000-0000-4000-8000-000000000005";
const callupId = "00000000-0000-4000-8000-000000000006";
const playerA = "00000000-0000-4000-8000-000000000007";
const playerB = "00000000-0000-4000-8000-000000000008";

function fixture(enabled: boolean) {
  const roundRepository: RoundRepository = {
    getRounds: vi.fn().mockResolvedValue([
      {
        id: roundId,
        season_id: seasonId,
        round_number: 1,
        scheduled_date: "2026-10-30",
        status: "in_progress",
        is_current: true,
      },
    ]),
    getRound: vi.fn().mockResolvedValue({
      id: roundId,
      season_id: seasonId,
      round_number: 1,
      scheduled_date: "2026-10-30",
      status: "in_progress",
      is_current: true,
      teams: [],
      matches: [],
    }),
    getRoundMatchSetup: vi.fn().mockResolvedValue({
      round: { id: roundId, round_number: 1 },
      teams: [],
      matches: [],
    }),
    getActiveLeague: vi.fn().mockResolvedValue({
      id: leagueId,
      players_per_team: 6,
      teams_per_round: 4,
      match_duration: 10,
      stadium_name: null,
      stadium_map_url: null,
      event_duration_minutes: 90,
      preseason_enabled: false,
      feature_tier: "free",
    }),
    createRoundWithTeams: vi.fn().mockResolvedValue({ roundId }),
    deleteRound: vi.fn().mockResolvedValue(undefined),
    finishRound: vi.fn().mockResolvedValue({ archived: false, shouldRefreshOverall: true }),
    getAdminRoundPrelist: vi.fn().mockResolvedValue(null),
    getAdminRoundPrelists: vi.fn().mockResolvedValue([]),
    saveRoundPrelist: vi.fn().mockResolvedValue({
      roundId,
      effectiveDate: "2026-10-30",
      effectiveStartTime: "08:00",
      effectiveRoundType: "official",
      created: true,
    }),
    setCallupFormat: vi.fn().mockResolvedValue({ fantasySizePreserved: true, fantasyLineupSize: 6 }),
    setCallupMatchSize: vi.fn().mockResolvedValue(undefined),
    getNextTeamPresetOffset: vi.fn().mockResolvedValue({ offset: 0 }),
    markRoundTeamArrived: vi.fn().mockResolvedValue(undefined),
    openCallupReplacementVacancy: vi.fn().mockResolvedValue(undefined),
    previewRoundTeamShuffle: vi.fn().mockResolvedValue({ teams: [] }),
    applyRoundTeamShuffle: vi.fn().mockResolvedValue(undefined),
    applyPermanentRoundTeamFormation: vi.fn().mockResolvedValue(undefined),
    shuffleRoundTeams: vi.fn().mockResolvedValue(undefined),
    swapRoundTeamPlayers: vi.fn().mockResolvedValue(undefined),
    setRoundAttendanceBulk: vi.fn().mockResolvedValue(undefined),
    setRoundPlayerAttendance: vi.fn().mockResolvedValue(undefined),
    setRoundPlayerAvailability: vi.fn().mockResolvedValue(undefined),
    setRoundTeamCaptain: vi.fn().mockResolvedValue(undefined),
    setRoundTeamVestColor: vi.fn().mockResolvedValue(undefined),
    transferRoundPlayerIdentity: vi.fn().mockResolvedValue(undefined),
    zeroPlayerRoundPoints: vi.fn().mockResolvedValue(undefined),
    addRoundEmergencySubstitute: vi.fn().mockResolvedValue({ playerId: "00000000-0000-4000-8000-000000000010" }),
    createTeamDraft: vi.fn().mockResolvedValue({ draftId }),
    getDraftWorkspace: vi.fn().mockResolvedValue({ draft: { id: draftId } } as any),
    getDraftWorkspaceByRound: vi.fn().mockResolvedValue({ draft: { id: draftId } } as any),
    startTeamDraft: vi.fn().mockResolvedValue(undefined),
    makeTeamDraftPick: vi.fn().mockResolvedValue(undefined),
    replaceTeamDraftCaptain: vi.fn().mockResolvedValue(undefined),
    restartTeamDraft: vi.fn().mockResolvedValue(undefined),
    finalizeTeamDraft: vi.fn().mockResolvedValue({ roundId }),
    applyDraftSwap: vi.fn().mockResolvedValue(undefined),
    drawTeamsAdaptiveOnServer: vi.fn().mockResolvedValue({ success: true, teams: [] }),
  };

  const app = createApp({
    goalsEnabled: false,
    roundsEnabled: enabled,
    verifier: { verifyAccessToken: vi.fn().mockResolvedValue({ userId: "user-123" }) },
    repository: {} as GoalRepository,
    roundRepository,
    logger: false,
  });
  apps.push(app);
  return { app, roundRepository };
}

describe("rounds presentation", () => {
  it("returns 404 when rounds feature flag is disabled", async () => {
    const { app } = fixture(false);
    const response = await app.inject({
      method: "GET",
      url: `/api/rounds/seasons/${seasonId}`,
    });
    expect(response.statusCode).toBe(404);
  });

  it("lists rounds by season when flag is enabled", async () => {
    const { app, roundRepository } = fixture(true);
    const response = await app.inject({
      method: "GET",
      url: `/api/rounds/seasons/${seasonId}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(roundId);
    expect(roundRepository.getRounds).toHaveBeenCalled();
  });

  it("gets round by id", async () => {
    const { app, roundRepository } = fixture(true);
    const response = await app.inject({
      method: "GET",
      url: `/api/rounds/leagues/${leagueId}/${roundId}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.id).toBe(roundId);
    expect(roundRepository.getRound).toHaveBeenCalled();
  });

  it("rejects round reads without a session", async () => {
    const { app, roundRepository } = fixture(true);
    const response = await app.inject({
      method: "GET",
      url: `/api/rounds/leagues/${leagueId}/${roundId}`,
    });
    expect(response.statusCode).toBe(401);
    expect(roundRepository.getRound).not.toHaveBeenCalled();
  });

  it("creates a round with teams", async () => {
    const { app, roundRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: `/api/rounds/leagues/${leagueId}`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        date: "2026-10-30",
        roundType: "official",
        playersPerTeam: 6,
        teams: [
          { name: "Time 1", color: "#22c55e", playerIds: [] },
          { name: "Time 2", color: "#3b82f6", playerIds: [] },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.roundId).toBe(roundId);
    expect(roundRepository.createRoundWithTeams).toHaveBeenCalled();
  });

  it("deletes a round", async () => {
    const { app, roundRepository } = fixture(true);
    const response = await app.inject({
      method: "DELETE",
      url: `/api/rounds/leagues/${leagueId}/${roundId}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(roundRepository.deleteRound).toHaveBeenCalled();
  });

  it("finishes a round", async () => {
    const { app, roundRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: `/api/rounds/leagues/${leagueId}/${roundId}/finish`,
      headers: { authorization: "Bearer valid-token" },
      payload: { paymentPix: "pix@example.com", paymentTotal: 120, expenseItemIds: [] },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toEqual({ success: true, archived: false, shouldRefreshOverall: true });
    expect(roundRepository.finishRound).toHaveBeenCalledWith(
      roundId,
      leagueId,
      expect.objectContaining({ paymentPix: "pix@example.com", paymentTotal: 120 }),
      expect.anything(),
    );
  });

  it("marks round team arrived", async () => {
    const { app, roundRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: `/api/rounds/leagues/${leagueId}/${roundId}/teams/${teamId}/arrived`,
      headers: { authorization: "Bearer valid-token" },
      payload: { arrived: true },
    });
    expect(response.statusCode).toBe(200);
    expect(roundRepository.markRoundTeamArrived).toHaveBeenCalled();
  });

  it("opens a replacement vacancy with the round and outgoing player", async () => {
    const { app, roundRepository } = fixture(true);
    const outPlayerId = "00000000-0000-4000-8000-000000000010";
    const response = await app.inject({
      method: "POST",
      url: `/api/rounds/leagues/${leagueId}/${roundId}/replacement-vacancy`,
      headers: { authorization: "Bearer valid-token" },
      payload: { outPlayerId },
    });

    expect(response.statusCode).toBe(200);
    expect(roundRepository.openCallupReplacementVacancy).toHaveBeenCalledWith(
      roundId,
      leagueId,
      outPlayerId,
      expect.anything(),
    );
  });

  it("creates team draft", async () => {
    const { app, roundRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: `/api/rounds/leagues/${leagueId}/${roundId}/draft`,
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.draftId).toBe(draftId);
    expect(roundRepository.createTeamDraft).toHaveBeenCalled();
  });

  it("serves draft workspaces by callup and round", async () => {
    const { app, roundRepository } = fixture(true);
    const headers = { authorization: "Bearer valid-token" };
    const byCallup = await app.inject({
      method: "GET",
      url: `/api/rounds/leagues/${leagueId}/callups/${callupId}/draft-workspace`,
      headers,
    });
    const byRound = await app.inject({
      method: "GET",
      url: `/api/rounds/leagues/${leagueId}/${roundId}/draft-workspace`,
      headers,
    });
    expect(byCallup.statusCode).toBe(200);
    expect(byRound.statusCode).toBe(200);
    expect(roundRepository.getDraftWorkspace).toHaveBeenCalledWith(callupId, leagueId, expect.anything());
    expect(roundRepository.getDraftWorkspaceByRound).toHaveBeenCalledWith(roundId, leagueId, expect.anything());
  });

  it("executes the complete draft mutation contract", async () => {
    const { app, roundRepository } = fixture(true);
    const headers = { authorization: "Bearer valid-token" };
    const requests = [
      app.inject({ method: "POST", url: `/api/rounds/leagues/${leagueId}/drafts/${draftId}/start`, headers }),
      app.inject({ method: "POST", url: `/api/rounds/leagues/${leagueId}/drafts/${draftId}/pick`, headers, payload: { playerId: playerA } }),
      app.inject({ method: "POST", url: `/api/rounds/leagues/${leagueId}/drafts/${draftId}/replace-captain`, headers, payload: { teamSlot: 2, newCaptainId: playerB } }),
      app.inject({ method: "POST", url: `/api/rounds/leagues/${leagueId}/drafts/${draftId}/restart`, headers }),
      app.inject({ method: "POST", url: `/api/rounds/leagues/${leagueId}/drafts/${draftId}/swap`, headers, payload: { playerAId: playerA, playerBId: playerB } }),
      app.inject({ method: "POST", url: `/api/rounds/leagues/${leagueId}/drafts/${draftId}/finalize`, headers }),
    ];
    const responses = await Promise.all(requests);
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(roundRepository.startTeamDraft).toHaveBeenCalledWith(draftId, leagueId, expect.anything());
    expect(roundRepository.makeTeamDraftPick).toHaveBeenCalledWith(draftId, leagueId, playerA, expect.anything());
    expect(roundRepository.replaceTeamDraftCaptain).toHaveBeenCalledWith(draftId, leagueId, 2, playerB, expect.anything());
    expect(roundRepository.applyDraftSwap).toHaveBeenCalledWith(draftId, leagueId, playerA, playerB, expect.anything());
    expect(roundRepository.finalizeTeamDraft).toHaveBeenCalledWith(draftId, leagueId, expect.anything());
  });

  it("executes adaptive draw on server", async () => {
    const { app, roundRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: `/api/rounds/leagues/${leagueId}/adaptive-draw`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        playerIds: ["00000000-0000-4000-8000-000000000010", "00000000-0000-4000-8000-000000000011"],
        teamCount: 2,
        playersPerTeam: 1,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(roundRepository.drawTeamsAdaptiveOnServer).toHaveBeenCalled();
  });
});
