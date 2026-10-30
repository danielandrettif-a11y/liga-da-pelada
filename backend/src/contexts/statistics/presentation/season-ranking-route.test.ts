import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { registerSeasonRankingRoutes } from "./season-ranking-route.js";
import type { SeasonRankingRepository } from "../application/manage-season-ranking.js";

function buildApp(repoOverrides: Partial<SeasonRankingRepository> = {}) {
  const app = Fastify();
  const verifier: UserVerifier = {
    verifyAccessToken: vi.fn().mockImplementation(async (token: string) => {
      if (token === "valid-token") return { userId: "user-test" };
      return null;
    }),
  };

  const defaultRepo: SeasonRankingRepository = {
    findActiveSeason: vi.fn().mockResolvedValue({ id: "s1", number: 1, status: "active", startedAt: "2026-01-01" }),
    findVisibleSeasons: vi.fn().mockResolvedValue([]),
    findFinishedOfficialRounds: vi.fn().mockResolvedValue([]),
    findPlayerRoundStats: vi.fn().mockResolvedValue([]),
    findEnrichmentData: vi.fn().mockResolvedValue({
      fitnessRows: [],
      cosmeticsByPlayer: new Map(),
      overallByPlayer: new Map(),
      speedByPlayer: new Map(),
      achievementBeltsByPlayer: new Map(),
    }),
    findLeaguePlayer: vi.fn().mockResolvedValue(null),
    findPlayerCosmetics: vi.fn().mockResolvedValue(null),
    findActiveLeaguePlayerIds: vi.fn(async (_actor, _leagueId, ids) => ids),
    ...repoOverrides,
  };

  registerSeasonRankingRoutes(app, {
    verifier,
    repository: defaultRepo,
  });

  return app;
}

describe("SeasonRanking Routes", () => {
  it("rejects unauthorized requests with 401", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/league-1/ranking",
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/statistics/leagues/:leagueId/ranking returns general ranking array", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/league-1/ranking",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("GET /api/statistics/leagues/:leagueId/ranking/experience returns full experience object", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/league-1/ranking/experience?includeEnrichment=true",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.seasonLabel).toBeDefined();
    expect(Array.isArray(body.general)).toBe(true);
  });

  it("GET /api/statistics/leagues/:leagueId/ranking/players/:playerId returns entry or 404", async () => {
    const app = buildApp({
      findLeaguePlayer: vi.fn().mockImplementation(async (_, __, id) => {
        if (id === "p1") return { id: "p1", name: "Player 1" };
        return null;
      }),
    });

    const resOk = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/league-1/ranking/players/p1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(resOk.statusCode).toBe(200);
    expect(resOk.json().entry.player.id).toBe("p1");

    const res404 = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/league-1/ranking/players/p-missing",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res404.statusCode).toBe(404);
  });

  it("POST /api/statistics/leagues/:leagueId/ranking/enrichment returns enrichment record", async () => {
    const p1 = "11111111-1111-1111-1111-111111111111";
    const app = buildApp({
      findEnrichmentData: vi.fn().mockResolvedValue({
        fitnessRows: [],
        cosmeticsByPlayer: new Map(),
        overallByPlayer: new Map([[p1, { overall: 80, trend: "steady" }]]),
        speedByPlayer: new Map(),
        achievementBeltsByPlayer: new Map(),
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/statistics/leagues/league-1/ranking/enrichment",
      headers: { authorization: "Bearer valid-token" },
      payload: { playerIds: [p1] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body[p1]).toBeDefined();
    expect(body[p1].overall).toBe(80);
  });
});
