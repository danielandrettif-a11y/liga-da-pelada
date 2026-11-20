import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => vi.unstubAllEnvs());

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

  it.each([false, true])("serves the home agenda before and after migration 366 (available: %s)", async (agendaAvailable) => {
    vi.stubEnv("DASHBOARD_API_ENABLED", "false");
    getStatisticsApiSessionMock.mockRejectedValue(new Error("dashboard API should not be called"));
    getActiveSeasonMock.mockResolvedValue({
      id: "season-1",
      league_id: "league-123",
    });
    const callupsQuery: any = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: any) => Promise.resolve({ data: [] }).then(resolve),
    };
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          nextRound: { id: "r1", number: 1, stadium_id: "stadium", date: "2026-11-21", start_time: "08:00" },
          league: { match_duration: 7 },
          activeCallups: [],
        },
        error: null,
      }).mockResolvedValueOnce(agendaAvailable
        ? { data: { nextRound: { id: "r1" }, league: { match_duration: 7 } }, error: null }
        : { data: null, error: { code: "PGRST202" } }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(callupsQuery),
      }),
    };
    getCurrentAccountMock.mockResolvedValue({
      user: { id: "u1" },
      client,
    });
    getEventWeatherMock.mockResolvedValue(null);

    const result = await getDashboardData({ agendaOnly: true });
    expect(result).toMatchObject({ success: true, data: { nextRound: { id: "r1" } } });
    expect(result.data?.lastRound).toBe(agendaAvailable ? undefined : null);
    expect(getStatisticsApiSessionMock).not.toHaveBeenCalled();
    expect(getEventWeatherMock).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith("get_home_agenda_read_model", {
      p_season_id: "season-1",
      p_league_id: "league-123",
    });
    expect(client.rpc).toHaveBeenCalledTimes(agendaAvailable ? 1 : 2);
    if (!agendaAvailable) expect(client.rpc).toHaveBeenNthCalledWith(2, "get_home_read_model", {
      p_season_id: "season-1", p_league_id: "league-123",
    });
  });

  it("uses the authenticated reader when the dashboard endpoint is unavailable", async () => {
    const error = Object.assign(new Error("Route not found"), { statusCode: 404 });
    getStatisticsApiSessionMock.mockResolvedValue({ gateway: { getDashboardData: vi.fn().mockRejectedValue(error) } });
    getActiveSeasonMock.mockResolvedValue({ id: "season-1", league_id: "league-123" });
    const query: any = {
      eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      then: (resolve: any) => Promise.resolve({ data: [] }).then(resolve),
    };
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { league: { match_duration: 7 }, activeCallups: [] }, error: null }),
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }),
    };
    getCurrentAccountMock.mockResolvedValue({ user: { id: "u1" }, client });
    getEventWeatherMock.mockResolvedValue(null);

    expect(await getDashboardData()).toMatchObject({ success: true });
    expect(client.rpc).toHaveBeenCalledWith("get_home_read_model", {
      p_season_id: "season-1", p_league_id: "league-123",
    });
  });
});

