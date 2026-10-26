import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { cookies } from "next/headers";
import { consumeIdentityPkceVerifier, createIdentityPkceFlow, storeIdentityPkceVerifier } from "./identity-pkce";

describe("identity PKCE", () => {
  it("creates independent verifier, challenge and flow id values", () => {
    const first = createIdentityPkceFlow();
    const second = createIdentityPkceFlow();
    expect(first.flowId).toMatch(/^[a-f0-9]{32}$/);
    expect(first.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(first.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toEqual(first);
  });

  it("stores and consumes a verifier with callback-scoped HttpOnly cookies", async () => {
    const set = vi.fn();
    vi.mocked(cookies).mockResolvedValue({
      set,
      get: vi.fn().mockReturnValue({ value: "v".repeat(56) }),
    } as never);
    const flow = createIdentityPkceFlow();
    await storeIdentityPkceVerifier(flow);
    await expect(consumeIdentityPkceVerifier(flow.flowId)).resolves.toBe("v".repeat(56));
    expect(set).toHaveBeenNthCalledWith(1, `identity-pkce-${flow.flowId}`, flow.codeVerifier,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/auth/callback", maxAge: 3600 }));
    expect(set).toHaveBeenNthCalledWith(2, `identity-pkce-${flow.flowId}`, "",
      expect.objectContaining({ path: "/auth/callback", maxAge: 0 }));
  });
});
