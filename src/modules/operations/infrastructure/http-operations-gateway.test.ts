import { describe, it, expect, vi } from "vitest";
import { httpOperationsGateway, OperationsApiError } from "./http-operations-gateway";

describe("httpOperationsGateway", () => {
  it("fetches performance summary via GET /api/operations/performance-summary", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ kind: "api", name: "test", path: "/test", samples: 1 }]),
    });

    const gateway = httpOperationsGateway("http://localhost:3001", mockFetch as any);
    const summary = await gateway.getPerformanceSummary(12);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/operations/performance-summary?hours=12",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(summary).toHaveLength(1);
  });

  it("reports server event via POST /api/internal/operations/observability", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });

    const gateway = httpOperationsGateway("http://localhost:3001", mockFetch as any);
    const res = await gateway.reportServerEvent({ kind: "web_vital", name: "LCP", value: 120 });
    expect(res.success).toBe(true);
  });

  it("throws OperationsApiError on error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Erro interno" }),
    });

    const gateway = httpOperationsGateway("http://localhost:3001", mockFetch as any);
    await expect(gateway.getPerformanceSummary()).rejects.toThrow(OperationsApiError);
  });
});
