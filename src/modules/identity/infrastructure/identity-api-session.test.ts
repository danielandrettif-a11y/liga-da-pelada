import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { identityApiFor, identityPublicApi } from "./identity-api-session";

const originalEnabled = process.env.IDENTITY_API_ENABLED;
const originalUrl = process.env.IDENTITY_BACKEND_URL;
afterEach(() => {
  if (originalEnabled === undefined) delete process.env.IDENTITY_API_ENABLED;
  else process.env.IDENTITY_API_ENABLED = originalEnabled;
  if (originalUrl === undefined) delete process.env.IDENTITY_BACKEND_URL;
  else process.env.IDENTITY_BACKEND_URL = originalUrl;
});

describe("identityApiFor", () => {
  it("keeps the legacy path while the feature is disabled", async () => {
    delete process.env.IDENTITY_API_ENABLED;
    const getSession = vi.fn();
    await expect(identityApiFor({ auth: { getSession } })).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("requires configuration and an authenticated session", async () => {
    process.env.IDENTITY_API_ENABLED = "true";
    delete process.env.IDENTITY_BACKEND_URL;
    const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    await expect(identityApiFor({ auth: { getSession } })).rejects.toThrow("não configurada");
    process.env.IDENTITY_BACKEND_URL = "http://backend:3001";
    await expect(identityApiFor({ auth: { getSession } })).rejects.toThrow("Sessão expirada");
  });

  it("creates a gateway from the server-side access token", async () => {
    process.env.IDENTITY_API_ENABLED = "true";
    process.env.IDENTITY_BACKEND_URL = "http://backend:3001";
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "token" } }, error: null,
    });
    await expect(identityApiFor({ auth: { getSession } })).resolves.toMatchObject({
      listManagedAccounts: expect.any(Function), setAccountAdminRole: expect.any(Function),
    });
  });

  it("creates a public gateway without reading a session", () => {
    process.env.IDENTITY_API_ENABLED = "true";
    process.env.IDENTITY_BACKEND_URL = "http://backend:3001";
    expect(identityPublicApi()).toMatchObject({ login: expect.any(Function), signup: expect.any(Function) });
  });
});
