import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import type { RoundStatisticsRepository } from "../application/manage-round-statistics.js";
import { registerRoundStatisticsRoutes } from "./round-statistics-route.js";

const leagueId = "22222222-2222-4222-8222-222222222222";
const roundId = "33333333-3333-4333-8333-333333333333";

function fixture(overrides: Partial<RoundStatisticsRepository> = {}) {
  const app = Fastify();
  const verifier: UserVerifier = { verifyAccessToken: vi.fn(async (token) => token === "valid" ? { userId: "user-1" } : null) };
  const repository: RoundStatisticsRepository = {
    recalculateRoundStats: vi.fn(async () => undefined),
    findRoundStatistics: vi.fn(async () => ({
      roundId, roundType: "official", entries: [],
      highlights: { scorers: [], assisters: [], topPoints: [], goalkeepers: [] },
    })),
    findFriendlyStats: vi.fn(async () => []),
    ...overrides,
  };
  registerRoundStatisticsRoutes(app, { verifier, repository });
  return { app, repository };
}

describe("round statistics routes", () => {
  it("requires authentication", async () => {
    const { app } = fixture();
    const response = await app.inject({ method: "GET", url: `/api/statistics/leagues/${leagueId}/friendlies` });
    expect(response.statusCode).toBe(401);
  });

  it("recalculates a round and derives the actor from the bearer token", async () => {
    const { app, repository } = fixture();
    const response = await app.inject({
      method: "POST",
      url: `/api/statistics/leagues/${leagueId}/rounds/${roundId}/recalculate`,
      headers: { authorization: "Bearer valid" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(repository.recalculateRoundStats).toHaveBeenCalledWith({ userId: "user-1" }, leagueId, roundId);
  });

  it("returns round and friendly read models", async () => {
    const friendly = [{ player: { id: "p1", name: "A" }, rounds: 1, games: 2, wins: 1, draws: 0, losses: 1, goals: 1, assists: 0, bestGoalkeeper: 0 }];
    const { app } = fixture({ findFriendlyStats: vi.fn(async () => friendly) });
    const round = await app.inject({
      method: "GET", url: `/api/statistics/leagues/${leagueId}/rounds/${roundId}`,
      headers: { authorization: "Bearer valid" },
    });
    const friendlies = await app.inject({
      method: "GET", url: `/api/statistics/leagues/${leagueId}/friendlies`,
      headers: { authorization: "Bearer valid" },
    });
    expect(round.statusCode).toBe(200);
    expect(friendlies.json()).toEqual(friendly);
  });

  it("returns 400 for malformed UUIDs", async () => {
    const { app } = fixture();
    const response = await app.inject({
      method: "POST", url: `/api/statistics/leagues/bad/rounds/${roundId}/recalculate`,
      headers: { authorization: "Bearer valid" },
    });
    expect(response.statusCode).toBe(400);
  });
});
