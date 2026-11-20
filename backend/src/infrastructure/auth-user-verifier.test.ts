import { describe, expect, it, vi } from "vitest";
import { supabaseUserVerifier } from "./auth-user-verifier.js";

const userId = "00000000-0000-4000-8000-000000000001";

describe("supabaseUserVerifier", () => {
  it("accepts only an identity returned by the local Auth service", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: userId, email: "admin@pelada.com", user_metadata: { full_name: "Admin BQ" } }),
    });
    const verifier = supabaseUserVerifier("http://kong:8000", "public-key", fetcher);
    await expect(verifier.verifyAccessToken("valid-token")).resolves.toEqual({
      userId,
      email: "admin@pelada.com",
      name: "Admin BQ",
    });
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

  it("coalesces concurrent checks and caps cache lifetime by both TTL and JWT expiry", async () => {
    let time = 1000;
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ id: userId }));
    const verifier = supabaseUserVerifier("http://kong:8000", "public-key", fetcher, () => time);
    const token = (exp: number) => `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
    const longLived = token(100);
    const shortLived = token(3);

    await Promise.all([verifier.verifyAccessToken(longLived), verifier.verifyAccessToken(longLived)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await verifier.verifyAccessToken(shortLived);
    time = 2999;
    await verifier.verifyAccessToken(shortLived);
    expect(fetcher).toHaveBeenCalledTimes(2);
    time = 3000;
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(verifier.verifyAccessToken(shortLived)).resolves.toBeNull();
    time = 60_999;
    await verifier.verifyAccessToken(longLived);
    expect(fetcher).toHaveBeenCalledTimes(3);
    time = 61_000;
    await verifier.verifyAccessToken(longLived);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
