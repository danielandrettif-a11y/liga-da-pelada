import { describe, it, expect, vi } from "vitest";
import { httpCollectiveGateway, CollectiveApiError } from "./http-collective-gateway";

describe("httpCollectiveGateway", () => {
  it("fetches active summary and room data", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ callupId: "c1", unreadCount: 1 }),
    });

    const gateway = httpCollectiveGateway("http://localhost:3001", "test-token", mockFetch as any);
    const summary = await gateway.getActiveCollectiveSummary("league-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/collective/leagues/league-1/summary",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(summary?.callupId).toBe("c1");
  });

  it("sends message and handles mutations", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const gateway = httpCollectiveGateway("http://localhost:3001", "test-token", mockFetch as any);
    const sendRes = await gateway.sendCollectiveMessage("league-1", { callupId: "c1", body: "Olá" });
    expect(sendRes.success).toBe(true);

    const editRes = await gateway.editCollectiveMessage("league-1", "m1", "Texto editado");
    expect(editRes.success).toBe(true);

    const deleteRes = await gateway.deleteCollectiveMessage("league-1", "m1");
    expect(deleteRes.success).toBe(true);
  });

  it("converts private media paths into signed URLs for room reads", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        summary: { callupId: "c1", unreadCount: 0 },
        callupIds: ["c1"],
        messages: [{
          id: "m1", callupId: "c1", senderUserId: "u1", senderPlayerId: "p1",
          senderName: "Ana", senderAvatarUrl: null, kind: "image", body: null,
          mediaPath: "c1/u1/photo.webp", mediaMime: "image/webp", duration: null,
          editedAt: null, deletedAt: null, createdAt: "2026-11-02T10:00:00Z",
          own: true, replyTo: null,
        }],
        isAdmin: false, currentUserId: "u1", firstUnreadMessageId: null,
        lastReadMessageId: null, hasOlderMessages: false, nextCursor: null,
      }),
    });
    const signMediaPaths = vi.fn().mockResolvedValue(new Map([
      ["c1/u1/photo.webp", "https://signed.test/photo.webp"],
    ]));
    const gateway = httpCollectiveGateway("http://localhost:3001", "token", mockFetch as any, signMediaPaths);

    const room = await gateway.getCollectiveRoom("league-1");

    expect(signMediaPaths).toHaveBeenCalledWith(["c1/u1/photo.webp"]);
    expect(room?.messages[0].mediaUrl).toBe("https://signed.test/photo.webp");
    expect(room?.messages[0]).not.toHaveProperty("mediaPath");
  });

  it("throws CollectiveApiError on server failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Mensagem vazia." }),
    });

    const gateway = httpCollectiveGateway("http://localhost:3001", "test-token", mockFetch as any);
    await expect(gateway.editCollectiveMessage("league-1", "m1", "")).rejects.toThrow(CollectiveApiError);
  });
});
