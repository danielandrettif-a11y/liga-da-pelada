import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../../shared/actor.js";
import {
  ManageFantasyAdminUseCase,
  type FantasyAdminRepository,
} from "./manage-fantasy-admin.js";

describe("Application: ManageFantasyAdminUseCase", () => {
  const adminActor: Actor = { userId: "admin-1" };
  const userActor: Actor = { userId: "user-2" };
  const leagueId = "league-1";

  const createMockRepo = (overrides: Partial<FantasyAdminRepository> = {}): FantasyAdminRepository => ({
    isLeagueAdmin: vi.fn().mockImplementation(async (_lId, uId) => uId === "admin-1"),
    getRankingRawEntries: vi.fn().mockResolvedValue([
      { userId: "u1", userName: "Alice", userAvatarUrl: null, totalPoints: 100, patrimony: 100, lastRoundPoints: 10, lineupsCount: 2 },
      { userId: "u2", userName: "Bob", userAvatarUrl: null, totalPoints: 150, patrimony: 110, lastRoundPoints: 20, lineupsCount: 2 },
    ]),
    getUserHistory: vi.fn().mockResolvedValue([]),
    getUserRoundHistory: vi.fn().mockResolvedValue({
      userId: "u1",
      roundId: "r1",
      roundNumber: 1,
      score: 45,
      captainPlayerId: "p1",
      captainMultiplier: 1.5,
      slots: [],
    }),
    getSeasonPassDashboard: vi.fn().mockResolvedValue({
      authenticated: true,
      available: true,
      progress: 5,
      maxProgress: 40,
      mode: "athlete",
      participations: 2,
      activeWeeks: 1,
      validLineups: 2,
      shopCycleRemainder: 0,
      shopBonusPoints: 0,
      nextMilestone: 10,
      playerName: "Alice",
      playerAvatarUrl: null,
      events: [],
    }),
    getAdminData: vi.fn().mockResolvedValue({
      settings: { initial_budget: 100 }, rounds: [], testSession: null,
      friendlyRounds: [], marketStatus: null,
    }),
    updateSettings: vi.fn().mockResolvedValue({ success: true }),
    rebuildRoundStats: vi.fn().mockResolvedValue(undefined),
    reprocessRound: vi.fn().mockResolvedValue({ success: true, affectedRounds: 8 }),
    createTestSession: vi.fn().mockResolvedValue({ success: true }),
    processTestSession: vi.fn().mockResolvedValue({ success: true }),
    resetTestSession: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  });

  it("returns sorted ranking with positions", async () => {
    const repo = createMockRepo();
    const useCase = new ManageFantasyAdminUseCase(repo);

    const ranking = await useCase.getRanking(userActor, leagueId);
    expect(ranking[0].userId).toBe("u2");
    expect(ranking[0].rank).toBe(1);
    expect(ranking[1].userId).toBe("u1");
    expect(ranking[1].rank).toBe(2);
  });

  it("blocks getAdminData for non-admin", async () => {
    const repo = createMockRepo();
    const useCase = new ManageFantasyAdminUseCase(repo);

    const result = await useCase.getAdminData(userActor, leagueId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("restrito a administradores");
  });

  it("allows reprocessRound for admin", async () => {
    const repo = createMockRepo();
    const useCase = new ManageFantasyAdminUseCase(repo);

    const result = await useCase.reprocessRound(adminActor, leagueId, "r1", true);
    expect(result.success).toBe(true);
    expect(result.affectedRounds).toBe(8);
    expect(repo.rebuildRoundStats).toHaveBeenCalledWith(leagueId, "r1", adminActor.userId);
  });

  it("validates and updates settings for admin", async () => {
    const repo = createMockRepo();
    const useCase = new ManageFantasyAdminUseCase(repo);

    const invalid = await useCase.updateSettings(adminActor, leagueId, { goalPoints: 10 });
    expect(invalid.success).toBe(false);

    const valid = await useCase.updateSettings(adminActor, leagueId, { initialBudget: 120 });
    expect(valid.success).toBe(true);
    expect(repo.updateSettings).toHaveBeenCalledWith(leagueId, { initial_budget: 120 }, adminActor.userId);
  });

  it("does not reprocess when rebuilding round stats fails", async () => {
    const repo = createMockRepo({ rebuildRoundStats: vi.fn().mockRejectedValue(new Error("falha nos scouts")) });
    const result = await new ManageFantasyAdminUseCase(repo).reprocessRound(adminActor, leagueId, "r1", false);
    expect(result).toEqual({ success: false,
      error: "Não foi possível reconstruir os scouts antes do reprocessamento: falha nos scouts" });
    expect(repo.reprocessRound).not.toHaveBeenCalled();
  });
});

