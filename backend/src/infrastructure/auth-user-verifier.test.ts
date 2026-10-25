import { describe, expect, it, vi } from "vitest";
import { supabaseUserVerifier } from "./auth-user-verifier.js";

const userId = "00000000-0000-4000-8000-000000000001";

describe("supabaseUserVerifier", () => {
  it("accepts only an identity returned by the local Auth service", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: userId }) });
    const verifier = supabaseUserVerifier("http://kong:8000", "public-key", fetcher);
    await expect(verifier.verifyAccessToken("valid-token")).resolves.toEqual({ userId });
    expect(fetcher).toHaveBeenCalledWith(new URL("http://kong:8000/auth/v1/user"), expect.objectContaining({
      headers: { authorization: "Bearer valid-token", apikey: "public-key" },
    }));
  });

  it("treats expired tokens as unauthenticated and service failures as unavailable", async () => {
    const expired = supabaseUserVerifier("http://kong:8000", "public-key", vi.fn().mockResolvedValue({ status: 401 }));
    await expect(expired.verifyAccessToken("expired")).resolves.toBeNull();
    const unavailable = supabaseUserVerifier("http://kong:8000", "public-key", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(unavailable.verifyAccessToken("token")).rejects.toThrow("Auth indisponível");
  });

  it("rejects malformed identities instead of passing them to PostgreSQL claims", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "not-a-uuid" }) });
    const verifier = supabaseUserVerifier("http://kong:8000", "public-key", fetcher);
    await expect(verifier.verifyAccessToken("token")).rejects.toThrow("Resposta de Auth inválida");
  });
});
