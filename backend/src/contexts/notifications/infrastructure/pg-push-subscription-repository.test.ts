import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgPushSubscriptionRepository } from "./pg-push-subscription-repository.js";

describe("pgPushSubscriptionRepository", () => {
  const userId = "00000000-0000-4000-8000-000000000001";

  it("saves or updates push subscription with on conflict endpoint", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgPushSubscriptionRepository(pool);

    const subscription = {
      endpoint: "https://push.services.mozilla.com/123",
      expirationTime: null,
      keys: { p256dh: "key-p256", auth: "auth-token" },
      userAgent: "Firefox",
    };

    const result = await repo.saveSubscription(userId, subscription);
    expect(result).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (endpoint) DO UPDATE SET"),
      [userId, subscription.endpoint, "key-p256", "auth-token", null, "Firefox"],
    );
  });

  it("removes push subscription scoped by user and endpoint", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgPushSubscriptionRepository(pool);

    const result = await repo.removeSubscription(userId, "https://push.services.mozilla.com/123");
    expect(result).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE user_id = $1::uuid AND endpoint = $2"),
      [userId, "https://push.services.mozilla.com/123"],
    );
  });

  it("lists active push subscriptions by user", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          endpoint: "https://push.example.com/1",
          p256dh: "p256-1",
          auth: "auth-1",
          user_agent: "Chrome",
        },
      ],
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgPushSubscriptionRepository(pool);

    const list = await repo.listSubscriptionsByUser(userId);
    expect(list).toEqual([
      {
        endpoint: "https://push.example.com/1",
        p256dh: "p256-1",
        auth: "auth-1",
        userAgent: "Chrome",
      },
    ]);
  });

  it("removes expired endpoints in bulk", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgPushSubscriptionRepository(pool);

    const result = await repo.removeExpiredEndpoints(userId, [
      "https://push.example.com/expired-1",
      "https://push.example.com/expired-2",
    ]);
    expect(result).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("endpoint = ANY($2::text[])"),
      [userId, ["https://push.example.com/expired-1", "https://push.example.com/expired-2"]],
    );
  });
});
