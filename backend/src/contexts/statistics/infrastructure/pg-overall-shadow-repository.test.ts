import { describe, expect, it, vi } from "vitest";
import { PgOverallShadowRepository } from "./pg-overall-shadow-repository";
import type { DatabaseConnection } from "../../../shared/infrastructure/database/database-connection";

describe("Statistics Infrastructure: PgOverallShadowRepository", () => {
  it("fetches formula by key", async () => {
    const mockDb: DatabaseConnection = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: "f-1", label: "v20", config: {} }],
      }),
      transaction: vi.fn(),
    };
    const repo = new PgOverallShadowRepository(mockDb);
    const result = await repo.getFormula("adaptive-v20-statistical-confidence");
    expect(result?.id).toBe("f-1");
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id, label, config FROM overall_formula_versions"),
      ["adaptive-v20-statistical-confidence"],
    );
  });

  it("creates a new run record", async () => {
    const mockDb: DatabaseConnection = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "run-abc" }] }),
      transaction: vi.fn(),
    };
    const repo = new PgOverallShadowRepository(mockDb);
    const runId = await repo.createRun({
      leagueId: "l1",
      formulaVersionId: "f1",
      sourceThroughRoundId: "r1",
      createdBy: "u1",
    });
    expect(runId).toBe("run-abc");
  });

  it("marks run as succeeded", async () => {
    const mockDb: DatabaseConnection = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      transaction: vi.fn(),
    };
    const repo = new PgOverallShadowRepository(mockDb);
    await repo.markRunSucceeded("run-1", "l1");
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE overall_calculation_runs"),
      ["run-1", "l1"],
    );
  });
});

