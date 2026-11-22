import { describe, expect, it, vi } from "vitest";
import { listManagedAccounts, setManagedAccountRole, type AccountAccessRepository } from "./manage-account-access.js";

const actor = { userId: "verified-user" };

describe("manage account access", () => {
  it("lists and changes roles using only the verified actor", async () => {
    const repository: AccountAccessRepository = {
      list: vi.fn().mockResolvedValue([]),
      setRole: vi.fn().mockResolvedValue("admin"),
    };
    await expect(listManagedAccounts(actor, repository)).resolves.toEqual([]);
    await expect(setManagedAccountRole(
      "00000000-0000-4000-8000-000000000001", true, actor, repository,
    )).resolves.toBe("admin");
    expect(repository.setRole).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001", "admin", actor,
    );
  });

  it("rejects malformed ids before persistence", async () => {
    const repository: AccountAccessRepository = { list: vi.fn(), setRole: vi.fn() };
    expect(() => setManagedAccountRole("not-a-uuid", false, actor, repository)).toThrow("Escolha uma conta");
    expect(repository.setRole).not.toHaveBeenCalled();
  });
});
