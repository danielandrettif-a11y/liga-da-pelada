import { describe, it, expect, vi } from "vitest";
import { ManageManagerUseCase, type ManagerRepository } from "./manage-manager.js";
import type { Actor } from "../../../shared/actor.js";

describe("ManageManagerUseCase", () => {
  const actor: Actor = { userId: "user-1", email: "user1@test.com", name: "User 1" };

  const createMockRepo = (): ManagerRepository => ({
    createClub: vi.fn().mockResolvedValue({ ok: true, message: "Clube criado!" }),
    runCommand: vi.fn().mockResolvedValue({ ok: true, message: "Comando executado!" }),
  });

  it("validates identity before delegating createClub", async () => {
    const repo = createMockRepo();
    const useCase = new ManageManagerUseCase(repo);

    const invalidRes = await useCase.createClub(actor, { name: "", abbreviation: "AB", color: "#fff" });
    expect(invalidRes.ok).toBe(false);
    expect(repo.createClub).not.toHaveBeenCalled();

    const validRes = await useCase.createClub(actor, { name: "Clube", abbreviation: "CLB", color: "#fff" });
    expect(validRes.ok).toBe(true);
    expect(repo.createClub).toHaveBeenCalled();
  });

  it("validates command before delegating runCommand", async () => {
    const repo = createMockRepo();
    const useCase = new ManageManagerUseCase(repo);

    const invalidRes = await useCase.runCommand(actor, null as any, 1);
    expect(invalidRes.ok).toBe(false);
    expect(repo.runCommand).not.toHaveBeenCalled();

    const validRes = await useCase.runCommand(actor, { type: "open-pack", packId: "p1" }, 1);
    expect(validRes.ok).toBe(true);
    expect(repo.runCommand).toHaveBeenCalled();
  });
});
