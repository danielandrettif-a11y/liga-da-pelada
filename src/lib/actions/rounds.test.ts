import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  adminClient: vi.fn(),
  selectedLeague: vi.fn(),
  activeSeason: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  roundApi: vi.fn(),
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

import {
  createRoundWithTeams,
  deleteRound,
  finishRound,
  getActiveLeague,
  getRound,
  getRounds,
  saveRoundPrelist,
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

  it("routes getRounds via API when available", async () => {
    const getRoundsMock = vi.fn().mockResolvedValue([{ id: roundId }]);
    mocks.roundApi.mockResolvedValue({ getRounds: getRoundsMock });

    const result = await getRounds();
    expect(result).toEqual([{ id: roundId }]);
    expect(getRoundsMock).toHaveBeenCalledWith(seasonId);
  });

  it("routes getRound via API when available", async () => {
    const getRoundMock = vi.fn().mockResolvedValue({ id: roundId });
    mocks.roundApi.mockResolvedValue({ getRound: getRoundMock });

    const result = await getRound(roundId);
    expect(result).toEqual({ id: roundId });
    expect(getRoundMock).toHaveBeenCalledWith(leagueId, roundId);
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

  it("routes saveRoundPrelist via API when available", async () => {
    const saveRoundPrelistMock = vi.fn().mockResolvedValue({ roundId });
    mocks.roundApi.mockResolvedValue({
      getActiveLeague: vi.fn().mockResolvedValue({ id: leagueId }),
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
  });
});
