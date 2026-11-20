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
    getMarketSource: vi.fn().mockResolvedValue(null),
    getMarketContext: vi.fn().mockResolvedValue(null),
    getPersonalMarketInputs: vi.fn().mockResolvedValue(null),
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
    getLiveMatchSnapshots: vi.fn().mockResolvedValue([]),
    getLiveProjectionInputs: vi.fn().mockResolvedValue(null),
    getRevealedInputs: vi.fn().mockResolvedValue(null),
    getRevealedLineups: vi.fn().mockResolvedValue({ allowed: true, lineups: [] }),
    getRoundLineupOverview: vi.fn().mockResolvedValue({
      roundId: "r1",
      isRoundOpen: true,
      confirmedCount: 2,
      revealedLineupsCount: 0,
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
        playerIds: ["p1"],
        slotAssignments: [{ slotRole: "ATA", slotIndex: 0, playerId: "p1" }],
        captainId: "p1", scorerId: "p1", assistId: null, challengeId: null,
        reservePlayerId: null, reserveRole: null,
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

  it("passes the authenticated identity to live snapshots and rejects inaccessible rounds", async () => {
    const repo = createMockRepo({ getLiveMatchSnapshots: vi.fn().mockResolvedValueOnce([{ id: "m1", match_events: [] }]).mockResolvedValueOnce(null) });
    const app = await buildApp(repo);
    const url = "/api/fantasy/leagues/l1/rounds/r1/match-snapshots";
    const allowed = await app.inject({ method: "GET", url, headers: { authorization: "Bearer valid-token" } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual([{ id: "m1", match_events: [] }]);
    expect(repo.getLiveMatchSnapshots).toHaveBeenCalledWith("l1", "r1", "u1");
    const denied = await app.inject({ method: "GET", url, headers: { authorization: "Bearer valid-token" } });
    expect(denied.statusCode).toBe(403);
  });

  it("does not expose projection inputs when the repository rejects the round", async () => {
    const repo = createMockRepo({ getLiveProjectionInputs: vi.fn().mockResolvedValue(null) });
    const app = await buildApp(repo);
    const response = await app.inject({ method: "GET", url: "/api/fantasy/leagues/l1/rounds/r1/projection-inputs", headers: { authorization: "Bearer valid-token" } });
    expect(response.statusCode).toBe(403);
    expect(repo.getLiveProjectionInputs).toHaveBeenCalledWith("l1", "r1", "u1");
  });

  it("returns market data only when the actor can access the league", async () => {
    const source = { prices: [], stats: [], players: [], history: [] };
    const repo = createMockRepo({ getMarketSource: vi.fn().mockResolvedValueOnce(source).mockResolvedValueOnce(null) });
    const app = await buildApp(repo);
    const request = { method: "GET" as const, url: "/api/fantasy/leagues/l1/market-source", headers: { authorization: "Bearer valid-token" } };
    const allowed = await app.inject(request);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual(source);
    expect(repo.getMarketSource).toHaveBeenCalledWith("l1", "u1");
    expect((await app.inject(request)).statusCode).toBe(403);
  });

  it("returns the market context only to an authorized member", async () => {
    const context = { seasonId: "s1", settings: {}, testSession: null, fantasySeason: { id: "fs1" }, fantasyRounds: [], marketHealth: null, marketVersion: null };
    const repo = createMockRepo({ getMarketContext: vi.fn().mockResolvedValueOnce(context).mockResolvedValueOnce(null) });
    const app = await buildApp(repo);
    const request = { method: "GET" as const, url: "/api/fantasy/leagues/l1/market-context", headers: { authorization: "Bearer valid-token" } };
    const allowed = await app.inject(request);
    expect(allowed.json()).toEqual(context);
    expect(repo.getMarketContext).toHaveBeenCalledWith("l1", "u1");
    expect((await app.inject(request)).statusCode).toBe(403);
  });

  it("uses the authenticated actor and requested rounds for personal market data", async () => {
    const data = { seasonId: "fs1", lineup: null, latestLineup: null, portfolio: null, account: null, latestCardActivation: null };
    const repo = createMockRepo({ getPersonalMarketInputs: vi.fn().mockResolvedValueOnce(data).mockResolvedValueOnce(null) });
    const app = await buildApp(repo);
    const request = { method: "GET" as const, url: "/api/fantasy/leagues/l1/personal-market-inputs?activeRoundId=fr1&latestRoundId=fr2", headers: { authorization: "Bearer valid-token" } };
    expect((await app.inject(request)).json()).toEqual(data);
    expect(repo.getPersonalMarketInputs).toHaveBeenCalledWith("l1", "u1", "fr1", "fr2", undefined);
    expect((await app.inject(request)).statusCode).toBe(403);
  });

  it("passes the selected test session with the authenticated actor", async () => {
    const repo = createMockRepo({ getPersonalMarketInputs: vi.fn().mockResolvedValue({ seasonId: "fs1", lineup: null }) });
    const app = await buildApp(repo);
    const result = await app.inject({ method: "GET", url: "/api/fantasy/leagues/l1/personal-market-inputs?testSessionId=ts1", headers: { authorization: "Bearer valid-token" } });
    expect(result.statusCode).toBe(200);
    expect(repo.getPersonalMarketInputs).toHaveBeenCalledWith("l1", "u1", undefined, undefined, "ts1");
  });

  it("rejects revealed inputs for a closed-market check that fails", async () => {
    const repo = createMockRepo({ getRevealedInputs: vi.fn().mockResolvedValue(null) });
    const app = await buildApp(repo);
    const response = await app.inject({ method: "GET", url: "/api/fantasy/leagues/l1/rounds/r1/revealed-inputs", headers: { authorization: "Bearer valid-token" } });
    expect(response.statusCode).toBe(403);
    expect(repo.getRevealedInputs).toHaveBeenCalledWith("l1", "r1", "u1");
  });
});
