import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { operationsApi } from "./operations-api-session";

describe("operationsApi", () => {
  const originalEnv = process.env.OPERATIONS_API_ENABLED;

  beforeEach(() => {
    process.env.OPERATIONS_API_ENABLED = "true";
  });

  afterEach(() => {
    process.env.OPERATIONS_API_ENABLED = originalEnv;
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
});
