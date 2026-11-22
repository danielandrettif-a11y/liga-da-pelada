import { describe, expect, it, vi } from "vitest";
import {
  addRoundEmergencySubstitute,
  applyDraftSwap,
  createTeamDraft,
  createRoundWithTeams,
  deleteRound,
  drawTeamsAdaptiveOnServer,
  finalizeTeamDraft,
  finishRound,
  getActiveLeague,
  getAdminRoundPrelist,
  getRound,
  getRoundMatchSetup,
  getRounds,
  getDraftWorkspace,
  getDraftWorkspaceByRound,
  makeTeamDraftPick,
  replaceTeamDraftCaptain,
  restartTeamDraft,
  saveRoundPrelist,
  startTeamDraft,
  transferRoundPlayerIdentity,
  type RoundRepository,
  zeroPlayerRoundPoints,
} from "./manage-rounds.js";

const seasonId = "00000000-0000-4000-8000-000000000001";
const leagueId = "00000000-0000-4000-8000-000000000002";
const roundId = "00000000-0000-4000-8000-000000000003";
const draftId = "00000000-0000-4000-8000-000000000004";
const callupId = "00000000-0000-4000-8000-000000000005";
const playerA = "00000000-0000-4000-8000-000000000006";
const playerB = "00000000-0000-4000-8000-000000000007";
const actor = { userId: "user-123" };

