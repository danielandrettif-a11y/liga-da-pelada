import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  adminClient: vi.fn(),
  selectedLeague: vi.fn(),
  activeSeason: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  roundApi: vi.fn(),
  scheduleReminders: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}));
vi.mock("../auth", () => ({
  getCurrentAccount: mocks.account,
  getAdminClient: mocks.adminClient,
}));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("./seasons", () => ({ getActiveSeason: mocks.activeSeason }));
vi.mock("@/modules/rounds/infrastructure/round-api-session", () => ({ roundApiFor: mocks.roundApi }));
vi.mock("../cartola-reminder-scheduler", () => ({ scheduleCartolaRoundReminders: mocks.scheduleReminders }));

import {
  createRoundWithTeams,
  deleteRound,
  finishRound,
  getActiveLeague,
  getAdminRoundPrelist,
  getAdminRoundPrelists,
  getRound,
  getRoundMatchSetup,
  getRounds,
  openCallupReplacementVacancy,
  saveRoundPrelist,
  setCallupFormat,
  setRoundPlayerAttendance,
} from "./rounds";

const leagueId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const seasonId = "00000000-0000-4000-8000-000000000003";

describe("rounds actions via API gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: roundId, league_id: leagueId } }),
            single: vi.fn().mockResolvedValue({ data: { id: roundId, league_id: leagueId } }),
          }),
        }),
      }),
      rpc: vi.fn(),
    };

    mocks.account.mockResolvedValue({
      user: { id: "user-123" },
      isAdmin: true,
      client,
    });
    mocks.adminClient.mockResolvedValue(client);
    mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "admin", featureTier: "complete" });
    mocks.activeSeason.mockResolvedValue({ id: seasonId });
  });

  it("routes getActiveLeague via API when available", async () => {
    const getActiveLeagueMock = vi.fn().mockResolvedValue({ id: leagueId, players_per_team: 6 });
    mocks.roundApi.mockResolvedValue({ getActiveLeague: getActiveLeagueMock });

    const result = await getActiveLeague();
    expect(result).toEqual({ id: leagueId, players_per_team: 6 });
    expect(getActiveLeagueMock).toHaveBeenCalledWith(leagueId);
  });

  it("does not execute the legacy reader after an enabled API failure", async () => {
    mocks.roundApi.mockResolvedValue({ getActiveLeague: vi.fn().mockRejectedValue(new Error("backend offline")) });

    await expect(getActiveLeague()).rejects.toThrow("backend offline");
  });

  it("routes getRounds via API when available", async () => {
    const getRoundsMock = vi.fn().mockResolvedValue([{ id: roundId }]);
    mocks.roundApi.mockResolvedValue({ getRounds: getRoundsMock });

    const result = await getRounds();
    expect(result).toEqual([{ id: roundId }]);
    expect(getRoundsMock).toHaveBeenCalledWith(seasonId);
  });

  it("does not fall back after an enabled rounds reader fails", async () => {
    mocks.roundApi.mockResolvedValue({ getRounds: vi.fn().mockRejectedValue(new Error("round reader offline")) });

    await expect(getRounds()).rejects.toThrow("round reader offline");
  });

  it("routes admin prelist readers through their exact API contracts", async () => {
    const getAdminRoundPrelistsMock = vi.fn().mockResolvedValue([{ id: roundId, playersCount: 12 }]);
    const getAdminRoundPrelistMock = vi.fn().mockResolvedValue({
      id: roundId,
      callupId: "callup-1",
      round_players: [{ player_id: "player-1" }],
    });
    mocks.roundApi.mockResolvedValue({
      getActiveLeague: vi.fn().mockResolvedValue({ id: leagueId }),
      getAdminRoundPrelists: getAdminRoundPrelistsMock,
      getAdminRoundPrelist: getAdminRoundPrelistMock,
    });

    await expect(getAdminRoundPrelists()).resolves.toEqual([{ id: roundId, playersCount: 12 }]);
    await expect(getAdminRoundPrelist(roundId)).resolves.toMatchObject({ id: roundId, callupId: "callup-1" });
    expect(getAdminRoundPrelistsMock).toHaveBeenCalledWith(leagueId);
    expect(getAdminRoundPrelistMock).toHaveBeenCalledWith(leagueId, roundId);
  });

  it("does not use Supabase after an enabled admin prelist reader fails", async () => {
    mocks.roundApi.mockResolvedValue({
      getActiveLeague: vi.fn().mockResolvedValue({ id: leagueId }),
      getAdminRoundPrelists: vi.fn().mockRejectedValue(new Error("prelist reader offline")),
    });

    await expect(getAdminRoundPrelists()).rejects.toThrow("prelist reader offline");
  });

  it("routes getRound via API when available", async () => {
    const getRoundMock = vi.fn().mockResolvedValue({ id: roundId });
    mocks.roundApi.mockResolvedValue({ getRound: getRoundMock });

    const result = await getRound(roundId);
    expect(result).toEqual({ id: roundId });
    expect(getRoundMock).toHaveBeenCalledWith(leagueId, roundId);
  });

  it("routes the lean match setup via API", async () => {
    const getRoundMatchSetupMock = vi.fn().mockResolvedValue({
      id: roundId,
      round_players: [],
      teams: [],
      matches: [],
      league: { players_per_team: 6 },
    });
    mocks.roundApi.mockResolvedValue({ getRoundMatchSetup: getRoundMatchSetupMock });

    await expect(getRoundMatchSetup(roundId)).resolves.toMatchObject({ id: roundId, matches: [] });
    expect(getRoundMatchSetupMock).toHaveBeenCalledWith(leagueId, roundId);
  });

  it("does not fall back after enabled round detail readers fail", async () => {
    mocks.roundApi.mockResolvedValue({ getRound: vi.fn().mockRejectedValue(new Error("detail offline")) });
    await expect(getRound(roundId)).rejects.toThrow("detail offline");

    mocks.roundApi.mockResolvedValue({ getRoundMatchSetup: vi.fn().mockRejectedValue(new Error("setup offline")) });
    await expect(getRoundMatchSetup(roundId)).rejects.toThrow("setup offline");
  });

  it("routes createRoundWithTeams via API when available", async () => {
    const createRoundWithTeamsMock = vi.fn().mockResolvedValue({ roundId });
    mocks.roundApi.mockResolvedValue({
      getActiveLeague: vi.fn().mockResolvedValue({ id: leagueId }),
      createRoundWithTeams: createRoundWithTeamsMock,
    });

    const result = await createRoundWithTeams(
      "2026-10-30",
      [{ name: "Time A", color: "Azul", playerIds: [] }],
    );
    expect(result).toEqual({ success: true, roundId });
    expect(createRoundWithTeamsMock).toHaveBeenCalled();
  });

  it("routes deleteRound via API when available", async () => {
    const deleteRoundMock = vi.fn().mockResolvedValue(undefined);
    mocks.roundApi.mockResolvedValue({ deleteRound: deleteRoundMock });

    const result = await deleteRound(roundId, "EXCLUIR");
    expect(result).toEqual({ success: true });
    expect(deleteRoundMock).toHaveBeenCalledWith(leagueId, roundId);
  });

  it("routes finishRound via API when available", async () => {
    const finishRoundMock = vi.fn().mockResolvedValue(undefined);
    mocks.roundApi.mockResolvedValue({ finishRound: finishRoundMock });

    const result = await finishRound(roundId, "pix@example.com", 100);
    expect(result).toEqual({ success: true, archived: false });
    expect(finishRoundMock).toHaveBeenCalledWith(leagueId, roundId);
  });

  it("routes setRoundPlayerAttendance via API when available", async () => {
    const setRoundPlayerAttendanceMock = vi.fn().mockResolvedValue(undefined);
    mocks.roundApi.mockResolvedValue({ setRoundPlayerAttendance: setRoundPlayerAttendanceMock });

    const result = await setRoundPlayerAttendance(roundId, "player-1", true);
    expect(result).toEqual({ success: true });
    expect(setRoundPlayerAttendanceMock).toHaveBeenCalledWith(leagueId, roundId, "player-1", true);
  });

  it("routes callup format through the canonical API contract", async () => {
    const setCallupFormatMock = vi.fn().mockResolvedValue({ fantasySizePreserved: true, fantasyLineupSize: 6 });
    mocks.roundApi.mockResolvedValue({
      getActiveLeague: vi.fn().mockResolvedValue({ id: leagueId }),
      setCallupFormat: setCallupFormatMock,
    });

    await expect(setCallupFormat("callup-1", 6, 4)).resolves.toMatchObject({ success: true });
    expect(setCallupFormatMock).toHaveBeenCalledWith(leagueId, "callup-1", { playersPerTeam: 6, teamsPerRound: 4 });
  });

  it("sends round and outgoing player when opening a replacement vacancy", async () => {
    const openVacancyMock = vi.fn().mockResolvedValue(undefined);
    mocks.roundApi.mockResolvedValue({ openCallupReplacementVacancy: openVacancyMock });

    await expect(openCallupReplacementVacancy(roundId, "player-out")).resolves.toEqual({ success: true });
    expect(openVacancyMock).toHaveBeenCalledWith(leagueId, roundId, "player-out");
  });

  it("routes saveRoundPrelist via API when available", async () => {
    const saveRoundPrelistMock = vi.fn().mockResolvedValue({
      roundId,
      effectiveDate: "2026-10-30",
      effectiveStartTime: "08:00",
      effectiveRoundType: "official",
      created: true,
    });
    mocks.roundApi.mockResolvedValue({
      getActiveLeague: vi.fn().mockResolvedValue({ id: leagueId, feature_tier: "complete" }),
      saveRoundPrelist: saveRoundPrelistMock,
    });

    const result = await saveRoundPrelist({
      date: "2026-10-30",
      startTime: "08:00",
      roundType: "official",
      playerIds: ["p1"],
    });
    expect(result).toEqual({ success: true, roundId });
    expect(saveRoundPrelistMock).toHaveBeenCalled();
    expect(mocks.scheduleReminders).toHaveBeenCalledWith({
      roundId,
      date: "2026-10-30",
      startTime: "08:00",
      includeOpening: true,
    });
  });

  it("does not execute the legacy prelist writer after an enabled API failure", async () => {
    mocks.roundApi.mockResolvedValue({
      getActiveLeague: vi.fn().mockResolvedValue({ id: leagueId, feature_tier: "complete" }),
      saveRoundPrelist: vi.fn().mockRejectedValue(new Error("prelist writer offline")),
    });

    await expect(saveRoundPrelist({
      date: "2026-10-30",
      startTime: "08:00",
      roundType: "official",
      playerIds: [],
    })).resolves.toEqual({ success: false, error: "prelist writer offline" });
  });
});
