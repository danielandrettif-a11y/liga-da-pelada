import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { operationsApi } from "./operations-api-session";

describe("operationsApi", () => {
  const originalEnv = process.env.OPERATIONS_API_ENABLED;
  const originalToken = process.env.OPERATIONS_INTERNAL_TOKEN;

  beforeEach(() => {
    process.env.OPERATIONS_API_ENABLED = "true";
    process.env.OPERATIONS_INTERNAL_TOKEN = "internal-token";
  });

  afterEach(() => {
    process.env.OPERATIONS_API_ENABLED = originalEnv;
    process.env.OPERATIONS_INTERNAL_TOKEN = originalToken;
  });

  it("returns null when OPERATIONS_API_ENABLED is not 'true'", async () => {
    process.env.OPERATIONS_API_ENABLED = "false";
    const api = await operationsApi();
    expect(api).toBeNull();
  });

  it("returns gateway instance when OPERATIONS_API_ENABLED is 'true'", async () => {
    const api = await operationsApi();
    expect(api).not.toBeNull();
    expect(typeof api?.getPerformanceSummary).toBe("function");
    expect(typeof api?.reportServerEvent).toBe("function");
  });

  it("returns null without a user session or an internal token", async () => {
    delete process.env.OPERATIONS_INTERNAL_TOKEN;
    const api = await operationsApi();
    expect(api).toBeNull();
  });
});
