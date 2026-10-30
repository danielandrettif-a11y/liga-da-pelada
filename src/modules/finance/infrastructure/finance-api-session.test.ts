import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  financeApiFor,
  getFinanceApiSession,
  FinanceApiError,
} from "./finance-api-session";

describe("finance-api-session", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns null when FINANCE_API_ENABLED is not 'true'", async () => {
    delete process.env.FINANCE_API_ENABLED;
    const client = {
      auth: { getSession: vi.fn() },
    };
    expect(await financeApiFor(client as any)).toBeNull();
    expect(await getFinanceApiSession(client as any)).toBeNull();
  });

  it("throws FinanceApiError when backend URL is missing", async () => {
    process.env.FINANCE_API_ENABLED = "true";
    delete process.env.FINANCE_BACKEND_URL;
    delete process.env.INTERNAL_BACKEND_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;

    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "test-token" } },
          error: null,
        }),
      },
    };

    await expect(financeApiFor(client as any)).rejects.toThrow(FinanceApiError);
  });

  it("returns active session when flag is enabled and url is set", async () => {
    process.env.FINANCE_API_ENABLED = "true";
    process.env.FINANCE_BACKEND_URL = "http://localhost:3001";

    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "test-token" } },
          error: null,
        }),
      },
    };

    const session = await getFinanceApiSession(client as any);
    expect(session).not.toBeNull();
    expect(session?.accessToken).toBe("test-token");
    expect(session?.backendUrl).toBe("http://localhost:3001");
  });
});
