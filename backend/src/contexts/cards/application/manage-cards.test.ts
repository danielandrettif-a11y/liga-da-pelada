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
        { slug: "c1", name: "Card 1", description: "", rarity: "COMMON", effectType: "NONE", effectConfig: {}, enabled: true, icon: "🃏", requiresTarget: "NONE" },
        { slug: "c2", name: "Card 2", description: "", rarity: "RARE", effectType: "NONE", effectConfig: {}, enabled: true, icon: "🃏", requiresTarget: "NONE" },
      ],
    }),
    getPackById: vi.fn().mockResolvedValue({
      id: "pack-1",
      roundId: "r1",
      status: "opened",
      openedAt: null,
      chosenCardId: null,
      createdAt: "",
      offers: ["c1", "c2"].map((slug, index) => ({ slot: index + 1, card: {
        slug, name: slug, description: "", rarity: "COMMON", effectType: "NONE",
        effectConfig: {}, enabled: true, icon: "🃏", requiresTarget: "NONE",
      } })),
    }),
    claimPackCard: vi.fn().mockResolvedValue({ success: true }),
    getMyInventory: vi.fn().mockResolvedValue({ cards: [], groupedBySlug: {} }),
    getMyInventoryCount: vi.fn().mockResolvedValue(5),
    getActiveCardForRound: vi.fn().mockResolvedValue(null),
    getOwnedCardDefinition: vi.fn().mockResolvedValue({
      slug: "c1",
      name: "Card 1",
      description: "",
      rarity: "COMMON",
      effectType: "NONE",
      effectConfig: {},
      enabled: true,
      icon: "🃏",
      requiresTarget: "NONE",
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

  it("uses the owned database card definition instead of trusting the client slug", async () => {
    const repo = createMockRepo({
      getOwnedCardDefinition: vi.fn().mockResolvedValue({
        slug: "double_prediction",
        name: "Palpite duplo",
        description: "",
        rarity: "RARE",
        effectType: "NONE",
        effectConfig: {},
        enabled: true,
        icon: "🃏",
        requiresTarget: "DUO_PLAYERS",
      }),
    });
    const useCase = new ManageCardsUseCase(repo);

    const result = await useCase.activateCardForRound(userActor, leagueId, {
      roundId: "r1",
      userCardId: "uc1",
      cardSlug: "client-forged-slug",
      targetPlayerId: "p1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("dois atletas diferentes");
    expect(repo.getOwnedCardDefinition).toHaveBeenCalledWith(leagueId, "user-2", "r1", "uc1");
    expect(repo.activateCardForRound).not.toHaveBeenCalled();
  });

  it("blocks test pack generation for non-admin", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCardsUseCase(repo);

    const result = await useCase.giveMyAccountTestPack(userActor, leagueId);

    expect(result.success).toBe(false);
    expect(repo.giveMyAccountTestPack).not.toHaveBeenCalled();
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

