import { describe, expect, it, vi } from "vitest";
import { supabaseLeagueBrandingStorage } from "./supabase-league-branding-storage.js";

const leagueId = "00000000-0000-4000-8000-000000000001";

describe("supabaseLeagueBrandingStorage", () => {
  it("uploads a new immutable path with the verified token and exposes the public URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const storage = supabaseLeagueBrandingStorage(
      "http://api-gw:8000", "http://127.0.0.1:54321", "publishable", fetcher as typeof fetch,
    );
    const uploaded = await storage.upload(leagueId, {
      kind: "logo", contentType: "image/png", bytes: new Uint8Array([1, 2, 3]),
    }, "verified-token");
    expect(uploaded.path).toMatch(new RegExp(`^${leagueId}/logo-[0-9a-f-]+\\.png$`));
    expect(uploaded.publicUrl).toContain(`http://127.0.0.1:54321/storage/v1/object/public/league-branding/${leagueId}/logo-`);
    const [url, options] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.host).toBe("api-gw:8000");
    expect(options.headers).toMatchObject({ authorization: "Bearer verified-token", apikey: "publishable" });
    expect(options.method).toBe("POST");
  });

  it("removes paths in one authenticated request and decodes owned public URLs", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    const storage = supabaseLeagueBrandingStorage(
      "http://api-gw:8000", "https://app.example", "publishable", fetcher as typeof fetch,
    );
    await storage.remove([`${leagueId}/logo-old.png`], "verified-token");
    expect(JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body)))
      .toEqual({ prefixes: [`${leagueId}/logo-old.png`] });
    expect(storage.pathFromPublicUrl(
      `https://app.example/storage/v1/object/public/league-branding/${leagueId}/logo-old.png`,
    )).toBe(`${leagueId}/logo-old.png`);
  });
});
