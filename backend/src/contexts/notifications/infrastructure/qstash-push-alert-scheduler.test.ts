import { afterEach, describe, expect, it, vi } from "vitest";
import { qstashPushAlertScheduler } from "./qstash-push-alert-scheduler.js";

describe("qstashPushAlertScheduler", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws when scheduler configuration is missing", async () => {
    const scheduler = qstashPushAlertScheduler({ appPublicUrl: "https://pelada.com" });
    await expect(scheduler.schedulePushTest("user-1")).rejects.toThrow(
      "O agendador da tela bloqueada não está configurado no backend.",
    );
  });

  it("publishes delayed push test alert to QStash", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    globalThis.fetch = fetchMock;

    const scheduler = qstashPushAlertScheduler({
      appPublicUrl: "https://pelada.com",
      token: "qstash-secret-token",
      webhookSecret: "webhook-secret",
    });

    const result = await scheduler.schedulePushTest("user-123");
    expect(result).toEqual({ scheduled: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://qstash.upstash.io/v2/publish/https://pelada.com/api/internal/notifications/push-test-alert",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer qstash-secret-token",
          "Upstash-Delay": "10s",
          "Upstash-Forward-Authorization": "Bearer webhook-secret",
          "Upstash-Label": "push-test-user-123",
        }),
        body: JSON.stringify({ userId: "user-123" }),
      }),
    );
  });
});

