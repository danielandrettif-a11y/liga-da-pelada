import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { PgOverallShadowRepository } from "./pg-overall-shadow-repository.js";

function authenticatedPool(operation: (sql: string) => { rows: any[]; rowCount?: number }) {
  const query = vi.fn().mockImplementation(async (sql: string) => operation(sql));
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  return { pool: { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool, query };
}

describe("Statistics Infrastructure: PgOverallShadowRepository", () => {
  it("fetches formula by key", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "f-1", label: "v20", config: {} }] });
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() } as unknown as PoolClient),
    } as unknown as Pool;
    const repo = new PgOverallShadowRepository(pool);
    const result = await repo.getFormula({ userId: "u1" }, "adaptive-v20-statistical-confidence");
    expect(result?.id).toBe("f-1");
  });

  it("creates a new run inside the authenticated transaction", async () => {
    const { pool, query } = authenticatedPool((sql) => sql.includes("INSERT INTO public.overall_calculation_runs")
      ? { rows: [{ id: "run-abc" }], rowCount: 1 }
      : { rows: [], rowCount: 0 });
    const repo = new PgOverallShadowRepository(pool);
    const runId = await repo.createRun({ leagueId: "l1", formulaVersionId: "f1", sourceThroughRoundId: "r1", createdBy: "u1" });
    expect(runId).toBe("run-abc");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO public.overall_calculation_runs"), ["l1", "f1", "r1", "u1"]);
  });

  it("marks run as succeeded only when a scoped row is updated", async () => {
    const { pool, query } = authenticatedPool((sql) => sql.includes("UPDATE public.overall_calculation_runs")
      ? { rows: [], rowCount: 1 }
      : { rows: [], rowCount: 0 });
    const repo = new PgOverallShadowRepository(pool);
    await repo.markRunSucceeded("run-1", "l1", "u1");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE public.overall_calculation_runs"), ["run-1", "l1"]);
  });
});
