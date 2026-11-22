import fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerOverallShadowRoutes } from "./overall-shadow-route.js";
import type { OverallShadowRepository } from "../application/manage-overall-shadow.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import type { Actor } from "../../../shared/actor.js";

describe("Statistics Presentation: overall-shadow-route", () => {
  function buildApp(repoOverrides: Partial<OverallShadowRepository> = {}, isAdmin = true) {
    const app = fastify();
    const verifier: UserVerifier = {
      verifyAccessToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === "valid-token") {
          return {
            userId: isAdmin ? "admin-1" : "player-1",
            email: "user@example.com",
          } satisfies Actor;
        }
        return null;
      }),
    };
    const repository: OverallShadowRepository = {
      checkIsAdmin: vi.fn(async (actor: Actor) => actor.userId === "admin-1"),
      getFormula: vi.fn().mockResolvedValue({ id: "formula-v20", label: "v20", config: {} }),
      loadHistory: vi.fn().mockResolvedValue({
        players: [{ id: "p1", name: "Craque", overallTraits: ["artilheiro"], isGoalkeeper: false }],
        pendingPlayers: [],
        rounds: [{ id: "r1", roundType: "official", status: "finished" }],
        zeroPointOverrides: [],
      }),
      getLatestRun: vi.fn().mockResolvedValue({
        id: "run-1",
        status: "succeeded",
        created_at: "2026-10-30T00:00:00Z",
        completed_at: "2026-10-30T00:05:00Z",
        error_message: null,
        formula_version_id: "formula-v20",
      }),
      getRunById: vi.fn().mockResolvedValue({
        id: "run-1",
        status: "succeeded",
        formula_version_id: "formula-v20",
      }),
      getSnapshots: vi.fn().mockResolvedValue([]),
      getBreakdowns: vi.fn().mockResolvedValue([]),
      createRun: vi.fn().mockResolvedValue("run-new"),
      saveCalculatedData: vi.fn().mockResolvedValue(undefined),
      markRunSucceeded: vi.fn().mockResolvedValue(undefined),
      markRunFailed: vi.fn().mockResolvedValue(undefined),
      markRunPublished: vi.fn().mockResolvedValue(undefined),
      ...repoOverrides,
    };
    registerOverallShadowRoutes(app, { verifier, repository });
    return app;
  }

  it("returns 401 when Authorization is missing", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/l1/overall/shadow",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns null data when user is not admin", async () => {
    const app = buildApp({}, false);
    const response = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/l1/overall/shadow",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeNull();
  });

  it("returns shadow data for admin", async () => {
    const app = buildApp({}, true);
    const response = await app.inject({
      method: "GET",
      url: "/api/statistics/leagues/l1/overall/shadow",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.latestRun.id).toBe("run-1");
  });

  it("recalculates shadow run", async () => {
    const app = buildApp({}, true);
    const response = await app.inject({
      method: "POST",
      url: "/api/statistics/leagues/l1/overall/shadow/recalculate",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.runId).toBe("run-new");
  });

  it("publishes shadow run", async () => {
    const app = buildApp({}, true);
    const response = await app.inject({
      method: "POST",
      url: "/api/statistics/leagues/l1/overall/shadow/publish",
      headers: { authorization: "Bearer valid-token" },
      payload: { runId: "run-1" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });
});
