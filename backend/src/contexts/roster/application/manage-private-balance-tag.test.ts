import { describe, expect, it, vi } from "vitest";
import {
  getPrivateBalanceTag,
  setPrivateBalanceTag,
  type PrivateBalanceTagRepository,
} from "./manage-private-balance-tag.js";

const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("manage private balance tag", () => {
  it("reads and writes only normalized domain values", async () => {
    const repository: PrivateBalanceTagRepository = {
      get: vi.fn().mockResolvedValue({ allowed: true, tag: "bagre_1" }),
      set: vi.fn().mockResolvedValue(undefined),
    };
    await expect(getPrivateBalanceTag(playerId, actor, repository)).resolves.toEqual({ allowed: true, tag: "bagre_1" });
    await setPrivateBalanceTag(playerId, "craque_1", actor, repository);
    expect(repository.set).toHaveBeenCalledWith(playerId, "craque_1", actor);
  });

  it("rejects invalid input before persistence", async () => {
    const repository: PrivateBalanceTagRepository = { get: vi.fn(), set: vi.fn() };
    await expect(setPrivateBalanceTag(playerId, "elite", actor, repository)).rejects.toThrow("inválida");
    expect(repository.set).not.toHaveBeenCalled();
  });
});
