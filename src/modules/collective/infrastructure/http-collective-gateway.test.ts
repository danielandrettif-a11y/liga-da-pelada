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
