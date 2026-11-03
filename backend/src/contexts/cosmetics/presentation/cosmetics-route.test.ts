import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import type { CosmeticsRepository } from "../application/manage-cosmetics.js";
import { registerCosmeticsRoutes } from "./cosmetics-route.js";

const createMockRepo = (): CosmeticsRepository => ({
  getCosmeticsDashboard: vi.fn().mockResolvedValue({ available: true, previewCatalog: [] }),
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

const verifier: UserVerifier = {
  verifyAccessToken: vi.fn().mockResolvedValue({ userId: "u1", email: "test@example.com", role: "member", isAdmin: false }),
};

describe("Cosmetics Routes", () => {
  it("does not forward a spoofed isAdmin dashboard query", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCosmeticsRoutes(app, { repository: repo, userVerifier: verifier });
    const response = await app.inject({
      method: "GET", url: "/api/cosmetics/dashboard?leagueId=l1&seasonId=s1&isAdmin=true",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(repo.getCosmeticsDashboard).toHaveBeenCalledWith({ userId: "u1", leagueId: "l1", seasonId: "s1" });
  });

  it("accepts the canonical frame slot and returns business outcomes with HTTP 200", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    vi.mocked(repo.equipCosmetic).mockResolvedValue({ success: false, error: "Sem posse" });
    registerCosmeticsRoutes(app, { repository: repo, userVerifier: verifier });
    const response = await app.inject({
      method: "POST", url: "/api/cosmetics/equip", headers: { authorization: "Bearer valid-token" },
      payload: { slot: "frame", cosmeticId: "c1" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: false, error: "Sem posse" });
    expect(repo.equipCosmetic).toHaveBeenCalledWith({ userId: "u1", slot: "frame", cosmeticId: "c1" });
  });

  it("drops spoofed preview flags and sends only actor-owned input", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCosmeticsRoutes(app, { repository: repo, userVerifier: verifier });
    const response = await app.inject({
      method: "POST", url: "/api/cosmetics/admin-preview", headers: { authorization: "Bearer valid-token" },
      payload: { playerId: "p1", requested: { frame: "c1" }, isAdmin: true, ownPlayerId: "p1" },
    });
    expect(response.statusCode).toBe(200);
    expect(repo.resolveAdminCosmeticsPreview).toHaveBeenCalledWith({ userId: "u1", playerId: "p1", requested: { frame: "c1" } });
  });

  it("passes the authenticated actor to scoped maintenance RPCs", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCosmeticsRoutes(app, { repository: repo, userVerifier: verifier });
    const response = await app.inject({
      method: "POST", url: "/api/cosmetics/admin/cleanup-legacy", headers: { authorization: "Bearer valid-token" },
      payload: { fantasySeasonId: "fs1" },
    });
    expect(response.statusCode).toBe(200);
    expect(repo.cleanupLegacyCosmeticsPreview).toHaveBeenCalledWith("u1", "fs1");
  });
});
