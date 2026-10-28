import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  selectedLeague: vi.fn(),
  roundApi: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../auth", () => ({
  getCurrentAccount: mocks.account,
}));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/rounds/infrastructure/round-api-session", () => ({ roundApiFor: mocks.roundApi }));

import { drawTeamsAdaptiveOnServer } from "./adaptive-draw";

const leagueId = "00000000-0000-4000-8000-000000000001";

describe("adaptive-draw actions via API gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const client = {
      from: vi.fn(),
    };

    mocks.account.mockResolvedValue({
      user: { id: "user-123" },
      isAdmin: true,
      client,
    });
    mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "admin" });
  });

  it("routes drawTeamsAdaptiveOnServer to API gateway", async () => {
    const mockResult = {
      success: true,
      teams: [["p1", "p2"], ["p3", "p4"]],
      balanceScore: 95,
    };
    mocks.roundApi.mockResolvedValue({
      drawTeamsAdaptiveOnServer: vi.fn().mockResolvedValue(mockResult),
    });

    const res = await drawTeamsAdaptiveOnServer({
      playerIds: ["p1", "p2", "p3", "p4"],
      teamCount: 2,
      playersPerTeam: 2,
    });

    expect(res).toEqual(mockResult);
  });
});
