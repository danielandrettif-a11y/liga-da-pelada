import { describe, expect, it, vi } from "vitest";
import {
  exchangePkceCode, googleAuthorization, login, logout, requestPasswordReset, signup, updatePassword,
  type IdentityAuthProvider, type IdentityProfileRepository,
} from "./manage-authentication.js";

const session = { accessToken: "access", refreshToken: "refresh" };
const pkce = { flowId: "1234567890abcdef", codeChallenge: "c".repeat(43), returnPath: "/lobby" };

function fixture() {
  const provider: IdentityAuthProvider = {
    signup: vi.fn().mockResolvedValue({ userId: "user-1", session: null, identitiesCount: 1 }),
    login: vi.fn().mockResolvedValue({ userId: "user-1", session }),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    googleAuthorizationUrl: vi.fn().mockResolvedValue("https://auth.example/authorize"),
    exchangePkceCode: vi.fn().mockResolvedValue({ userId: "user-1", session }),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const profiles: IdentityProfileRepository = { ensureProfile: vi.fn().mockResolvedValue(undefined) };
  return { provider, profiles };
}

describe("manage authentication", () => {
  it("starts signup, recovery and OAuth with validated PKCE redirects", async () => {
    const { provider } = fixture();
    await signup({ email: "USER@example.com", password: "password-123", name: " Maria ", pkce },
      "https://app.example", provider);
    await requestPasswordReset("USER@example.com", pkce, "https://app.example", provider);
    await expect(googleAuthorization(pkce, "https://app.example", provider))
      .resolves.toBe("https://auth.example/authorize");
    expect(provider.signup).toHaveBeenCalledWith(expect.objectContaining({
      email: "user@example.com", name: "Maria", codeChallenge: "c".repeat(43),
      redirectTo: expect.stringContaining("pkce_flow=1234567890abcdef"),
    }));
    expect(provider.requestPasswordReset).toHaveBeenCalledWith(
      "user@example.com", expect.stringContaining("next=%2Fredefinir-senha"), "c".repeat(43),
    );
  });

  it("repairs the account profile after password login and PKCE exchange", async () => {
    const { provider, profiles } = fixture();
    await expect(login("user@example.com", "password-123", provider, profiles)).resolves.toEqual(session);
    await expect(exchangePkceCode("auth-code", "v".repeat(56), provider, profiles)).resolves.toEqual(session);
    expect(profiles.ensureProfile).toHaveBeenNthCalledWith(1, { userId: "user-1" });
    expect(profiles.ensureProfile).toHaveBeenNthCalledWith(2, { userId: "user-1" });
  });

  it("preserves a valid Auth session when profile repair is temporarily unavailable", async () => {
    const { provider, profiles } = fixture();
    vi.mocked(profiles.ensureProfile).mockRejectedValue(new Error("database unavailable"));
    await expect(login("user@example.com", "password-123", provider, profiles)).resolves.toEqual(session);
  });

  it("validates password updates and delegates logout", async () => {
    const { provider } = fixture();
    await updatePassword("token", "new-password", provider);
    await logout("token", provider);
    expect(provider.updatePassword).toHaveBeenCalledWith("token", "new-password");
    expect(provider.logout).toHaveBeenCalledWith("token");
  });
});
