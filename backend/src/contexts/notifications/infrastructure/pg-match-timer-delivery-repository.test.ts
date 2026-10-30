import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgMatchTimerDeliveryRepository } from "./pg-match-timer-delivery-repository.js";

describe("pgMatchTimerDeliveryRepository", () => {
  it("lists only eligible round-player subscriptions", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ endpoint: "https://push.example.com/1", p256dh: "key", auth: "auth", user_agent: "PWA" }],
    });
    const repository = pgMatchTimerDeliveryRepository({ query } as unknown as Pool);

    const result = await repository.listSubscriptionsForRound("00000000-0000-4000-8000-000000000001");

    expect(result).toEqual([{ endpoint: "https://push.example.com/1", p256dh: "key", auth: "auth", userAgent: "PWA" }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(preference.match_push_enabled, true) = true"),
      ["00000000-0000-4000-8000-000000000001"],
    );
  });

  it("removes only provider-expired endpoints", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = pgMatchTimerDeliveryRepository({ query } as unknown as Pool);

    await expect(repository.removeExpiredEndpoints(["https://push.example.com/expired"]))
      .resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM public.push_subscriptions"),
      [["https://push.example.com/expired"]],
    );
  });
});
