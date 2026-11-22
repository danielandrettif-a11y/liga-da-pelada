import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./auth", () => ({ getCurrentAccount: vi.fn(), readAccountMemberships: vi.fn() }));

import { getCurrentAccount, readAccountMemberships } from "./auth";
import { getMyLeagues } from "./league-context";

describe("getMyLeagues", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reuses account memberships and skips cleanup on ordinary navigation", async () => {
    const client = { rpc: vi.fn() };
    vi.mocked(getCurrentAccount).mockResolvedValue({
      client, user: { id: "user" }, memberships: [{
        role: "player",
        leagues: { id: "league", name: "Pelada", is_active: true, feature_tier: "complete" },
      }],
    } as never);

    await expect(getMyLeagues()).resolves.toMatchObject([{ id: "league", role: "player" }]);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(readAccountMemberships).not.toHaveBeenCalled();
  });

  it("reloads memberships when the expiration fallback removes a quick league", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: 1 }) };
    vi.mocked(getCurrentAccount).mockResolvedValue({
      client, user: { id: "user" }, memberships: [{
        leagues: { id: "expired", is_active: true, feature_tier: "quick", quick_purge_at: "2000-01-01T00:00:00Z" },
      }],
    } as never);
    vi.mocked(readAccountMemberships).mockReturnValue(Promise.resolve({ data: [], error: null }) as never);

    await expect(getMyLeagues()).resolves.toEqual([]);
    expect(client.rpc).toHaveBeenCalledWith("cleanup_expired_quick_leagues");
    expect(readAccountMemberships).toHaveBeenCalledWith(client, "user");
  });
});
