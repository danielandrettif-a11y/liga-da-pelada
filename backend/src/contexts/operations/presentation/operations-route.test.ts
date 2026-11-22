import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerOperationsRoutes } from "./operations-route.js";
import type { OperationsRepository } from "../application/manage-operations.js";

describe("Operations Routes", () => {
  const createMockRepo = (): OperationsRepository => ({
    getPerformanceSummary: vi.fn().mockResolvedValue([
      { kind: "api", name: "test", path: "/test", samples: 1, p50_ms: 10, p95_ms: 20, max_ms: 30, poor_or_failed: 0 },
    ]),
    recordServerEvent: vi.fn().mockResolvedValue({ success: true }),
  });

  it("GET /api/operations/performance-summary returns 200 with summary", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerOperationsRoutes(app, { repository: repo });

    const res = await app.inject({
      method: "GET",
      url: "/api/operations/performance-summary?hours=12",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(repo.getPerformanceSummary).toHaveBeenCalledWith(12);
  });

  it("POST /api/internal/operations/observability records event", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerOperationsRoutes(app, { repository: repo });

    const res = await app.inject({
      method: "POST",
      url: "/api/internal/operations/observability",
      payload: { kind: "web_vital", name: "LCP", value: 100 },
    });

    expect(res.statusCode).toBe(204);
    expect(repo.recordServerEvent).toHaveBeenCalled();
  });
});
