import { describe, expect, it, vi } from "vitest";
import { supabasePlayerAvatarStorage } from "./supabase-player-avatar-storage.js";

describe("supabasePlayerAvatarStorage", () => {
  it("uploads and removes only authenticated player-avatar objects", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const storage = supabasePlayerAvatarStorage(
      "http://supabase-internal:8000", "https://public.example", "publishable", fetcher as typeof fetch,
    );
    const uploaded = await storage.upload("player-id", {
      slot: "active", contentType: "image/png", bytes: new Uint8Array([1, 2, 3]),
    }, "token");
    expect(uploaded.path).toMatch(/^player-id\/[0-9a-f-]+\.png$/);
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer token", apikey: "publishable",
    });
    await storage.remove([uploaded.path], "token");
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).method).toBe("DELETE");
    expect(storage.pathFromPublicUrl(uploaded.publicUrl)).toBe(uploaded.path);
  });
});