describe("manage-rounds application service", () => {
  const repository: RoundRepository = {
    getRounds: vi.fn().mockResolvedValue([]),
    getRound: vi.fn().mockResolvedValue(null),
    getRoundMatchSetup: vi.fn().mockResolvedValue(null),
    getActiveLeague: vi.fn().mockResolvedValue({
      id: leagueId,
      players_per_team: 6,
      teams_per_round: 4,
      match_duration: 7,
      stadium_name: null,
      stadium_map_url: null,
      event_duration_minutes: 120,
      preseason_enabled: false,
      feature_tier: "complete",
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
    setCallupFormat: vi.fn().mockResolvedValue(undefined),
    setCallupMatchSize: vi.fn().mockResolvedValue(undefined),
    getNextTeamPresetOffset: vi.fn().mockResolvedValue({ offset: 0 }),
    markRoundTeamArrived: vi.fn().mockResolvedValue(undefined),
    openCallupReplacementVacancy: vi.fn().mockResolvedValue(undefined),
    previewRoundTeamShuffle: vi.fn().mockResolvedValue({}),
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
    addRoundEmergencySubstitute: vi.fn().mockResolvedValue(undefined),
    createTeamDraft: vi.fn().mockResolvedValue({ draftId }),
    getDraftWorkspace: vi.fn().mockResolvedValue(null),
    getDraftWorkspaceByRound: vi.fn().mockResolvedValue(null),
    startTeamDraft: vi.fn().mockResolvedValue(undefined),
    makeTeamDraftPick: vi.fn().mockResolvedValue(undefined),
    replaceTeamDraftCaptain: vi.fn().mockResolvedValue(undefined),
    restartTeamDraft: vi.fn().mockResolvedValue(undefined),
    finalizeTeamDraft: vi.fn().mockResolvedValue({ roundId }),
    applyDraftSwap: vi.fn().mockResolvedValue(undefined),
    drawTeamsAdaptiveOnServer: vi.fn().mockResolvedValue({ success: true }),
  };

  it("delegates getRounds with validated UUID", async () => {
    await getRounds(seasonId, actor, repository);
    expect(repository.getRounds).toHaveBeenCalledWith(seasonId, actor);
  });

  it("delegates getRound with validated UUIDs", async () => {
    await getRound(roundId, leagueId, actor, repository);
    expect(repository.getRound).toHaveBeenCalledWith(roundId, leagueId, actor);
  });

  it("delegates getActiveLeague with validated leagueId", async () => {
    const league = await getActiveLeague(leagueId, actor, repository);
    expect(league.id).toBe(leagueId);
    expect(repository.getActiveLeague).toHaveBeenCalledWith(leagueId, actor);
  });

  it("delegates createRoundWithTeams with date validation", async () => {
    await createRoundWithTeams({
      date: "2026-10-30",
      startTime: "08:00",
      roundType: "official",
      playersPerTeam: 6,
      teams: [
        { name: "Time A", color: "#22c55e", playerIds: [] },
        { name: "Time B", color: "#3b82f6", playerIds: [] },
      ],
    }, leagueId, actor, repository);
    expect(repository.createRoundWithTeams).toHaveBeenCalled();
  });

  it("delegates deleteRound with validated UUIDs", async () => {
    await deleteRound(roundId, leagueId, actor, repository);
    expect(repository.deleteRound).toHaveBeenCalledWith(roundId, leagueId, actor);
  });

  it("validates and delegates round player corrections", async () => {
    await transferRoundPlayerIdentity(roundId, leagueId, playerA, playerB, actor, repository);
    await zeroPlayerRoundPoints(roundId, leagueId, playerA, "  ausência confirmada  ", actor, repository);
    await addRoundEmergencySubstitute(roundId, leagueId, {
      outPlayerId: playerA,
      inPlayerId: playerB,
      teamId: draftId,
    }, actor, repository);

    expect(repository.transferRoundPlayerIdentity).toHaveBeenCalledWith(roundId, leagueId, playerA, playerB, actor);
    expect(repository.zeroPlayerRoundPoints).toHaveBeenCalledWith(roundId, leagueId, playerA, "ausência confirmada", actor);
    expect(repository.addRoundEmergencySubstitute).toHaveBeenCalledWith(
      roundId,
      leagueId,
      { outPlayerId: playerA, inPlayerId: playerB, teamId: draftId },
      actor,
    );
  });

  it("rejects invalid correction contracts before persistence", async () => {
    expect(() => transferRoundPlayerIdentity(roundId, leagueId, playerA, playerA, actor, repository))
      .toThrow("Escolha dois perfis diferentes");
    expect(() => addRoundEmergencySubstitute(roundId, leagueId, {
      outPlayerId: playerA,
      inPlayerId: playerA,
      teamId: draftId,
    }, actor, repository)).toThrow("Escolha jogadores diferentes");
  });

  it("delegates finishRound with normalized financial input", async () => {
    const recipientId = "00000000-0000-4000-8000-000000000009";
    await finishRound(roundId, leagueId, {
      paymentPix: "  pix@example.com  ",
      paymentTotal: 100.129,
      recipientId,
      expenseItemIds: [recipientId, recipientId],
    }, actor, repository);
    expect(repository.finishRound).toHaveBeenCalledWith(roundId, leagueId, {
      paymentPix: "pix@example.com",
      paymentTotal: 100.13,
      recipientId,
      recipientName: null,
      expenseItemIds: [recipientId],
    }, actor);
  });

  it("delegates saveRoundPrelist with date validation", async () => {
    const playerId = "00000000-0000-4000-8000-000000000010";
    await saveRoundPrelist({
      date: "2026-10-30",
      startTime: "08:00",
      roundType: "official",
      playerIds: [playerId, playerId],
    }, leagueId, actor, repository);
    expect(repository.saveRoundPrelist).toHaveBeenLastCalledWith(
      expect.objectContaining({ playerIds: [playerId] }),
      leagueId,
      actor,
    );
  });

  it("validates and delegates the complete draft lifecycle", async () => {
    await createTeamDraft({ roundId, callupId }, leagueId, actor, repository);
    await getDraftWorkspace(callupId, leagueId, actor, repository);
    await getDraftWorkspaceByRound(roundId, leagueId, actor, repository);
    await startTeamDraft(draftId, leagueId, actor, repository);
    await makeTeamDraftPick(draftId, leagueId, playerA, actor, repository);
    await replaceTeamDraftCaptain(draftId, leagueId, 2, playerB, actor, repository);
    await restartTeamDraft(draftId, leagueId, actor, repository);
    await applyDraftSwap(draftId, leagueId, playerA, playerB, actor, repository);
    await finalizeTeamDraft(draftId, leagueId, actor, repository);

    expect(repository.createTeamDraft).toHaveBeenCalledWith(roundId, callupId, leagueId, actor);
    expect(repository.getDraftWorkspace).toHaveBeenCalledWith(callupId, leagueId, actor);
    expect(repository.makeTeamDraftPick).toHaveBeenCalledWith(draftId, leagueId, playerA, actor);
    expect(repository.replaceTeamDraftCaptain).toHaveBeenCalledWith(draftId, leagueId, 2, playerB, actor);
    expect(repository.applyDraftSwap).toHaveBeenCalledWith(draftId, leagueId, playerA, playerB, actor);
  });

  it("normalizes and delegates adaptive draw input", async () => {
    await drawTeamsAdaptiveOnServer({
      playerIds: [playerA, playerA, playerB],
      attendanceOrder: [playerB],
      teamCount: 2,
      playersPerTeam: 2,
    }, leagueId, actor, repository);

    expect(repository.drawTeamsAdaptiveOnServer).toHaveBeenCalledWith({
      playerIds: [playerA, playerB],
      attendanceOrder: [playerB],
      teamCount: 2,
      playersPerTeam: 2,
    }, leagueId, actor);
  });
});
