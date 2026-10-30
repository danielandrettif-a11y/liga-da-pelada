import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerCosmeticsRoutes } from "./cosmetics-route.js";
import type { CosmeticsRepository } from "../application/manage-cosmetics.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";

describe("Cosmetics Routes", () => {
  const createMockRepo = (): CosmeticsRepository => ({
    getCosmeticsDashboard: vi.fn().mockResolvedValue({ catalog: [], unlockedIds: [], equipped: null }),
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

  const createMockVerifier = (isAdmin = false): UserVerifier => ({
    verifyAccessToken: vi.fn().mockResolvedValue({
      userId: "u1",
      email: "test@example.com",
      role: isAdmin ? "admin" : "member",
      isAdmin,
    }),
  });

  it("GET /api/cosmetics/dashboard returns 200 with dashboard data", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCosmeticsRoutes(app, { repository: repo, userVerifier: createMockVerifier() });

    const res = await app.inject({
      method: "GET",
      url: "/api/cosmetics/dashboard?leagueId=l1&seasonId=s1",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.catalog).toEqual([]);
    expect(repo.getCosmeticsDashboard).toHaveBeenCalledWith({
      userId: "u1",
      leagueId: "l1",
      seasonId: "s1",
      isAdmin: false,
    });
  });

  it("POST /api/cosmetics/equip delegates to useCase", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCosmeticsRoutes(app, { repository: repo, userVerifier: createMockVerifier() });

    const res = await app.inject({
      method: "POST",
      url: "/api/cosmetics/equip",
      headers: { authorization: "Bearer valid-token" },
      payload: { slot: "border", cosmeticId: "c1" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    expect(repo.equipCosmetic).toHaveBeenCalledWith({
      userId: "u1",
      slot: "border",
      cosmeticId: "c1",
    });
  });

  it("GET /api/cosmetics/equipped/me returns equipped summary", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCosmeticsRoutes(app, { repository: repo, userVerifier: createMockVerifier() });

    const res = await app.inject({
      method: "GET",
      url: "/api/cosmetics/equipped/me",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(repo.getMyEquippedCosmetics).toHaveBeenCalledWith("u1");
  });

  it("admin routes enforce admin permission", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCosmeticsRoutes(app, { repository: repo, userVerifier: createMockVerifier(false) });

    const res = await app.inject({
      method: "POST",
      url: "/api/cosmetics/admin/cleanup-legacy",
      headers: { authorization: "Bearer non-admin-token" },
      payload: { fantasySeasonId: "fs1" },
    });

    expect(res.statusCode).toBe(403);
    expect(repo.cleanupLegacyCosmeticsPreview).not.toHaveBeenCalled();
  });
});
