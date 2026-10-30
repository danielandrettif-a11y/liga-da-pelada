import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { registerSeasonOperationsRoutes } from "./season-operations-route.js";

const leagueId = "22222222-2222-4222-8222-222222222222";
const verifier: UserVerifier = { verifyAccessToken: vi.fn(async (token) => token === "valid" ? { userId: "11111111-1111-4111-8111-111111111111" } : null) };

function app(repository: any) {
  const server = Fastify();
  registerSeasonOperationsRoutes(server, { verifier, repository });
  return server;
}

const repository = () => ({
  findPlayerCardOveralls: vi.fn().mockResolvedValue({ p1: { overall: 80 } }),
  findTeamStandings: vi.fn().mockResolvedValue([{ name: "MilamB" }]),
  previewReprocess: vi.fn().mockResolvedValue({ can_reprocess: true }),
  executeReprocess: vi.fn().mockResolvedValue({ success: true }),
});

describe("season operations routes", () => {
  it.each([
    ["GET", `/api/statistics/leagues/${leagueId}/player-card-overalls`, "findPlayerCardOveralls"],
    ["GET", `/api/statistics/leagues/${leagueId}/team-standings`, "findTeamStandings"],
    ["GET", `/api/statistics/leagues/${leagueId}/reprocess/preview`, "previewReprocess"],
    ["POST", `/api/statistics/leagues/${leagueId}/reprocess`, "executeReprocess"],
  ])("exposes %s %s", async (method, url, called) => {
    const repo = repository();
    const server = app(repo);
    const response = await server.inject({ method, url, headers: { authorization: "Bearer valid" } });
    expect(response.statusCode).toBe(200);
    expect((repo as any)[called]).toHaveBeenCalledWith(expect.objectContaining({ userId: expect.any(String) }), leagueId);
    await server.close();
  });

  it("rejects unauthenticated calls", async () => {
    const server = app(repository());
    const response = await server.inject({ method: "GET", url: `/api/statistics/leagues/${leagueId}/team-standings` });
    expect(response.statusCode).toBe(401);
    await server.close();
  });
});
