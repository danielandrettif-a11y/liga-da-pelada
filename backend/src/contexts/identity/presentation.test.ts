import { afterEach, describe, expect, it, vi } from "vitest";
import type { GoalRepository } from "../matches/application/register-goal.js";
import type { AccountAccessRepository } from "./application/manage-account-access.js";
import type { IdentityAuthProvider, IdentityProfileRepository } from "./application/manage-authentication.js";
import { createApp } from "../../presentation/app.js";

const userId = "00000000-0000-4000-8000-000000000001";
const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function fixture(enabled: boolean, actor: { userId: string } | null = { userId: "verified-user" }) {
  const accountAccessRepository: AccountAccessRepository = {
    list: vi.fn().mockResolvedValue([{
      userId, role: "player", createdAt: "2026-01-01T00:00:00.000Z", player: null,
    }]),
    setRole: vi.fn().mockResolvedValue("admin"),
  };
  const verifier = { verifyAccessToken: vi.fn().mockResolvedValue(actor) };
  const identityAuthProvider: IdentityAuthProvider = {
    signup: vi.fn().mockResolvedValue({ userId, session: null, identitiesCount: 1 }),
    login: vi.fn().mockResolvedValue({
      userId, session: { accessToken: "new-access", refreshToken: "new-refresh" },
    }),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    googleAuthorizationUrl: vi.fn().mockResolvedValue("https://auth.example/authorize"),
    exchangePkceCode: vi.fn().mockResolvedValue({
      userId, session: { accessToken: "new-access", refreshToken: "new-refresh" },
    }),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const identityProfileRepository: IdentityProfileRepository = {
    ensureProfile: vi.fn().mockResolvedValue(undefined),
  };
  const repository: GoalRepository = { registerGoal: vi.fn() };
  const app = createApp({
    goalsEnabled: false,
    identityEnabled: enabled,
    verifier,
    repository,
    accountAccessRepository,
    identityAuthProvider,
    identityProfileRepository,
    appPublicUrl: "https://app.example",
    logger: false,
  });
  apps.push(app);
  return { app, verifier, accountAccessRepository, identityAuthProvider, identityProfileRepository };
}

describe("identity account access HTTP routes", () => {
  it("are absent while the identity flag is disabled", async () => {
    const { app } = fixture(false);
    expect((await app.inject({ method: "GET", url: "/api/identity/accounts" })).statusCode).toBe(404);
  });

  it("starts PKCE flows and returns sessions only to the server-side caller", async () => {
    const { app, identityAuthProvider, identityProfileRepository } = fixture(true);
    const pkce = { flow_id: "1234567890abcdef", code_challenge: "c".repeat(43), return_path: "/lobby" };
    const signupResult = await app.inject({
      method: "POST", url: "/api/identity/signup",
      payload: { email: "user@example.com", password: "password-123", name: "Maria", ...pkce },
    });
    expect(signupResult.statusCode).toBe(201);
    expect(signupResult.json()).toMatchObject({ user_id: userId, requires_confirmation: true });

    const loginResult = await app.inject({
      method: "POST", url: "/api/identity/login",
      payload: { email: "user@example.com", password: "password-123" },
    });
    expect(loginResult.statusCode).toBe(200);
    expect(loginResult.json()).toEqual({ access_token: "new-access", refresh_token: "new-refresh" });

    const recovery = await app.inject({
      method: "POST", url: "/api/identity/password-reset", payload: { email: "user@example.com", ...pkce },
    });
    expect(recovery.statusCode).toBe(202);
    const oauth = await app.inject({ method: "POST", url: "/api/identity/oauth/google", payload: pkce });
    expect(oauth.json()).toEqual({ url: "https://auth.example/authorize" });
    expect(identityAuthProvider.signup).toHaveBeenCalledWith(expect.objectContaining({
      codeChallenge: "c".repeat(43), redirectTo: expect.stringContaining("pkce_flow=1234567890abcdef"),
    }));
    expect(identityProfileRepository.ensureProfile).toHaveBeenCalledWith({ userId });
  });

  it("exchanges PKCE codes and protects password/logout operations", async () => {
    const { app, identityAuthProvider } = fixture(true);
    const exchanged = await app.inject({
      method: "POST", url: "/api/identity/pkce/exchange",
      payload: { code: "auth-code", code_verifier: "v".repeat(56) },
    });
    expect(exchanged.statusCode).toBe(200);
    expect(exchanged.json()).toEqual({ access_token: "new-access", refresh_token: "new-refresh" });

    expect((await app.inject({
      method: "PATCH", url: "/api/identity/password", payload: { password: "new-password" },
    })).statusCode).toBe(401);
    const headers = { authorization: "Bearer current-token" };
    expect((await app.inject({
      method: "PATCH", url: "/api/identity/password", headers, payload: { password: "new-password" },
    })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: "/api/identity/logout", headers })).statusCode).toBe(204);
    expect(identityAuthProvider.updatePassword).toHaveBeenCalledWith("current-token", "new-password");
    expect(identityAuthProvider.logout).toHaveBeenCalledWith("current-token");
  });

  it("lists accounts and changes roles using the verified identity", async () => {
    const { app, verifier, accountAccessRepository } = fixture(true);
    const headers = { authorization: "Bearer valid-token" };
    const listed = await app.inject({ method: "GET", url: "/api/identity/accounts", headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ accounts: [{
      userId, role: "player", createdAt: "2026-01-01T00:00:00.000Z", player: null,
    }] });

    const changed = await app.inject({
      method: "PATCH", url: `/api/identity/accounts/${userId}/role`, headers, payload: { admin: true },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({ role: "admin" });
    expect(verifier.verifyAccessToken).toHaveBeenCalledWith("valid-token");
    expect(accountAccessRepository.setRole).toHaveBeenCalledWith(userId, "admin", { userId: "verified-user" });
  });

  it("rejects missing credentials and malformed payloads", async () => {
    const { app, accountAccessRepository } = fixture(true, null);
    expect((await app.inject({ method: "GET", url: "/api/identity/accounts" })).statusCode).toBe(401);
    const malformed = await app.inject({
      method: "PATCH",
      url: `/api/identity/accounts/${userId}/role`,
      headers: { authorization: "Bearer invalid" },
      payload: { admin: "yes" },
    });
    expect(malformed.statusCode).toBe(400);
    expect(accountAccessRepository.setRole).not.toHaveBeenCalled();
  });
});
