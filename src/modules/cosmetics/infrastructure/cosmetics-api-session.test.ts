import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { cosmeticsApiFor } from "./cosmetics-api-session";

describe("cosmeticsApiFor", () => {
  const originalEnv = process.env.COSMETICS_API_ENABLED;

  beforeEach(() => {
    process.env.COSMETICS_API_ENABLED = "true";
  });

  afterEach(() => {
    process.env.COSMETICS_API_ENABLED = originalEnv;
  });

  it("returns null when COSMETICS_API_ENABLED is not 'true'", async () => {
    process.env.COSMETICS_API_ENABLED = "false";
    const api = await cosmeticsApiFor(null);
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

    const api = await cosmeticsApiFor(mockClient);
    expect(api).not.toBeNull();
    expect(typeof api?.getCosmeticsDashboard).toBe("function");
    expect(typeof api?.equipCosmetic).toBe("function");
  });
});
