import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { registerMarketLineupRoutes } from "./market-lineup-route.js";
import type { FantasyMarketLineupRepository } from "../application/manage-market-lineup.js";

describe("Presentation: MarketLineupRoute", () => {
  const verifier: UserVerifier = {
    verifyAccessToken: vi.fn().mockResolvedValue({ userId: "u1", email: "u1@test.com" }),
  };

  const createMockRepo = (overrides: Partial<FantasyMarketLineupRepository> = {}): FantasyMarketLineupRepository => ({
    isLeagueAdmin: vi.fn().mockResolvedValue(true),
    getDashboard: vi.fn().mockResolvedValue({
      authenticated: true,
      available: true,
      budget: 100,
      spent: 0,
      balance: 100,
      marketOpen: true,
      players: [],
      lineup: null,
      confirmedCount: 0,
      totalPlayersCount: 0,
    }),
    getPlayerDetail: vi.fn().mockResolvedValue({
      playerId: "p1",
      name: "Player 1",
      price: 10,
    } as any),
    getQuickHighlights: vi.fn().mockResolvedValue({
      topValuedPlayer: null,
      topScorerPlayer: null,
      bestCostBenefitPlayer: null,
    }),
    getMySummary: vi.fn().mockResolvedValue({
      userId: "u1",
      totalPoints: 50,
      seasonRank: 2,
      patrimony: 105,
      lineupsCount: 3,
    }),
    getMyHistory: vi.fn().mockResolvedValue([]),
    getRevealedLineups: vi.fn().mockResolvedValue({ allowed: true, lineups: [] }),
    getRoundLineupOverview: vi.fn().mockResolvedValue({
      roundId: "r1",
      isRoundOpen: true,
      confirmedCount: 2,
      revealedLineupsCount: 0,
    }),
    getMarketRoundInfo: vi.fn().mockResolvedValue({
      isMarketOpen: true,
      playerPrices: new Map([["p1", 10.0]]),
      userBudget: 100.0,
    }),
    saveLineup: vi.fn().mockResolvedValue({ success: true, lineupId: "lineup-1" }),
    previewMarketV11: vi.fn().mockResolvedValue({ success: true, data: {} }),
    repairLegacyLineups: vi.fn().mockResolvedValue({ success: true, repairedCount: 2 }),
    ...overrides,
  });

  const buildApp = async (repo: FantasyMarketLineupRepository) => {
    const app = Fastify();
    registerMarketLineupRoutes(app, { verifier, repository: repo });
    return app;
  };

  it("GET /api/fantasy/leagues/:leagueId/dashboard returns 200 with dashboard data", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/api/fantasy/leagues/l1/dashboard",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.authenticated).toBe(true);
    expect(body.budget).toBe(100);
  });

  it("POST /api/fantasy/leagues/:leagueId/rounds/:roundId/lineup returns 200 on success", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "POST",
      url: "/api/fantasy/leagues/l1/rounds/r1/lineup",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        captainPlayerId: "p1",
        slots: [{ slotRole: "ATA", playerId: "p1" }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.lineupId).toBe("lineup-1");
  });

  it("GET /api/fantasy/leagues/:leagueId/rounds/:roundId/revealed-lineups returns 200", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/api/fantasy/leagues/l1/rounds/r1/revealed-lineups",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.allowed).toBe(true);
  });
});
