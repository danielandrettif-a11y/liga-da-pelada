import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { managerApiFor } from "./manager-api-session";

describe("managerApiFor", () => {
  const originalEnv = process.env.INTEGRATIONS_API_ENABLED;

  beforeEach(() => {
    process.env.INTEGRATIONS_API_ENABLED = "true";
  });

  afterEach(() => {
    process.env.INTEGRATIONS_API_ENABLED = originalEnv;
  });

  it("returns null when INTEGRATIONS_API_ENABLED is not 'true'", async () => {
    process.env.INTEGRATIONS_API_ENABLED = "false";
    const api = await managerApiFor(null);
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

    const api = await managerApiFor(mockClient);
    expect(api).not.toBeNull();
    expect(typeof api?.createClub).toBe("function");
    expect(typeof api?.runCommand).toBe("function");
  });
});
