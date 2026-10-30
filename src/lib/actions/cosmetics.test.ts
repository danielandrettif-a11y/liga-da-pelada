import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: any) => fn,
}));

const mockCosmeticsApi = {
  getCosmeticsDashboard: vi.fn().mockResolvedValue({ catalog: [], unlockedIds: [] }),
  cleanupLegacyCosmeticsPreview: vi.fn().mockResolvedValue({ success: true }),
  dismissUnopenedBronzePassPack: vi.fn().mockResolvedValue({ success: true }),
  resetTestPassRewardClaims: vi.fn().mockResolvedValue({ success: true }),
  claimPassCosmetic: vi.fn().mockResolvedValue({ success: true }),
  purchaseSeasonPassShopItem: vi.fn().mockResolvedValue({ success: true }),
  equipCosmetic: vi.fn().mockResolvedValue({ success: true }),
  getAdminCosmeticsPreview: vi.fn().mockResolvedValue(null),
  getMyEquippedCosmetics: vi.fn().mockResolvedValue({ border: null, avatar: null, card_theme: null, goal_effect: null }),
  getPlayerEquippedCosmetics: vi.fn().mockResolvedValue(null),
  getAllPlayersEquippedCosmeticsMap: vi.fn().mockResolvedValue(new Map()),
};

vi.mock("@/modules/cosmetics/infrastructure/cosmetics-api-session", () => ({
  cosmeticsApiFor: vi.fn().mockImplementation(() => Promise.resolve(mockCosmeticsApi)),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentAccount: vi.fn().mockResolvedValue({
    user: { id: "user-123" },
    isAdmin: true,
    client: { from: vi.fn() },
    profile: { player_id: "player-123" },
  }),
}));

vi.mock("./rounds", () => ({
  getActiveLeague: vi.fn().mockResolvedValue({ id: "league-123", players_per_team: 6 }),
}));

vi.mock("./seasons", () => ({
  getActiveSeason: vi.fn().mockResolvedValue({ id: "season-123" }),
}));

vi.mock("@/modules/cosmetics/infrastructure/supabase-admin-cleanup-gateway", () => ({
  readFantasySeasonId: vi.fn().mockResolvedValue("fs-123"),
  supabaseAdminCosmeticsCleanupGateway: vi.fn().mockReturnValue({}),
}));

import {
  getMyCosmeticsDashboard,
  cleanupMyLegacyCosmeticsPreview,
  dismissMyUnopenedBronzePassPack,
  resetMyTestPassRewardClaims,
  claimPassCosmetic,
  purchaseSeasonPassShopItem,
  equipCosmetic,
  getAdminCosmeticsPreview,
  getMyEquippedCosmetics,
  getPlayerEquippedCosmetics,
  getAllPlayersEquippedCosmeticsMap,
} from "./cosmetics";

describe("Server Actions: Cosmetics Bridging (11 operations)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates dashboard and equipped query operations to cosmeticsApi", async () => {
    const dashboard = await getMyCosmeticsDashboard();
    expect(mockCosmeticsApi.getCosmeticsDashboard).toHaveBeenCalledWith("league-123", "season-123", true);
    expect(dashboard).toEqual({ catalog: [], unlockedIds: [] });

    await getMyEquippedCosmetics();
    expect(mockCosmeticsApi.getMyEquippedCosmetics).toHaveBeenCalled();

    await getPlayerEquippedCosmetics("player-123");
    expect(mockCosmeticsApi.getPlayerEquippedCosmetics).toHaveBeenCalledWith("player-123");

    await getAllPlayersEquippedCosmeticsMap(["p1", "p2"]);
    expect(mockCosmeticsApi.getAllPlayersEquippedCosmeticsMap).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("delegates mutation operations (equip, claim, purchase) to cosmeticsApi", async () => {
    const equipRes = await equipCosmetic("frame", "c-1");
    expect(mockCosmeticsApi.equipCosmetic).toHaveBeenCalledWith("frame", "c-1");
    expect(equipRes.success).toBe(true);

    const claimRes = await claimPassCosmetic("r-1", "c-1");
    expect(mockCosmeticsApi.claimPassCosmetic).toHaveBeenCalledWith("r-1", "c-1", "fs-123");
    expect(claimRes.success).toBe(true);

    const purchaseRes = await purchaseSeasonPassShopItem("item-1");
    expect(mockCosmeticsApi.purchaseSeasonPassShopItem).toHaveBeenCalledWith("item-1", "fs-123");
    expect(purchaseRes.success).toBe(true);
  });

  it("delegates admin preview and cleanup operations to cosmeticsApi", async () => {
    await getAdminCosmeticsPreview("player-123", { frame: "f-1" });
    expect(mockCosmeticsApi.getAdminCosmeticsPreview).toHaveBeenCalledWith("player-123", { frame: "f-1" }, "player-123", true);

    const cleanupRes = await cleanupMyLegacyCosmeticsPreview();
    expect(mockCosmeticsApi.cleanupLegacyCosmeticsPreview).toHaveBeenCalledWith("fs-123");
    expect(cleanupRes.success).toBe(true);

    const dismissRes = await dismissMyUnopenedBronzePassPack();
    expect(mockCosmeticsApi.dismissUnopenedBronzePassPack).toHaveBeenCalledWith("fs-123");
    expect(dismissRes.success).toBe(true);

    const resetRes = await resetMyTestPassRewardClaims("fs-123");
    expect(mockCosmeticsApi.resetTestPassRewardClaims).toHaveBeenCalledWith("fs-123", "fs-123");
    expect(resetRes.success).toBe(true);
  });
});
