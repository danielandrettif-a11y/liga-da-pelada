import { describe, it, expect, vi } from "vitest";
import { ManageCosmeticsUseCase, type CosmeticsRepository } from "./manage-cosmetics.js";

describe("ManageCosmeticsUseCase", () => {
  const createMockRepo = (): CosmeticsRepository => ({
    getCosmeticsDashboard: vi.fn().mockResolvedValue({ pass: null, shop: null, equipped: null }),
    equipCosmetic: vi.fn().mockResolvedValue({ success: true }),
    claimPassCosmetic: vi.fn().mockResolvedValue({ success: true }),
    purchaseSeasonPassShopItem: vi.fn().mockResolvedValue({ success: true }),
    getMyEquippedCosmetics: vi.fn().mockResolvedValue({ border: null, avatar: null, card_theme: null, goal_effect: null }),
    getPlayerEquippedCosmetics: vi.fn().mockResolvedValue(null),
    getAllPlayersEquippedCosmeticsMap: vi.fn().mockResolvedValue({}),
    resolveAdminCosmeticsPreview: vi.fn().mockResolvedValue(null),
    cleanupLegacyCosmeticsPreview: vi.fn().mockResolvedValue({ success: true }),
    dismissUnopenedBronzePassPack: vi.fn().mockResolvedValue({ success: true }),
    resetTestPassRewardClaims: vi.fn().mockResolvedValue({ success: true }),
  });

  it("validates slot before delegating equip to repository", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCosmeticsUseCase(repo);

    const invalidRes = await useCase.equip({ userId: "u1", slot: "invalid", cosmeticId: "c1" });
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.error).toContain("Slot de cosmético inválido");
    expect(repo.equipCosmetic).not.toHaveBeenCalled();

    const validRes = await useCase.equip({ userId: "u1", slot: "border", cosmeticId: "c1" });
    expect(validRes.success).toBe(true);
    expect(repo.equipCosmetic).toHaveBeenCalledWith({ userId: "u1", slot: "border", cosmeticId: "c1" });
  });

  it("validates claim params before delegating to repository", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCosmeticsUseCase(repo);

    const invalid = await useCase.claimPassCosmetic({ userId: "u1", rewardId: "", cosmeticId: "c1", fantasySeasonId: "fs1" });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain("Dados incompletos");

    const valid = await useCase.claimPassCosmetic({ userId: "u1", rewardId: "r1", cosmeticId: "c1", fantasySeasonId: "fs1" });
    expect(valid.success).toBe(true);
    expect(repo.claimPassCosmetic).toHaveBeenCalledWith({ userId: "u1", rewardId: "r1", cosmeticId: "c1", fantasySeasonId: "fs1" });
  });

  it("delegates purchase, dashboard and query operations to repository", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCosmeticsUseCase(repo);

    await useCase.getDashboard({ userId: "u1", leagueId: "l1", seasonId: "s1", isAdmin: true });
    expect(repo.getCosmeticsDashboard).toHaveBeenCalledWith({ userId: "u1", leagueId: "l1", seasonId: "s1", isAdmin: true });

    await useCase.purchaseShopItem({ userId: "u1", shopItemId: "item-1", fantasySeasonId: "fs1" });
    expect(repo.purchaseSeasonPassShopItem).toHaveBeenCalledWith({ userId: "u1", shopItemId: "item-1", fantasySeasonId: "fs1" });

    await useCase.getMyEquipped("u1");
    expect(repo.getMyEquippedCosmetics).toHaveBeenCalledWith("u1");

    await useCase.getPlayerEquipped("p1");
    expect(repo.getPlayerEquippedCosmetics).toHaveBeenCalledWith("p1");

    await useCase.getAllPlayersMap(["p1", "p2"]);
    expect(repo.getAllPlayersEquippedCosmeticsMap).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("delegates admin preview and cleanup operations to repository", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCosmeticsUseCase(repo);

    await useCase.resolveAdminPreview({ isAdmin: true, ownPlayerId: "p1", playerId: "p1", requested: {} });
    expect(repo.resolveAdminCosmeticsPreview).toHaveBeenCalled();

    await useCase.cleanupLegacyPreview("fs1");
    expect(repo.cleanupLegacyCosmeticsPreview).toHaveBeenCalledWith("fs1");

    await useCase.dismissBronzePack("fs1");
    expect(repo.dismissUnopenedBronzePassPack).toHaveBeenCalledWith("fs1");

    await useCase.resetTestClaims({ fantasySeasonId: "fs1", selectedFantasySeasonId: "fs1" });
    expect(repo.resetTestPassRewardClaims).toHaveBeenCalledWith({ fantasySeasonId: "fs1", selectedFantasySeasonId: "fs1" });
  });
});
