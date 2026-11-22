import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), publicApi: vi.fn(), signup: vi.fn(), createFlow: vi.fn(), storeFlow: vi.fn(), setSession: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/identity/infrastructure/identity-api-session", () => ({ identityPublicApi: mocks.publicApi }));
vi.mock("@/modules/identity/infrastructure/identity-pkce", () => ({
  createIdentityPkceFlow: mocks.createFlow,
  storeIdentityPkceVerifier: mocks.storeFlow,
}));

import { signup } from "./actions";

function form() {
  const data = new FormData();
  data.set("email", "USER@example.com");
  data.set("password", "password-123");
  data.set("password_confirmation", "password-123");
  data.set("name", "Maria");
  data.set("next", "/lobby");
  return data;
}

describe("signup action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFlow.mockReturnValue({
      flowId: "1234567890abcdef", codeVerifier: "v".repeat(56), codeChallenge: "c".repeat(43),
    });
    mocks.publicApi.mockReturnValue({ signup: mocks.signup });
    mocks.createClient.mockResolvedValue({ auth: { setSession: mocks.setSession } });
    mocks.setSession.mockResolvedValue({ error: null });
  });

  it("starts a backend PKCE signup and stores its verifier for email confirmation", async () => {
    mocks.signup.mockResolvedValue({ userId: "user-1", requiresConfirmation: true, session: null });
    await expect(signup(form())).resolves.toEqual({
      success: true, requiresConfirmation: true, email: "user@example.com",
    });
    expect(mocks.signup).toHaveBeenCalledWith(expect.objectContaining({
      email: "user@example.com", flowId: "1234567890abcdef", returnPath: "/lobby",
    }));
    expect(mocks.storeFlow).toHaveBeenCalledWith(expect.objectContaining({ codeVerifier: "v".repeat(56) }));
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("installs an immediately confirmed session without leaving a PKCE cookie", async () => {
    mocks.signup.mockResolvedValue({
      userId: "user-1", requiresConfirmation: false,
      session: { accessToken: "access", refreshToken: "refresh" },
    });
    await expect(signup(form())).resolves.toMatchObject({ success: true, requiresConfirmation: false });
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(mocks.storeFlow).not.toHaveBeenCalled();
  });

  it("validates confirmation before calling the backend", async () => {
    const data = form();
    data.set("password_confirmation", "different-password");
    await expect(signup(data)).resolves.toEqual({ success: false, error: "As senhas não conferem." });
    expect(mocks.publicApi).not.toHaveBeenCalled();
  });
});
