import { describe, expect, it, vi } from "vitest";
import { createManageDashboardService, type DashboardRepository } from "./manage-dashboard";

describe("Statistics Application: manage-dashboard", () => {
  it("throws when leagueId is missing", async () => {
    const mockRepo: DashboardRepository = {
      getActiveSeasonId: vi.fn(),
      getDashboardData: vi.fn(),
    };
    const service = createManageDashboardService(mockRepo);
    await expect(service.getDashboard({ leagueId: "" })).rejects.toThrow("ID da liga é obrigatório.");
  });

  it("throws when active season is not found", async () => {
    const mockRepo: DashboardRepository = {
      getActiveSeasonId: vi.fn().mockResolvedValue(null),
      getDashboardData: vi.fn(),
    };
    const service = createManageDashboardService(mockRepo);
    await expect(service.getDashboard({ leagueId: "league-1" })).rejects.toThrow(
      "Temporada ativa não encontrada",
    );
  });

  it("returns mapped dashboard data on success", async () => {
    const mockRepo: DashboardRepository = {
      getActiveSeasonId: vi.fn().mockResolvedValue("season-1"),
      getDashboardData: vi.fn().mockResolvedValue({
        league: { matchDuration: 10, stadiumName: "Campão" },
        nextRound: { id: "r1", number: 1, date: "2026-11-01" },
      }),
    };
    const service = createManageDashboardService(mockRepo);
    const result = await service.getDashboard({ leagueId: "league-1" });
    expect(result.matchDuration).toBe(10);
    expect(result.nextRound?.id).toBe("r1");
    expect(result.venue.name).toBe("Campão");
  });
});
