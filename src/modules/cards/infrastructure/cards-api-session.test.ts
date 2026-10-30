import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { cardsApiFor, getCardsApiSession } from "./cards-api-session";

describe("cardsApiSession", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns null when CARDS_API_ENABLED is not true", async () => {
    process.env.CARDS_API_ENABLED = "false";
    const result = await cardsApiFor(null);
    expect(result).toBeNull();
  });

  it("returns gateway when CARDS_API_ENABLED=true and token exists", async () => {
    process.env.CARDS_API_ENABLED = "true";
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:3001";

    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "token-cards" } },
          error: null,
        }),
      },
    };

    const gateway = await cardsApiFor(mockClient as any);
    expect(gateway).not.toBeNull();
  });
});
