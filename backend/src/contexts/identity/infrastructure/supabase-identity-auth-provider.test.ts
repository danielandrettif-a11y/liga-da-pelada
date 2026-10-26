import { describe, expect, it, vi } from "vitest";
import { supabaseIdentityAuthProvider } from "./supabase-identity-auth-provider.js";

const userId = "00000000-0000-4000-8000-000000000001";
const sessionPayload = { user: { id: userId }, access_token: "access", refresh_token: "refresh" };
const json = (payload: object, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { "content-type": "application/json" },
});

describe("supabaseIdentityAuthProvider", () => {
  it("uses PKCE for signup, recovery, OAuth and exchange", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ user: { id: userId, identities: [{}] } }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json(sessionPayload));
    const provider = supabaseIdentityAuthProvider(
      "http://api-gw:8000", "https://supabase.example", "publishable", fetcher as typeof fetch,
    );
    await provider.signup({
      email: "user@example.com", password: "password-123", name: "Maria",
      redirectTo: "https://app.example/auth/callback?pkce_flow=flow", codeChallenge: "c".repeat(43),
    });
    await provider.requestPasswordReset(
      "user@example.com", "https://app.example/auth/callback?pkce_flow=flow", "c".repeat(43),
    );
    expect(await provider.googleAuthorizationUrl(
      "https://app.example/auth/callback?pkce_flow=flow", "c".repeat(43),
    )).toContain("https://supabase.example/auth/v1/authorize?provider=google");
    await expect(provider.exchangePkceCode("code", "v".repeat(56))).resolves.toEqual({
      userId, session: { accessToken: "access", refreshToken: "refresh" },
    });
    const signupBody = JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body));
    expect(signupBody).toMatchObject({ code_challenge: "c".repeat(43), code_challenge_method: "s256" });
    expect((fetcher.mock.calls[0]?.[0] as URL).searchParams.get("redirect_to")).toContain("/auth/callback");
    expect(JSON.parse(String((fetcher.mock.calls[2]?.[1] as RequestInit).body)))
      .toEqual({ auth_code: "code", code_verifier: "v".repeat(56) });
  });

  it("logs in, updates the password and revokes the global session", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(sessionPayload))
      .mockResolvedValueOnce(json({ user: { id: userId } }))
      .mockResolvedValueOnce(json({}));
    const provider = supabaseIdentityAuthProvider("http://auth", "http://public", "key", fetcher as typeof fetch);
    await expect(provider.login("user@example.com", "password")).resolves.toEqual({
      userId, session: { accessToken: "access", refreshToken: "refresh" },
    });
    await provider.updatePassword("access", "new-password");
    await provider.logout("access");
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).headers).toMatchObject({ authorization: "Bearer access" });
    expect((fetcher.mock.calls[2]?.[0] as URL).href).toBe("http://auth/auth/v1/logout?scope=global");
  });

  it("translates expected Auth failures without leaking provider details", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: "invalid_credentials", msg: "provider detail" }, 400));
    const provider = supabaseIdentityAuthProvider("http://auth", "http://public", "key", fetcher as typeof fetch);
    await expect(provider.login("user@example.com", "bad"))
      .rejects.toMatchObject({ message: "Email ou senha incorretos.", statusCode: 401 });
  });
});
