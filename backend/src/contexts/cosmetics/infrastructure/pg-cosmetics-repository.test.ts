import { describe, it, expect, vi } from "vitest";
import { PgCosmeticsRepository } from "./pg-cosmetics-repository.js";

describe("PgCosmeticsRepository", () => {
  it("loads cosmetics dashboard", async () => {
    const mockPool: any = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "c1", name: "Dourada", slot: "border", is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ cosmetic_id: "c1" }] })
        .mockResolvedValueOnce({ rows: [{ border_cosmetic_id: "c1" }] }),
    };

    const repo = new PgCosmeticsRepository(mockPool);
    const dashboard = await repo.getCosmeticsDashboard({
      userId: "u1",
      leagueId: "l1",
      seasonId: "s1",
      isAdmin: false,
    });

    expect(dashboard.catalog).toHaveLength(1);
    expect(dashboard.unlockedIds).toContain("c1");
    expect(dashboard.equipped.border).toBe("c1");
  });

  it("equips cosmetic after ownership check", async () => {
    const mockPool: any = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const repo = new PgCosmeticsRepository(mockPool);
    const res = await repo.equipCosmetic({
      userId: "u1",
      slot: "border",
      cosmeticId: "c1",
    });

    expect(res.success).toBe(true);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it("handles admin preview and cleanup commands gracefully", async () => {
    const mockPool: any = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "c1", name: "Border Gold", asset_url: "/gold.png", slot: "border" }] }),
    };

    const repo = new PgCosmeticsRepository(mockPool);
    const preview = await repo.resolveAdminCosmeticsPreview({
      isAdmin: true,
      ownPlayerId: "p1",
      playerId: "p1",
      requested: { border: "c1" },
    });

    expect(preview?.border?.id).toBe("c1");

    const cleanupRes = await repo.cleanupLegacyCosmeticsPreview("fs1");
    expect(cleanupRes.success).toBe(true);

    const dismissRes = await repo.dismissUnopenedBronzePassPack("fs1");
    expect(dismissRes.success).toBe(true);

    const resetRes = await repo.resetTestPassRewardClaims({ fantasySeasonId: "fs1", selectedFantasySeasonId: "fs1" });
    expect(resetRes.success).toBe(true);
  });
});
