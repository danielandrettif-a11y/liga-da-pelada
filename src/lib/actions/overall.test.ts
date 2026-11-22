import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const getStatisticsApiSessionMock = vi.fn();
const getSelectedLeagueMock = vi.fn();
const getAdminClientMock = vi.fn();
const getCurrentAccountMock = vi.fn();

vi.mock("@/modules/statistics/infrastructure/statistics-api-session", () => ({
  getStatisticsApiSession: () => getStatisticsApiSessionMock(),
}));

vi.mock("../league-context", () => ({
  getSelectedLeague: () => getSelectedLeagueMock(),
}));

vi.mock("../auth", () => ({
  getAdminClient: () => getAdminClientMock(),
  getCurrentAccount: () => getCurrentAccountMock(),
}));

import {
  getOverallShadowAdminData,
  recalculateOverallShadow,
  publishOverallShadow,
  recalculateAndPublishFluidOverall,
  refreshFluidOverallSafely,
} from "./overall";

describe("Server Actions: overall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates getOverallShadowAdminData to gateway when api session is enabled", async () => {
    const mockGateway = {
      getOverallShadowAdminData: vi.fn().mockResolvedValue({
        latestRun: { id: "run-1" },
        snapshots: [],
        pendingPlayers: [],
      }),
    };
    getStatisticsApiSessionMock.mockResolvedValue({
      enabled: true,
      gateway: mockGateway,
    });
    getSelectedLeagueMock.mockResolvedValue({ id: "league-1", role: "admin" });

    const result = await getOverallShadowAdminData();
    expect(result?.latestRun?.id).toBe("run-1");
    expect(mockGateway.getOverallShadowAdminData).toHaveBeenCalledWith("league-1");
  });

  it("delegates recalculateOverallShadow to gateway when api session is enabled", async () => {
    const mockGateway = {
      recalculateOverallShadow: vi.fn().mockResolvedValue({
        success: true,
        runId: "run-2",
      }),
    };
    getStatisticsApiSessionMock.mockResolvedValue({
      enabled: true,
      gateway: mockGateway,
    });
    getSelectedLeagueMock.mockResolvedValue({ id: "league-1", role: "admin" });

    const result = await recalculateOverallShadow();
    expect(result).toEqual({ success: true, runId: "run-2" });
    expect(mockGateway.recalculateOverallShadow).toHaveBeenCalledWith("league-1");
  });

  it("delegates publishOverallShadow to gateway when api session is enabled", async () => {
    const mockGateway = {
      publishOverallShadow: vi.fn().mockResolvedValue({ success: true }),
    };
    getStatisticsApiSessionMock.mockResolvedValue({
      enabled: true,
      gateway: mockGateway,
    });
    getSelectedLeagueMock.mockResolvedValue({ id: "league-1", role: "admin" });

    const result = await publishOverallShadow("run-2");
    expect(result).toEqual({ success: true });
    expect(mockGateway.publishOverallShadow).toHaveBeenCalledWith("league-1", "run-2");
  });

  it("delegates recalculateAndPublishFluidOverall to gateway when api session is enabled", async () => {
    const mockGateway = {
      recalculateAndPublishFluidOverall: vi.fn().mockResolvedValue({ success: true, published: true }),
    };
    getStatisticsApiSessionMock.mockResolvedValue({
      enabled: true,
      gateway: mockGateway,
    });
    getSelectedLeagueMock.mockResolvedValue({ id: "league-1", role: "admin" });

    const result = await recalculateAndPublishFluidOverall();
    expect(result).toEqual({ success: true, published: true });
    expect(mockGateway.recalculateAndPublishFluidOverall).toHaveBeenCalledWith("league-1");
  });

  it("delegates refreshFluidOverallSafely to gateway when api session is enabled", async () => {
    const mockGateway = {
      refreshFluidOverallSafely: vi.fn().mockResolvedValue({ success: true }),
    };
    getStatisticsApiSessionMock.mockResolvedValue({
      enabled: true,
      gateway: mockGateway,
    });
    getSelectedLeagueMock.mockResolvedValue({ id: "league-1", role: "admin" });

    const result = await refreshFluidOverallSafely("rodada-finalizada");
    expect(result).toEqual({ success: true });
    expect(mockGateway.refreshFluidOverallSafely).toHaveBeenCalledWith("league-1", "rodada-finalizada");
  });

  it("returns null for getOverallShadowAdminData when session disabled and user is not admin", async () => {
    getStatisticsApiSessionMock.mockResolvedValue(null);
    getAdminClientMock.mockResolvedValue(null);
    getSelectedLeagueMock.mockResolvedValue({ id: "league-1", role: "player" });

    const result = await getOverallShadowAdminData();
    expect(result).toBeNull();
  });
});

