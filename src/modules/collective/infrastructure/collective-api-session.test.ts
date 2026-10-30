import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { collectiveApiFor } from "./collective-api-session";

describe("collectiveApiFor", () => {
  const originalEnv = process.env.COLLECTIVE_API_ENABLED;

  beforeEach(() => {
    process.env.COLLECTIVE_API_ENABLED = "true";
  });

  afterEach(() => {
    process.env.COLLECTIVE_API_ENABLED = originalEnv;
  });

  it("returns null when COLLECTIVE_API_ENABLED is not 'true'", async () => {
    process.env.COLLECTIVE_API_ENABLED = "false";
    const api = await collectiveApiFor(null);
    expect(api).toBeNull();
  });

  it("returns gateway instance when client provides access_token", async () => {
    const mockClient: any = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "mock-token" } },
          error: null,
        }),
      },
    };

    const api = await collectiveApiFor(mockClient);
    expect(api).not.toBeNull();
    expect(typeof api?.getActiveCollectiveSummary).toBe("function");
    expect(typeof api?.sendCollectiveMessage).toBe("function");
  });
});
