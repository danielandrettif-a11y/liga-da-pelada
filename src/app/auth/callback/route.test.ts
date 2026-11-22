import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), publicApi: vi.fn(), exchange: vi.fn(), consume: vi.fn(), setSession: vi.fn(), cookies: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/identity/infrastructure/identity-api-session", () => ({ identityPublicApi: mocks.publicApi }));
vi.mock("@/modules/identity/infrastructure/identity-pkce", () => ({
  consumeIdentityPkceVerifier: mocks.consume,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/siteUrl", () => ({ SITE_URL: "https://app.example" }));

import { GET } from "./route";

describe("identity callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publicApi.mockReturnValue({ exchangePkceCode: mocks.exchange });
    mocks.consume.mockResolvedValue("v".repeat(56));
    mocks.exchange.mockResolvedValue({ accessToken: "access", refreshToken: "refresh" });
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ auth: { setSession: mocks.setSession } });
    mocks.cookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
  });

  it("consumes the flow verifier, exchanges the code and redirects after installing the session", async () => {
    const response = await GET(new Request(
      "https://app.example/auth/callback?code=auth-code&pkce_flow=1234567890abcdef&next=%2Flobby",
    ));
    expect(mocks.consume).toHaveBeenCalledWith("1234567890abcdef");
    expect(mocks.exchange).toHaveBeenCalledWith("auth-code", "v".repeat(56));
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(response.headers.get("location")).toBe("https://app.example/inicio");
  });

  it("rejects callbacks whose verifier cookie is absent", async () => {
    mocks.consume.mockResolvedValue(null);
    const response = await GET(new Request(
      "https://app.example/auth/callback?code=auth-code&pkce_flow=1234567890abcdef",
    ));
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.example/login");
  });
});
