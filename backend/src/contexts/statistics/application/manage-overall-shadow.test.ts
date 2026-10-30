import { describe, expect, it, vi } from "vitest";
import {
  createManageOverallShadowService,
  type OverallShadowRepository,
} from "./manage-overall-shadow.js";
import type { Actor } from "../../../shared/actor.js";

describe("Statistics Application: manage-overall-shadow", () => {
  const adminActor: Actor = { userId: "u1" };
  const playerActor: Actor = { userId: "u2" };

  function createMockRepo(overrides: Partial<OverallShadowRepository> = {}): OverallShadowRepository {
    return {
      checkIsAdmin: vi.fn(async (actor: Actor) => actor.userId === "u1"),
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
      ...overrides,
    };
  }

  it("returns null if actor is not admin for getOverallShadowAdminData", async () => {
    const service = createManageOverallShadowService(createMockRepo());
    const result = await service.getOverallShadowAdminData(playerActor, "l1");
    expect(result).toBeNull();
  });

  it("returns shadow admin data for admin", async () => {
    const service = createManageOverallShadowService(createMockRepo());
    const result = await service.getOverallShadowAdminData(adminActor, "l1");
    expect(result).not.toBeNull();
    expect(result?.latestRun?.id).toBe("run-1");
  });

  it("fails recalculation if actor is not admin", async () => {
    const service = createManageOverallShadowService(createMockRepo());
    const result = await service.recalculateOverallShadow(playerActor, "l1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Somente administradores");
  });

  it("successfully recalculates overall shadow", async () => {
    const repo = createMockRepo();
    const service = createManageOverallShadowService(repo);
    const result = await service.recalculateOverallShadow(adminActor, "l1");
    expect(result.success).toBe(true);
    expect(result.runId).toBe("run-new");
    expect(repo.createRun).toHaveBeenCalled();
    expect(repo.markRunSucceeded).toHaveBeenCalledWith("run-new", "l1");
  });

  it("publishes shadow run when valid", async () => {
    const repo = createMockRepo();
    const service = createManageOverallShadowService(repo);
    const result = await service.publishOverallShadow(adminActor, "l1", "run-1");
    expect(result.success).toBe(true);
    expect(repo.markRunPublished).toHaveBeenCalledWith("run-1", "l1");
  });
});
