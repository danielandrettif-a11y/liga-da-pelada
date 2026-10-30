import { describe, it, expect, vi } from "vitest";
import { PgOperationsRepository } from "./pg-operations-repository.js";

describe("PgOperationsRepository", () => {
  it("queries performance summary via rpc", async () => {
    const mockPool: any = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { kind: "api", name: "get_matches", path: "/matches", samples: "10", p50_ms: "12.5", p95_ms: "45.0", max_ms: "100.0", poor_or_failed: "0" },
        ],
      }),
    };

    const repo = new PgOperationsRepository(mockPool);
    const rows = await repo.getPerformanceSummary(24);

    expect(rows).toHaveLength(1);
    expect(rows[0].samples).toBe(10);
    expect(rows[0].p50_ms).toBe(12.5);
    expect(mockPool.query).toHaveBeenCalled();
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
    expect(mockPool.query).toHaveBeenCalled();
  });
});
