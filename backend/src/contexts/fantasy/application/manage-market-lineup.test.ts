import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../../shared/auth/actor.js";
import {
  ManageFantasyMarketLineupUseCase,
  type FantasyMarketLineupRepository,
} from "./manage-market-lineup.js";

describe("Application: ManageFantasyMarketLineupUseCase", () => {
  const actor: Actor = { userId: "user-1", email: "user1@test.com" };
  const leagueId = "league-123";

  const createMockRepo = (overrides: Partial<FantasyMarketLineupRepository> = {}): FantasyMarketLineupRepository => ({
    isLeagueAdmin: vi.fn().mockResolvedValue(true),
    getDashboard: vi.fn().mockResolvedValue({
      authenticated: true,
      available: true,
      budget: 100,
      spent: 0,
      balance: 100,
      marketOpen: true,
      players: [],
      lineup: null,
      confirmedCount: 0,
      totalPlayersCount: 0,
    }),
    getPlayerDetail: vi.fn().mockResolvedValue({
      playerId: "p1",
      name: "Player One",
      price: 10,
    } as any),
    getQuickHighlights: vi.fn().mockResolvedValue({
      topValuedPlayer: null,
      topScorerPlayer: null,
      bestCostBenefitPlayer: null,
    }),
    getMySummary: vi.fn().mockResolvedValue({
      userId: "user-1",
      totalPoints: 120,
      seasonRank: 1,
      patrimony: 110,
      lineupsCount: 5,
    }),
    getMyHistory: vi.fn().mockResolvedValue([]),
    getRevealedLineups: vi.fn().mockResolvedValue({ allowed: true, lineups: [] }),
    getRoundLineupOverview: vi.fn().mockResolvedValue({
      roundId: "r1",
      isRoundOpen: true,
      confirmedCount: 4,
      revealedLineupsCount: 0,
    }),
    getMarketRoundInfo: vi.fn().mockResolvedValue({
      isMarketOpen: true,
      playerPrices: new Map([["p1", 10.0], ["p2", 8.0]]),
      userBudget: 100.0,
    }),
    saveLineup: vi.fn().mockResolvedValue({ success: true, lineupId: "lineup-1" }),
    previewMarketV11: vi.fn().mockResolvedValue({ success: true, data: { status: "ok" } }),
    repairLegacyLineups: vi.fn().mockResolvedValue({ success: true, repairedCount: 3 }),
    ...overrides,
  });

  it("returns dashboard data for authenticated user", async () => {
    const repo = createMockRepo();
    const useCase = new ManageFantasyMarketLineupUseCase(repo);

    const result = await useCase.getDashboard(actor, leagueId);
    expect(result.authenticated).toBe(true);
    expect(repo.getDashboard).toHaveBeenCalledWith(leagueId, actor.userId);
  });

  it("delegates getPlayerDetail to repo", async () => {
    const repo = createMockRepo();
    const useCase = new ManageFantasyMarketLineupUseCase(repo);

    const result = await useCase.getPlayerDetail(actor, leagueId, "p1");
    expect(result?.playerId).toBe("p1");
    expect(repo.getPlayerDetail).toHaveBeenCalledWith(leagueId, "p1", undefined);
  });

  it("saves lineup after successful validation", async () => {
    const repo = createMockRepo();
    const useCase = new ManageFantasyMarketLineupUseCase(repo);

    const result = await useCase.saveLineup(
      actor,
      leagueId,
      "round-1",
      [{ slotRole: "ATA", playerId: "p1" }],
      "p1"
    );

    expect(result.success).toBe(true);
    expect(result.lineupId).toBe("lineup-1");
    expect(repo.saveLineup).toHaveBeenCalledWith({
      leagueId,
      roundId: "round-1",
      userId: actor.userId,
      captainPlayerId: "p1",
      slots: [{ slotRole: "ATA", playerId: "p1" }],
      totalCost: 10.0,
    });
  });

  it("blocks previewMarketV11 for non-admin", async () => {
    const repo = createMockRepo({ isLeagueAdmin: vi.fn().mockResolvedValue(false) });
    const useCase = new ManageFantasyMarketLineupUseCase(repo);

    const result = await useCase.previewMarketV11(actor, leagueId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("restrito a administradores");
    expect(repo.previewMarketV11).not.toHaveBeenCalled();
  });

  it("allows repairLegacyLineups for admin", async () => {
    const repo = createMockRepo({ isLeagueAdmin: vi.fn().mockResolvedValue(true) });
    const useCase = new ManageFantasyMarketLineupUseCase(repo);

    const result = await useCase.repairLegacyLineups(actor, leagueId);
    expect(result.success).toBe(true);
    expect(result.repairedCount).toBe(3);
    expect(repo.repairLegacyLineups).toHaveBeenCalledWith(leagueId);
  });
});

