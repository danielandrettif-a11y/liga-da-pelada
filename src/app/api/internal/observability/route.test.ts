import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockOpsApi = {
  getPerformanceSummary: vi.fn().mockResolvedValue([]),
  reportServerEvent: vi.fn().mockResolvedValue({ success: true }),
};

vi.mock("@/modules/operations/infrastructure/operations-api-session", () => ({
  operationsApi: vi.fn().mockImplementation(() => Promise.resolve(mockOpsApi)),
}));

vi.mock("@/lib/observability", () => ({
  reportServerEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

describe("Internal Observability Route Bridging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates valid web_vital event to operationsApi", async () => {
    const req = new NextRequest("http://localhost:3000/api/internal/observability", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        kind: "web_vital",
        name: "LCP",
        value: 500,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(mockOpsApi.reportServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "web_vital", name: "LCP", value: 500 })
    );
  });
});
