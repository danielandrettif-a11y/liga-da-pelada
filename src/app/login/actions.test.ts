import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), publicApi: vi.fn(), authenticatedApi: vi.fn(),
  login: vi.fn(), oauth: vi.fn(), reset: vi.fn(), update: vi.fn(), logout: vi.fn(),
  createFlow: vi.fn(), storeFlow: vi.fn(), setSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn(),
  revalidate: vi.fn(), redirect: vi.fn(), cookies: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/identity/infrastructure/identity-api-session", () => ({
  identityPublicApi: mocks.publicApi,
  identityApiFor: mocks.authenticatedApi,
}));
vi.mock("@/modules/identity/infrastructure/identity-pkce", () => ({
  createIdentityPkceFlow: mocks.createFlow,
  storeIdentityPkceVerifier: mocks.storeFlow,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { login, logout, requestPasswordReset, signInWithGoogle, updatePassword } from "./actions";

const client = {
  auth: {
    setSession: mocks.setSession,
    getUser: mocks.getUser,
    signOut: mocks.signOut,
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
  },
  rpc: vi.fn(),
};

describe("login actions through the identity API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(client);
    mocks.publicApi.mockReturnValue({
      login: mocks.login,
      googleAuthorization: mocks.oauth,
      requestPasswordReset: mocks.reset,
    });
    mocks.authenticatedApi.mockResolvedValue({ updatePassword: mocks.update, logout: mocks.logout });
    mocks.createFlow.mockReturnValue({
      flowId: "1234567890abcdef", codeVerifier: "v".repeat(56), codeChallenge: "c".repeat(43),
    });
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.cookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
  });

  it("logs in via the backend and installs the returned SSR session", async () => {
    mocks.login.mockResolvedValue({ accessToken: "access", refreshToken: "refresh" });
    const data = new FormData();
    data.set("email", "USER@example.com");
    data.set("password", "password-123");
    data.set("next", "/lobby");
    await login(data);
    expect(mocks.login).toHaveBeenCalledWith("user@example.com", "password-123");
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(mocks.redirect).toHaveBeenCalledWith("/inicio");
  });

  it("starts Google and password recovery with a stored PKCE verifier", async () => {
    mocks.oauth.mockResolvedValue("https://auth.example/authorize");
    await signInWithGoogle("/lobby");
    expect(mocks.storeFlow).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("https://auth.example/authorize");

    const data = new FormData();
    data.set("email", "user@example.com");
    await expect(requestPasswordReset(data)).resolves.toMatchObject({ success: true });
    expect(mocks.reset).toHaveBeenCalledWith("user@example.com", expect.objectContaining({
      flowId: "1234567890abcdef", returnPath: "/redefinir-senha",
    }));
    expect(mocks.storeFlow).toHaveBeenCalledTimes(2);
  });

  it("updates the password, revokes the backend session and clears only local cookies", async () => {
    const data = new FormData();
    data.set("password", "new-password");
    data.set("password_confirmation", "new-password");
    await updatePassword(data);
    expect(mocks.update).toHaveBeenCalledWith("new-password");
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).toHaveBeenCalledWith("/login?password=updated");
  });

  it("does not report a committed password update as failed when logout is unavailable", async () => {
    mocks.logout.mockRejectedValueOnce(new Error("network"));
    const data = new FormData();
    data.set("password", "new-password");
    data.set("password_confirmation", "new-password");
    await updatePassword(data);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).toHaveBeenCalledWith("/login?password=updated");
  });

  it("logs out globally in the backend and removes the local SSR session", async () => {
    await logout();
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).toHaveBeenCalledWith("/inicio");
  });
});
