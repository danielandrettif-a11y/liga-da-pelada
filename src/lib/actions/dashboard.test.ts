import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getStatisticsApiSessionMock = vi.fn();
const getActiveSeasonMock = vi.fn();
const getCurrentAccountMock = vi.fn();
const getEventWeatherMock = vi.fn();

vi.mock("@/modules/statistics/infrastructure/statistics-api-session", () => ({
  getStatisticsApiSession: () => getStatisticsApiSessionMock(),
}));

vi.mock("./seasons", () => ({
  getActiveSeason: () => getActiveSeasonMock(),
}));

vi.mock("../auth", () => ({
  getCurrentAccount: () => getCurrentAccountMock(),
}));

vi.mock("../weather", () => ({
  getEventWeather: () => getEventWeatherMock(),
}));

import { getDashboardData } from "./dashboard";

describe("Server Action: getDashboardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to statistics gateway when api session is enabled", async () => {
    const mockGateway = {
      getDashboardData: vi.fn().mockResolvedValue({
        success: true,
        data: { matchDuration: 10, preseasonEnabled: true },
      }),
    };
    getStatisticsApiSessionMock.mockResolvedValue({
      enabled: true,
      gateway: mockGateway,
    });
    getActiveSeasonMock.mockResolvedValue({
      id: "season-1",
      league_id: "league-123",
    });

    const result = await getDashboardData();
    expect(result).toEqual({
      success: true,
      data: { matchDuration: 10, preseasonEnabled: true },
    });
    expect(mockGateway.getDashboardData).toHaveBeenCalledWith("league-123");
  });

  it("falls back to legacy supabase flow when api session is disabled", async () => {
    getStatisticsApiSessionMock.mockResolvedValue(null);
    getActiveSeasonMock.mockResolvedValue({
      id: "season-1",
      league_id: "league-123",
    });
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          nextRound: { id: "r1", number: 1 },
          league: { match_duration: 7 },
          activeCallups: [],
        },
        error: null,
      }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    };
    getCurrentAccountMock.mockResolvedValue({
      user: { id: "u1" },
      client,
    });
    getEventWeatherMock.mockResolvedValue(null);

    const result = await getDashboardData();
    expect(result.success).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("get_home_read_model", {
      p_season_id: "season-1",
      p_league_id: "league-123",
    });
  });
});
