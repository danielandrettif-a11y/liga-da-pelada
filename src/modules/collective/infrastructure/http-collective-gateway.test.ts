import { describe, it, expect, vi } from "vitest";
import { httpCollectiveGateway, CollectiveApiError } from "./http-collective-gateway";

describe("httpCollectiveGateway", () => {
  it("fetches candidates and a paginated read model", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [], unread_count: 1 }),
    });

    const gateway = httpCollectiveGateway("http://localhost:3001", "test-token", mockFetch as any);
    const page = await gateway.getPage("league-1", ["callup-1"], null, 60);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/collective/leagues/league-1/page",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) })
    );
    expect(page.unread_count).toBe(1);
  });

  it("sends message and handles mutations", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const gateway = httpCollectiveGateway("http://localhost:3001", "test-token", mockFetch as any);
    const sendRes = await gateway.sendCollectiveMessage("league-1", {
      callupId: "c1", body: "Olá", kind: "text", mediaPath: null, mediaMime: null,
      mediaSize: null, duration: null, replyToMessageId: null,
    });
    expect(sendRes.success).toBe(true);

    const editRes = await gateway.editCollectiveMessage("league-1", "m1", "Texto editado");
    expect(editRes.success).toBe(true);

    const deleteRes = await gateway.deleteCollectiveMessage("league-1", "m1");
    expect(deleteRes.success).toBe(true);
  });

  it("returns message validation errors without throwing", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Mensagem vazia." }),
    });

    const gateway = httpCollectiveGateway("http://localhost:3001", "test-token", mockFetch as any);
    await expect(gateway.editCollectiveMessage("league-1", "m1", "")).resolves.toEqual({ success: false, error: "Mensagem vazia." });
  });

  it("throws on an infrastructure failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "Indisponível" }) });
    const gateway = httpCollectiveGateway("http://localhost:3001", "test-token", mockFetch as any);
    await expect(gateway.editCollectiveMessage("league-1", "m1", "ok")).rejects.toThrow(CollectiveApiError);
  });

  it("returns false when no read target is permitted", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ success: false }) });
    const gateway = httpCollectiveGateway("http://localhost:3001", "test-token", mockFetch as any);
    await expect(gateway.markCollectiveRead("league-1", [{ callupId: "c1", messageId: "m1" }])).resolves.toEqual({ success: false });
  });
});
