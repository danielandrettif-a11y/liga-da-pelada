import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), identityApi: vi.fn(), list: vi.fn(), setRole: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("@/modules/identity/infrastructure/identity-api-session", () => ({ identityApiFor: mocks.identityApi }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { getManagedAccounts, setAccountAdminRole } from "./admins";
import { IdentityApiError } from "@/modules/identity/infrastructure/http-identity-gateway";

const userId = "00000000-0000-4000-8000-000000000001";

describe("admin account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account.mockResolvedValue({
      isAdmin: true,
      user: { id: "admin" },
      client: { auth: { getSession: vi.fn() }, rpc: vi.fn() },
    });
    mocks.identityApi.mockResolvedValue({
      listManagedAccounts: mocks.list,
      setAccountAdminRole: mocks.setRole,
    });
    mocks.list.mockResolvedValue([{ userId, role: "player", createdAt: "2026-01-01", player: null }]);
    mocks.setRole.mockResolvedValue("admin");
  });

  it("uses the identity API for listing and changing roles", async () => {
    await expect(getManagedAccounts()).resolves.toEqual([
      { userId, role: "player", createdAt: "2026-01-01", player: null },
    ]);
    await expect(setAccountAdminRole(userId, true)).resolves.toEqual({ success: true, role: "admin" });
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.setRole).toHaveBeenCalledWith(userId, true);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/administradores");
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects non-admin callers before resolving the API", async () => {
    mocks.account.mockResolvedValue({ isAdmin: false, user: { id: "player" }, client: {} });
    await expect(getManagedAccounts()).resolves.toEqual([]);
    await expect(setAccountAdminRole(userId, true)).resolves.toEqual({
      success: false, error: "Somente administradores podem alterar acessos.",
    });
    expect(mocks.identityApi).not.toHaveBeenCalled();
  });

  it("returns a controlled error when the API rejects the mutation", async () => {
    mocks.setRole.mockRejectedValue(new IdentityApiError("Não é possível remover o último administrador.", 409));
    await expect(setAccountAdminRole(userId, false)).resolves.toEqual({
      success: false, error: "Não é possível remover o último administrador.",
    });
  });
});
