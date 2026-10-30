import { afterEach, describe, expect, it, vi } from "vitest";
import { qstashCartolaReminderScheduler } from "./qstash-cartola-reminder-scheduler.js";

describe("qstashCartolaReminderScheduler", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns disabled when token or secret is missing", async () => {
    const scheduler = qstashCartolaReminderScheduler({ appPublicUrl: "https://pelada.com" });
    const result = await scheduler.scheduleReminderJob({
      roundId: "round-1",
      milestone: "24h",
      targetAt: "2026-11-01T08:00:00.000Z",
      roundStartAt: "2026-11-02T08:00:00.000Z",
    });
    expect(result).toEqual({ scheduled: false, disabled: true });
  });

  it("publishes reminder job to QStash endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    globalThis.fetch = fetchMock;

    const scheduler = qstashCartolaReminderScheduler({
      appPublicUrl: "https://pelada.com",
      token: "secret-token",
      webhookSecret: "secret-webhook",
    });

    const result = await scheduler.scheduleReminderJob({
      roundId: "round-1",
      milestone: "24h",
      targetAt: "2026-11-01T08:00:00.000Z",
      roundStartAt: "2026-11-02T08:00:00.000Z",
    });

    expect(result).toEqual({ scheduled: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://qstash.upstash.io/v2/publish/https://pelada.com/api/internal/notifications/cartola-reminder",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
          "Upstash-Forward-Authorization": "Bearer secret-webhook",
          "Upstash-Label": "cartola-24h-round-1",
        }),
      }),
    );
  });
});

