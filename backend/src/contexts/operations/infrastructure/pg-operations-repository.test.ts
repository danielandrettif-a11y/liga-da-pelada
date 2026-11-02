import { describe, it, expect, vi } from "vitest";
import { PgOperationsRepository } from "./pg-operations-repository.js";
import type { PoolClient } from "pg";

describe("PgOperationsRepository", () => {
  const actor = { userId: "11111111-1111-4111-8111-111111111111" };
  it("queries performance summary via rpc", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => sql.includes("get_app_performance_summary")
      ? { rows: [{ summary: [
        { kind: "api", name: "get_matches", path: "/matches", samples: "10", p50_ms: "12.5", p95_ms: "45.0", max_ms: "100.0", poor_or_failed: "0" },
      ] }] }
      : { rows: [] });
    const mockPool: any = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() } as unknown as PoolClient),
    };

    const repo = new PgOperationsRepository(mockPool);
    const rows = await repo.getPerformanceSummary(actor, 24);

    expect(rows).toHaveLength(1);
    expect(rows[0].samples).toBe(10);
    expect(rows[0].p50_ms).toBe(12.5);
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("records server event successfully", async () => {
    const mockPool: any = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    };

    const repo = new PgOperationsRepository(mockPool);
    const res = await repo.recordServerEvent({
      kind: "web_vital",
      name: "LCP",
      value: 1200,
      rating: "good",
    });

    expect(res.success).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("public.app_performance_events"),
      expect.any(Array),
    );
  });

  it("propagates persistence errors instead of returning a false success", async () => {
    const repo = new PgOperationsRepository({
      query: vi.fn().mockRejectedValue(new Error("db unavailable")),
    } as any);
    await expect(repo.recordServerEvent({ kind: "client_error", name: "render" }))
      .rejects.toThrow("db unavailable");
  });
});
