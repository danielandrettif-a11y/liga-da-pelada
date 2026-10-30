import { describe, it, expect, vi } from "vitest";
import { ManageOperationsUseCase, type OperationsRepository } from "./manage-operations.js";

describe("ManageOperationsUseCase", () => {
  const createMockRepo = (): OperationsRepository => ({
    getPerformanceSummary: vi.fn().mockResolvedValue([]),
    recordServerEvent: vi.fn().mockResolvedValue({ success: true }),
  });

  it("normalizes hours before querying performance summary", async () => {
    const repo = createMockRepo();
    const useCase = new ManageOperationsUseCase(repo);

    await useCase.getPerformanceSummary(0);
    expect(repo.getPerformanceSummary).toHaveBeenCalledWith(1);

    await useCase.getPerformanceSummary(1000);
    expect(repo.getPerformanceSummary).toHaveBeenCalledWith(720);

    await useCase.getPerformanceSummary(48);
    expect(repo.getPerformanceSummary).toHaveBeenCalledWith(48);
  });

  it("validates event before recording", async () => {
    const repo = createMockRepo();
    const useCase = new ManageOperationsUseCase(repo);

    const invalid = await useCase.recordServerEvent({ kind: "invalid" as any, name: "foo" });
    expect(invalid.success).toBe(false);
    expect(repo.recordServerEvent).not.toHaveBeenCalled();

    const valid = await useCase.recordServerEvent({ kind: "web_vital", name: "CLS", value: 0.05 });
    expect(valid.success).toBe(true);
    expect(repo.recordServerEvent).toHaveBeenCalled();
  });
});
