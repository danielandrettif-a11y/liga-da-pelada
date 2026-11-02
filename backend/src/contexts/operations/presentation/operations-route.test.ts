import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerOperationsRoutes } from "./operations-route.js";
import type { OperationsRepository } from "../application/manage-operations.js";

describe("Operations Routes", () => {
  const verifier = {
    verifyAccessToken: vi.fn().mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111" }),
  };
  const createMockRepo = (): OperationsRepository => ({
    getPerformanceSummary: vi.fn().mockResolvedValue([
      { kind: "api", name: "test", path: "/test", samples: 1, p50_ms: 10, p95_ms: 20, max_ms: 30, poor_or_failed: 0 },
    ]),
    recordServerEvent: vi.fn().mockResolvedValue({ success: true }),
  });

  it("GET /api/operations/performance-summary returns 200 with summary", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerOperationsRoutes(app, { repository: repo, userVerifier: verifier, internalToken: "internal-secret" });

    const res = await app.inject({
      method: "GET",
      url: "/api/operations/performance-summary?hours=12",
      headers: { authorization: "Bearer user-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(repo.getPerformanceSummary).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "11111111-1111-4111-8111-111111111111" }),
      12,
    );
  });

  it("POST /api/internal/operations/observability records event", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerOperationsRoutes(app, { repository: repo, userVerifier: verifier, internalToken: "internal-secret" });

    const res = await app.inject({
      method: "POST",
      url: "/api/internal/operations/observability",
      headers: { authorization: "Bearer internal-secret" },
      payload: { kind: "web_vital", name: "LCP", value: 100 },
    });

    expect(res.statusCode).toBe(204);
    expect(repo.recordServerEvent).toHaveBeenCalled();
  });

  it("rejects requests without the required credentials", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerOperationsRoutes(app, { repository: repo, userVerifier: verifier, internalToken: "internal-secret" });

    const summary = await app.inject({ method: "GET", url: "/api/operations/performance-summary" });
    expect(summary.statusCode).toBe(401);

    const ingestion = await app.inject({
      method: "POST",
      url: "/api/internal/operations/observability",
      payload: { kind: "web_vital", name: "LCP", value: 100 },
    });
    expect(ingestion.statusCode).toBe(401);
    expect(repo.recordServerEvent).not.toHaveBeenCalled();
  });
});
