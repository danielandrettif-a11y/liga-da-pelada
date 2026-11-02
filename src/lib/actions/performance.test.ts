import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockOpsApi, mockClient } = vi.hoisted(() => ({
  mockOpsApi: {
    getPerformanceSummary: vi.fn().mockResolvedValue([
      { kind: "api", name: "test", path: "/test", samples: 10, p50_ms: 12, p95_ms: 40, max_ms: 100, poor_or_failed: 0 },
    ]),
    reportServerEvent: vi.fn().mockResolvedValue({ success: true }),
  },
  mockClient: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "token" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

vi.mock("@/modules/operations/infrastructure/operations-api-session", () => ({
  operationsApi: vi.fn().mockImplementation(() => Promise.resolve(mockOpsApi)),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

import { getPerformanceSummary } from "./performance";

describe("Server Actions: Performance Bridging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates getPerformanceSummary to operationsApi", async () => {
    const res = await getPerformanceSummary(48);
    const { operationsApi } = await import("@/modules/operations/infrastructure/operations-api-session");
    expect(operationsApi).toHaveBeenCalledWith(mockClient);
    expect(mockOpsApi.getPerformanceSummary).toHaveBeenCalledWith(48);
    expect(res).toHaveLength(1);
    expect(res[0].samples).toBe(10);
  });
});
