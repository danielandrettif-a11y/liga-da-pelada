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

    const invalidRes = await useCase.createClub(actor, "league-1", { name: "", abbreviation: "AB", color: "#ffffff", crest: "shield", kit: "solid" });
    expect(invalidRes.ok).toBe(false);
    expect(repo.createClub).not.toHaveBeenCalled();

    const validRes = await useCase.createClub(actor, "league-1", { name: " Clube  Teste ", abbreviation: "clb", color: "#ffffff", crest: "shield", kit: "solid" });
    expect(validRes.ok).toBe(true);
    expect(repo.createClub).toHaveBeenCalledWith(actor, "league-1", { name: "Clube Teste", abbreviation: "CLB", color: "#ffffff", crest: "shield", kit: "solid" });
  });

  it("validates command before delegating runCommand", async () => {
    const repo = createMockRepo();
    const useCase = new ManageManagerUseCase(repo);

    const invalidRes = await useCase.runCommand(actor, "league-1", null as any, 1);
    expect(invalidRes.ok).toBe(false);
    expect(repo.runCommand).not.toHaveBeenCalled();

    const validRes = await useCase.runCommand(actor, "league-1", { type: "open-pack", packId: "p1" }, 1);
    expect(validRes.ok).toBe(true);
    expect(repo.runCommand).toHaveBeenCalled();
  });
});
