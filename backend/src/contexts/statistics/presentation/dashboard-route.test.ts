import fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerDashboardRoutes } from "./dashboard-route";
import type { DashboardRepository } from "../application/manage-dashboard";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";

describe("Statistics Presentation: dashboard-route", () => {
  function buildApp(repoOverrides: Partial<DashboardRepository> = {}) {
    const app = fastify();
    const verifier: UserVerifier = {
      verifyAccessToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === "valid-token") return { id: "user-1", email: "user@example.com", role: "admin" } as any;
        return null;
      }),
    };
    const repository: DashboardRepository = {
      getActiveSeasonId: vi.fn().mockResolvedValue("season-1"),
      getDashboardData: vi.fn().mockResolvedValue({
        league: { matchDuration: 10, stadiumName: "Campão" },
        nextRound: { id: "r1", number: 1, date: "2026-11-01" },
      }),
      ...repoOverrides,
    };
    registerDashboardRoutes(app, { verifier, repository });
    return app;
  }

  it("returns 401 when Authorization header is missing", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/l1/dashboard",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns dashboard data when authorized", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/l1/dashboard",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.matchDuration).toBe(10);
    expect(body.data.venue.name).toBe("Campão");
  });
});
