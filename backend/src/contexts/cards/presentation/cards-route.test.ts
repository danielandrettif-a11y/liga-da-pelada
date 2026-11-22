import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { registerCardsRoutes } from "./cards-route.js";
import type { CardsRepository } from "../application/manage-cards.js";

describe("Presentation: CardsRoute", () => {
  const verifier: UserVerifier = {
    verifyAccessToken: vi.fn().mockResolvedValue({ userId: "u1", email: "u1@test.com" }),
  };

  const createMockRepo = (overrides: Partial<CardsRepository> = {}): CardsRepository => ({
    isLeagueAdmin: vi.fn().mockResolvedValue(true),
    getMyPacks: vi.fn().mockResolvedValue({ availablePacks: [], claimedCount: 1, totalPacks: 1 }),
    restoreMyPassPacks: vi.fn().mockResolvedValue({ success: true }),
    openPack: vi.fn().mockResolvedValue({ success: true, offers: [] }),
    getPackById: vi.fn().mockResolvedValue({
      id: "p1",
      userId: "u1",
      leagueId: "l1",
      status: "opened",
      cardSlugOffer1: "c1",
      cardSlugOffer2: "c2",
      createdAt: "",
    }),
    claimPackCard: vi.fn().mockResolvedValue({ success: true }),
    getMyInventory: vi.fn().mockResolvedValue({ cards: [], groupedBySlug: {} }),
    getMyInventoryCount: vi.fn().mockResolvedValue(3),
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
    generatePacksForFinishedRound: vi.fn().mockResolvedValue(5),
    giveMyAccountTestPack: vi.fn().mockResolvedValue({ success: true }),
    resetMyAccountCards: vi.fn().mockResolvedValue({ success: true }),
    distributePackToAllLineupUsers: vi.fn().mockResolvedValue({ success: true, awardedUsersCount: 4 }),
    auditAndRepairCurrentSeasonPacks: vi.fn().mockResolvedValue({ success: true }),
    grantFantasyPackToUser: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  });

  const buildApp = async (repo: CardsRepository) => {
    const app = Fastify();
    registerCardsRoutes(app, { verifier, repository: repo });
    return app;
  };

  it("GET /api/cards/leagues/:leagueId/packs returns 200 with packs", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/api/cards/leagues/l1/packs",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.totalPacks).toBe(1);
  });

  it("POST /api/cards/leagues/:leagueId/packs/:packId/open returns 200", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "POST",
      url: "/api/cards/leagues/l1/packs/p1/open",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
  });

  it("POST /api/cards/leagues/:leagueId/rounds/:roundId/activate returns 200", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "POST",
      url: "/api/cards/leagues/l1/rounds/r1/activate",
      headers: { authorization: "Bearer valid-token" },
      payload: { userCardId: "uc1", cardSlug: "c1" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
  });

  it("DELETE /api/cards/leagues/:leagueId/rounds/:roundId/active returns 200", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/cards/leagues/l1/rounds/r1/active",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
  });
});
