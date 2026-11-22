import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { fantasyApiFor, getFantasyApiSession } from "./fantasy-api-session";

describe("fantasyApiSession", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns null when FANTASY_API_ENABLED is not true", async () => {
    process.env.FANTASY_API_ENABLED = "false";
    const result = await fantasyApiFor(null);
    expect(result).toBeNull();
  });

  it("returns gateway when FANTASY_API_ENABLED=true and token exists", async () => {
    process.env.FANTASY_API_ENABLED = "true";
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:3001";

    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "token-abc" } },
          error: null,
        }),
      },
    };

    const gateway = await fantasyApiFor(mockClient as any, "lineup");
    expect(gateway).not.toBeNull();
  });

  it("throws when backend url is missing", async () => {
    process.env.FANTASY_API_ENABLED = "true";
    delete process.env.FANTASY_BACKEND_URL;
    delete process.env.INTERNAL_BACKEND_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;

    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "token-abc" } },
          error: null,
        }),
      },
    };

    await expect(fantasyApiFor(mockClient as any, "lineup")).rejects.toThrow("API de Fantasy não configurada.");
  });

  it("keeps pending operations on the existing path even when the API is enabled", async () => {
    process.env.FANTASY_API_ENABLED = "true";
    const getSession = vi.fn();
    expect(await fantasyApiFor({ auth: { getSession } } as any)).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });
});
