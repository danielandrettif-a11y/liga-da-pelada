import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchApiFor } from "./match-api-session";
import { MatchApiError } from "./http-match-gateway";

describe("matchApiFor", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null when MATCHES_API_ENABLED is not 'true'", async () => {
    process.env.MATCHES_API_ENABLED = "false";
    const api = await matchApiFor();
    expect(api).toBeNull();
  });

  it("throws MatchApiError when backend URL is missing", async () => {
    process.env.MATCHES_API_ENABLED = "true";
    delete process.env.MATCHES_BACKEND_URL;
    delete process.env.MATCH_GOAL_BACKEND_URL;
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "my-token" } },
          error: null,
        }),
      },
    };
    await expect(matchApiFor(client)).rejects.toThrow(MatchApiError);
  });

  it("keeps the legacy path when there is no authenticated session", async () => {
    process.env.MATCHES_API_ENABLED = "true";
    process.env.MATCHES_BACKEND_URL = "https://backend.example.com";
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
    };
    await expect(matchApiFor(client)).resolves.toBeNull();
  });

  it("returns MatchHttpGateway instance with user token", async () => {
    process.env.MATCHES_API_ENABLED = "true";
    process.env.MATCHES_BACKEND_URL = "https://backend.example.com";
    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "my-token" } },
          error: null,
        }),
      },
    };
    const api = await matchApiFor(mockClient);
    expect(api).not.toBeNull();
  });
});
