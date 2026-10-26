import { describe, expect, it, vi } from "vitest";
import { httpIdentityGateway, IdentityApiError } from "./http-identity-gateway";

const userId = "00000000-0000-4000-8000-000000000001";

describe("httpIdentityGateway", () => {
  it("uses authenticated HTTP contracts for account access", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [{
        userId, role: "player", createdAt: "2026-01-01T00:00:00.000Z", player: null,
      }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ role: "admin" }), {
        status: 200, headers: { "content-type": "application/json" },
      }));
    const gateway = httpIdentityGateway("http://backend:3001/", "verified-token", fetcher as typeof fetch);
    await expect(gateway.listManagedAccounts()).resolves.toHaveLength(1);
    await expect(gateway.setAccountAdminRole(userId, true)).resolves.toBe("admin");

    const [listUrl, listOptions] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(listUrl.href).toBe("http://backend:3001/api/identity/accounts");
    expect(listOptions.headers).toMatchObject({ authorization: "Bearer verified-token" });
    const [roleUrl, roleOptions] = fetcher.mock.calls[1] as [URL, RequestInit];
    expect(roleUrl.href).toBe(`http://backend:3001/api/identity/accounts/${userId}/role`);
    expect(roleOptions.body).toBe(JSON.stringify({ admin: true }));
  });

  it("rejects missing sessions, invalid URLs and controlled API failures", async () => {
    expect(() => httpIdentityGateway("http://backend:3001", "")).toThrow("Sessão expirada");
    const invalid = httpIdentityGateway("file:///tmp/backend", "token");
    await expect(invalid.listManagedAccounts()).rejects.toBeInstanceOf(IdentityApiError);
    const failing = httpIdentityGateway("http://backend:3001", "token", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Somente administradores" }), {
        status: 403, headers: { "content-type": "application/json" },
      }),
    ));
    await expect(failing.listManagedAccounts()).rejects.toMatchObject({
      message: "Somente administradores", statusCode: 403,
    });
  });
});
