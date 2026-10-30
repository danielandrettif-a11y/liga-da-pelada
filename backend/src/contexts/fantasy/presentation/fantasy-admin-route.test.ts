import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { registerFantasyAdminRoutes } from "./fantasy-admin-route.js";
import type { FantasyAdminRepository } from "../application/manage-fantasy-admin.js";

describe("Presentation: FantasyAdminRoute", () => {
  const verifier: UserVerifier = {
    verifyAccessToken: vi.fn().mockResolvedValue({ userId: "u1", email: "u1@test.com" }),
  };

  const createMockRepo = (overrides: Partial<FantasyAdminRepository> = {}): FantasyAdminRepository => ({
    isLeagueAdmin: vi.fn().mockResolvedValue(true),
    getRankingRawEntries: vi.fn().mockResolvedValue([
      { userId: "u1", userName: "Alice", userAvatarUrl: null, totalPoints: 100, patrimony: 100, lastRoundPoints: 10, lineupsCount: 2 },
    ]),
    getUserHistory: vi.fn().mockResolvedValue([]),
    getUserRoundHistory: vi.fn().mockResolvedValue({
      userId: "u1",
      roundId: "r1",
      roundNumber: 1,
      score: 45,
      captainPlayerId: "p1",
      captainMultiplier: 1.5,
      slots: [],
    }),
    getSeasonPassDashboard: vi.fn().mockResolvedValue({
      authenticated: true,
      available: true,
      progress: 50,
      maxProgress: 100,
      currentLevel: 2,
      rewards: [],
    }),
    getAdminData: vi.fn().mockResolvedValue({
      initialBudget: 100,
      marketOpenDelayMinutes: 0,
      isTestSessionActive: false,
      testSessionRoundId: null,
    }),
    updateSettings: vi.fn().mockResolvedValue({ success: true }),
    reprocessRound: vi.fn().mockResolvedValue({ success: true, reprocessedLineupsCount: 8 }),
    createTestSession: vi.fn().mockResolvedValue({ success: true }),
    processTestSession: vi.fn().mockResolvedValue({ success: true }),
    resetTestSession: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  });

  const buildApp = async (repo: FantasyAdminRepository) => {
    const app = Fastify();
    registerFantasyAdminRoutes(app, { verifier, repository: repo });
    return app;
  };

  it("GET /api/fantasy/leagues/:leagueId/ranking returns 200 with sorted ranking", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/api/fantasy/leagues/l1/ranking",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.length).toBe(1);
    expect(body[0].rank).toBe(1);
  });

  it("GET /api/fantasy/leagues/:leagueId/season-pass returns 200 with pass dashboard", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/api/fantasy/leagues/l1/season-pass",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.authenticated).toBe(true);
    expect(body.currentLevel).toBe(2);
  });

  it("POST /api/fantasy/leagues/:leagueId/rounds/:roundId/reprocess returns 200 for admin", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "POST",
      url: "/api/fantasy/leagues/l1/rounds/r1/reprocess",
      headers: { authorization: "Bearer valid-token" },
      payload: { useCurrentRules: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.reprocessedLineupsCount).toBe(8);
  });
});
