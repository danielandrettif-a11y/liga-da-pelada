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
    getRanking: vi.fn().mockResolvedValue([
      { user_id: "u1", total_points: 100, position: 1 },
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
      progress: 5,
      maxProgress: 40,
      mode: "athlete",
      participations: 2,
      activeWeeks: 1,
      validLineups: 2,
      shopCycleRemainder: 0,
      shopBonusPoints: 0,
      nextMilestone: 10,
      playerName: "Alice",
      playerAvatarUrl: null,
      events: [],
    }),
    getAdminData: vi.fn().mockResolvedValue({
      settings: { initial_budget: 100 }, rounds: [], testSession: null,
      friendlyRounds: [], marketStatus: null,
    }),
    updateSettings: vi.fn().mockResolvedValue({ success: true }),
    rebuildRoundStats: vi.fn().mockResolvedValue(undefined),
    reprocessRound: vi.fn().mockResolvedValue({ success: true, affectedRounds: 8 }),
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
    expect(body[0].position).toBe(1);
  });

  it("rejects round ranking without a round id", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/api/fantasy/leagues/l1/ranking?scope=round",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(400);
    expect(repo.getRanking).not.toHaveBeenCalled();
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
    expect(body.mode).toBe("athlete");
    expect(body.nextMilestone).toBe(10);
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
    expect(body.affectedRounds).toBe(8);
  });

  it("rejects an invalid reprocess option", async () => {
    const repo = createMockRepo();
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "POST",
      url: "/api/fantasy/leagues/l1/rounds/r1/reprocess",
      headers: { authorization: "Bearer valid-token" },
      payload: { useCurrentRules: "yes" },
    });

    expect(res.statusCode).toBe(400);
    expect(repo.reprocessRound).not.toHaveBeenCalled();
  });

  it("preserves expected business failures as action results", async () => {
    const repo = createMockRepo({ rebuildRoundStats: vi.fn().mockRejectedValue(new Error("falha")) });
    const app = await buildApp(repo);
    const res = await app.inject({
      method: "POST",
      url: "/api/fantasy/leagues/l1/rounds/r1/reprocess",
      headers: { authorization: "Bearer valid-token" },
      payload: { useCurrentRules: false },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({ success: false });
  });
});

