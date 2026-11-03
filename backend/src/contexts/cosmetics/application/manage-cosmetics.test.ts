import { describe, expect, it, vi } from "vitest";
import { ManageCosmeticsUseCase, type CosmeticsRepository } from "./manage-cosmetics.js";

const createMockRepo = (): CosmeticsRepository => ({
  getCosmeticsDashboard: vi.fn().mockResolvedValue({ available: true }),
  equipCosmetic: vi.fn().mockResolvedValue({ success: true }),
  claimPassCosmetic: vi.fn().mockResolvedValue({ success: true }),
  purchaseSeasonPassShopItem: vi.fn().mockResolvedValue({ success: true }),
  getMyEquippedCosmetics: vi.fn().mockResolvedValue(null),
  getPlayerEquippedCosmetics: vi.fn().mockResolvedValue(null),
  getAllPlayersEquippedCosmeticsMap: vi.fn().mockResolvedValue({}),
  resolveAdminCosmeticsPreview: vi.fn().mockResolvedValue(null),
  cleanupLegacyCosmeticsPreview: vi.fn().mockResolvedValue({ success: true, removed: 0 }),
  dismissUnopenedBronzePassPack: vi.fn().mockResolvedValue({ success: true, dismissed: 0 }),
  resetTestPassRewardClaims: vi.fn().mockResolvedValue({ success: true }),
});

describe("ManageCosmeticsUseCase", () => {
  it("rejects legacy slots and delegates a valid account slot", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCosmeticsUseCase(repo);
    expect((await useCase.equip({ userId: "u1", slot: "border", cosmeticId: "c1" })).success).toBe(false);
    expect(repo.equipCosmetic).not.toHaveBeenCalled();
    expect((await useCase.equip({ userId: "u1", slot: "frame", cosmeticId: "c1" })).success).toBe(true);
    expect(repo.equipCosmetic).toHaveBeenCalledWith({ userId: "u1", slot: "frame", cosmeticId: "c1" });
  });

  it("validates claim and purchase identifiers", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCosmeticsUseCase(repo);
    expect((await useCase.claimPassCosmetic({ userId: "u1", rewardId: "", cosmeticId: "c1", fantasySeasonId: "fs1" })).success).toBe(false);
    expect((await useCase.purchaseShopItem({ userId: "u1", shopItemId: "", fantasySeasonId: "fs1" })).success).toBe(false);
    expect(repo.claimPassCosmetic).not.toHaveBeenCalled();
    expect(repo.purchaseSeasonPassShopItem).not.toHaveBeenCalled();
  });

  it("propagates the authenticated actor to reads and maintenance commands", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCosmeticsUseCase(repo);
    await useCase.getDashboard({ userId: "u1", leagueId: "l1", seasonId: "s1" });
    await useCase.getPlayerEquipped("p1", "u1");
    await useCase.getAllPlayersMap(["p1"], "u1");
    await useCase.resolveAdminPreview({ userId: "u1", playerId: "p1", requested: { frame: "c1" } });
    await useCase.cleanupLegacyPreview("u1", "fs1");
    await useCase.dismissBronzePack("u1", "fs1");
    await useCase.resetTestClaims({ userId: "u1", fantasySeasonId: "fs1", selectedFantasySeasonId: "fs1" });
    expect(repo.getCosmeticsDashboard).toHaveBeenCalledWith({ userId: "u1", leagueId: "l1", seasonId: "s1" });
    expect(repo.getPlayerEquippedCosmetics).toHaveBeenCalledWith("p1", "u1");
    expect(repo.getAllPlayersEquippedCosmeticsMap).toHaveBeenCalledWith(["p1"], "u1");
    expect(repo.cleanupLegacyCosmeticsPreview).toHaveBeenCalledWith("u1", "fs1");
  });
});
