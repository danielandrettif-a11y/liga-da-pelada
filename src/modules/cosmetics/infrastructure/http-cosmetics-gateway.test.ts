import { describe, it, expect, vi } from "vitest";
import { httpCosmeticsGateway, CosmeticsApiError } from "./http-cosmetics-gateway";

describe("httpCosmeticsGateway", () => {
  it("fetches dashboard with query parameters", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ catalog: [], unlockedIds: [] }),
    });

    const gateway = httpCosmeticsGateway("http://localhost:3001", "test-token", mockFetch as any);
    const res = await gateway.getCosmeticsDashboard("league-1", "season-1", true);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/cosmetics/dashboard?leagueId=league-1&seasonId=season-1&isAdmin=true",
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(res).toEqual({ catalog: [], unlockedIds: [] });
  });

  it("handles equip and claim operations", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const gateway = httpCosmeticsGateway("http://localhost:3001", "test-token", mockFetch as any);
    const equipRes = await gateway.equipCosmetic("frame", "c1");
    expect(equipRes.success).toBe(true);

    const claimRes = await gateway.claimPassCosmetic("r1", "c1", "fs1");
    expect(claimRes.success).toBe(true);
  });

  it("converts players map record into Map instance", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        "p1": { frameKey: "f1", auraKey: null, titleName: null, bannerAssetKey: null, nameplateKey: null, backgroundAssetKey: null, showcaseAssetKey: null, pitchAssetKey: null },
      }),
    });

    const gateway = httpCosmeticsGateway("http://localhost:3001", "test-token", mockFetch as any);
    const map = await gateway.getAllPlayersEquippedCosmeticsMap(["p1"]);
    expect(map).toBeInstanceOf(Map);
    expect(map.get("p1")?.frameKey).toBe("f1");
  });

  it("throws CosmeticsApiError on server failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Item inválido." }),
    });

    const gateway = httpCosmeticsGateway("http://localhost:3001", "test-token", mockFetch as any);
    await expect(gateway.purchaseSeasonPassShopItem("bad-item", "fs1")).rejects.toThrow(CosmeticsApiError);
  });
});
