import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  adminClient: vi.fn(),
  selectedLeague: vi.fn(),
  activeLeague: vi.fn(),
  revalidatePath: vi.fn(),
  callupApi: vi.fn(),
  scheduleReminders: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../auth", () => ({
  getCurrentAccount: mocks.account,
  getAdminClient: mocks.adminClient,
}));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("./rounds", () => ({ getActiveLeague: mocks.activeLeague }));
vi.mock("@/modules/callups/infrastructure/callup-api-session", () => ({ callupApiFor: mocks.callupApi }));
vi.mock("../cartola-reminder-scheduler", () => ({ scheduleCartolaRoundReminders: mocks.scheduleReminders }));

import {
  closeCallup,
  getActiveCallup,
  getActiveCallups,
  getAgendaCallups,
  hasActiveCallup,
  joinActiveCallup,
  leaveActiveCallup,
  lockCallupForRound,
  openCallup,
  repairMyPlayerAccount,
  setCallupVisibility,
} from "./callups";

const leagueId = "00000000-0000-4000-8000-000000000001";
const callupId = "00000000-0000-4000-8000-000000000002";
const playerId = "00000000-0000-4000-8000-000000000003";
const roundId = "00000000-0000-4000-8000-000000000004";

describe("callups actions via API gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "callups") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: callupId, league_id: leagueId } }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const client = {
      from: fromMock,
      rpc: vi.fn(),
    };

    mocks.account.mockResolvedValue({
      user: { id: "user-123" },
      isAdmin: true,
      client,
    });
    mocks.adminClient.mockResolvedValue(client);
    mocks.selectedLeague.mockResolvedValue({ id: leagueId, featureTier: "complete" });
    mocks.activeLeague.mockResolvedValue({ id: leagueId, feature_tier: "complete" });
  });

  it("routes getActiveCallups via API when available", async () => {
    const listActive = vi.fn().mockResolvedValue([{ id: callupId, entries: [] }]);
    mocks.callupApi.mockResolvedValue({ listActive });

    const result = await getActiveCallups();
    expect(result).toEqual([{ id: callupId, entries: [] }]);
    expect(listActive).toHaveBeenCalledWith(leagueId, undefined);

    const active = await getActiveCallup();
    expect(active?.id).toBe(callupId);

    const has = await hasActiveCallup();
    expect(has).toBe(true);
  });

  it("routes getAgendaCallups via API when available", async () => {
    const listAgenda = vi.fn().mockResolvedValue([{ id: callupId, playersCount: 10 }]);
    mocks.callupApi.mockResolvedValue({ listAgenda });

    const result = await getAgendaCallups();
    expect(result).toEqual([{ id: callupId, playersCount: 10 }]);
    expect(listAgenda).toHaveBeenCalledWith(leagueId);
  });

  it("routes openCallup via API when available", async () => {
    const openCallupMock = vi.fn().mockResolvedValue({ callupId, roundId });
    mocks.callupApi.mockResolvedValue({ openCallup: openCallupMock });

    const formData = new FormData();
    formData.set("date", "2026-10-30");
    formData.set("start_time", "08:00");
    formData.set("players_per_team", "6");
    formData.set("teams_per_round", "4");

    const result = await openCallup(formData);
    expect(result).toEqual({ success: true, id: callupId, roundId });
    expect(openCallupMock).toHaveBeenCalledWith(leagueId, expect.objectContaining({
      date: "2026-10-30",
      startTime: "08:00",
      playersPerTeam: 6,
      teamsPerRound: 4,
    }));
    expect(mocks.revalidatePath).toHaveBeenCalled();
    expect(mocks.scheduleReminders).toHaveBeenCalledWith({
      roundId,
      date: "2026-10-30",
      startTime: "08:00",
      includeOpening: true,
    });
  });

  it("routes joinActiveCallup via API when available", async () => {
    const joinCallup = vi.fn().mockResolvedValue({ status: "confirmed", position: 2 });
    mocks.callupApi.mockResolvedValue({ joinCallup });

    const result = await joinActiveCallup(callupId);
    expect(result).toEqual({ success: true, status: "confirmed" });
    expect(joinCallup).toHaveBeenCalledWith(leagueId, callupId);
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("routes leaveActiveCallup via API when available", async () => {
    const leaveCallup = vi.fn().mockResolvedValue({ roundId: null });
    mocks.callupApi.mockResolvedValue({ leaveCallup });

    const result = await leaveActiveCallup(callupId);
    expect(result).toEqual({ success: true });
    expect(leaveCallup).toHaveBeenCalledWith(leagueId, callupId);
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("routes closeCallup and lockCallup via API when available", async () => {
    const closeCallupMock = vi.fn().mockResolvedValue(undefined);
    const lockCallupMock = vi.fn().mockResolvedValue(undefined);
    const setVisibilityMock = vi.fn().mockResolvedValue(undefined);
    mocks.callupApi.mockResolvedValue({
      closeCallup: closeCallupMock,
      lockCallup: lockCallupMock,
      setVisibility: setVisibilityMock,
    });

    await expect(closeCallup(callupId)).resolves.toEqual({ success: true });
    expect(closeCallupMock).toHaveBeenCalledWith(leagueId, callupId);

    await expect(lockCallupForRound(callupId)).resolves.toEqual({ success: true });
    expect(lockCallupMock).toHaveBeenCalledWith(leagueId, callupId);

    await expect(setCallupVisibility(callupId, false)).resolves.toEqual({ success: true });
    expect(setVisibilityMock).toHaveBeenCalledWith(leagueId, callupId, false);
  });

  it("routes repairMyPlayerAccount via API when available", async () => {
    const repairMyPlayer = vi.fn().mockResolvedValue({ playerId });
    mocks.callupApi.mockResolvedValue({ repairMyPlayer });

    const result = await repairMyPlayerAccount();
    expect(result).toEqual({ success: true, playerId });
    expect(repairMyPlayer).toHaveBeenCalled();
  });
});
