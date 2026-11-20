import { describe, expect, it, vi } from "vitest";
import { readCollectivePage } from "./supabase-collective-reader";

describe("collective page reader", () => {
  it("maps modular pages and signs media using the viewer session", async () => {
    const createSignedUrls = vi.fn().mockResolvedValue({ data: [{ signedUrl: "https://storage.test/signed" }] });
    const client: any = { rpc: vi.fn(), storage: { from: vi.fn().mockReturnValue({ createSignedUrls }) } };
    const fetchPage = vi.fn().mockResolvedValue({ messages: [{ id: "m1", callup_id: "c1", sender_user_id: "u1", kind: "image", media_path: "c1/u1/a.webp", created_at: "2026-01-01" }], has_more: true, next_cursor: { created_at: "2026-01-01", id: "m1" }, unread_count: 2 });
    const result = await readCollectivePage(client, "u1", ["c1"], null, 60, fetchPage);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(createSignedUrls).toHaveBeenCalledWith(["c1/u1/a.webp"], 3600);
    expect(result).toMatchObject({ unreadCount: 2, hasMore: true, nextCursor: { createdAt: "2026-01-01", id: "m1" }, messages: [{ id: "m1", own: true, mediaUrl: "https://storage.test/signed" }] });
  });

  it("returns null if the modular page cannot be read", async () => {
    const client: any = { rpc: vi.fn() };
    expect(await readCollectivePage(client, "u1", ["c1"], null, 60, async () => { throw new Error("denied"); })).toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
