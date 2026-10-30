import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../../shared/actor.js";
import {
  ManageCardsUseCase,
  type CardsRepository,
} from "./manage-cards.js";

describe("Application: ManageCardsUseCase", () => {
  const adminActor: Actor = { userId: "admin-1" };
  const userActor: Actor = { userId: "user-2" };
  const leagueId = "league-123";

  const createMockRepo = (overrides: Partial<CardsRepository> = {}): CardsRepository => ({
    isLeagueAdmin: vi.fn().mockImplementation(async (_lId, uId) => uId === "admin-1"),
    getMyPacks: vi.fn().mockResolvedValue({
      availablePacks: [],
      claimedCount: 2,
      totalPacks: 2,
    }),
    restoreMyPassPacks: vi.fn().mockResolvedValue({ success: true }),
    openPack: vi.fn().mockResolvedValue({
      success: true,
      offers: [
        { slug: "c1", name: "Card 1", description: "", rarity: "common", cost: 0 },
        { slug: "c2", name: "Card 2", description: "", rarity: "rare", cost: 0 },
      ],
    }),
    getPackById: vi.fn().mockResolvedValue({
      id: "pack-1",
      userId: "user-2",
      leagueId,
      status: "opened",
      cardSlugOffer1: "c1",
      cardSlugOffer2: "c2",
      createdAt: "",
    }),
    claimPackCard: vi.fn().mockResolvedValue({ success: true }),
    getMyInventory: vi.fn().mockResolvedValue({ cards: [], groupedBySlug: {} }),
    getMyInventoryCount: vi.fn().mockResolvedValue(5),
    getActiveCardForRound: vi.fn().mockResolvedValue(null),
    getCardDefinition: vi.fn().mockResolvedValue({
      slug: "c1",
      name: "Card 1",
      description: "",
      rarity: "common",
      cost: 0,
      requiresTargetPlayer: false,
    }),
    isRoundOpen: vi.fn().mockResolvedValue(true),
    activateCardForRound: vi.fn().mockResolvedValue({ success: true }),
    removeActiveCardForRound: vi.fn().mockResolvedValue({ success: true }),
    generatePacksForFinishedRound: vi.fn().mockResolvedValue(4),
    giveMyAccountTestPack: vi.fn().mockResolvedValue({ success: true }),
    resetMyAccountCards: vi.fn().mockResolvedValue({ success: true }),
    distributePackToAllLineupUsers: vi.fn().mockResolvedValue({ success: true, awardedUsersCount: 6 }),
    auditAndRepairCurrentSeasonPacks: vi.fn().mockResolvedValue({ success: true }),
    grantFantasyPackToUser: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  });

  it("retrieves packs for user", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCardsUseCase(repo);

    const result = await useCase.getMyPacks(userActor, leagueId);
    expect(result.totalPacks).toBe(2);
    expect(repo.getMyPacks).toHaveBeenCalledWith(leagueId, "user-2");
  });

  it("claims pack card after domain validation", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCardsUseCase(repo);

    const result = await useCase.claimPackCard(userActor, leagueId, "pack-1", "c1");
    expect(result.success).toBe(true);
    expect(repo.claimPackCard).toHaveBeenCalledWith(leagueId, "user-2", "pack-1", "c1");
  });

  it("activates card for round after validating round status", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCardsUseCase(repo);

    const result = await useCase.activateCardForRound(userActor, leagueId, {
      roundId: "r1",
      userCardId: "uc1",
      cardSlug: "c1",
    });

    expect(result.success).toBe(true);
    expect(repo.activateCardForRound).toHaveBeenCalled();
  });

  it("blocks distributePackToAllLineupUsers for non-admin", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCardsUseCase(repo);

    const result = await useCase.distributePackToAllLineupUsers(userActor, leagueId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Apenas administradores");
  });

  it("allows distributePackToAllLineupUsers for admin", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCardsUseCase(repo);

    const result = await useCase.distributePackToAllLineupUsers(adminActor, leagueId);
    expect(result.success).toBe(true);
    expect(result.awardedUsersCount).toBe(6);
  });
});
