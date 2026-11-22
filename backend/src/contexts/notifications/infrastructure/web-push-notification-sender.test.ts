import { describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { webPushNotificationSender } from "./web-push-notification-sender.js";
import type { PushConfigurationProvider } from "../application/manage-preferences.js";

vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn(),
  },
}));

describe("webPushNotificationSender", () => {
  const pushConfig: PushConfigurationProvider = {
    getPublicKey: () => "mock-public-key",
    isConfigured: () => true,
    getConfigurationError: () => null,
    isBackgroundAlertsConfigured: () => true,
  };

  it("delivers push to all valid subscriptions", async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as any);

    const sender = webPushNotificationSender({
      pushConfig,
      privateKey: "mock-private-key",
      subject: "mailto:admin@pelada.com",
    });

    const result = await sender.sendPush(
      [
        { endpoint: "https://push.example.com/1", p256dh: "p1", auth: "a1" },
        { endpoint: "https://push.example.com/2", p256dh: "p2", auth: "a2" },
      ],
      {
        title: "Teste",
        body: "Corpo do teste",
        tag: "tag-1",
      },
    );

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.expiredEndpoints).toHaveLength(0);
  });

  it("collects expired subscriptions on 410 or 404 response", async () => {
    const expiredError = new Error("Subscription expired") as any;
    expiredError.statusCode = 410;
    vi.mocked(webpush.sendNotification).mockRejectedValue(expiredError);

    const sender = webPushNotificationSender({
      pushConfig,
      privateKey: "mock-private-key",
    });

    const result = await sender.sendPush(
      [{ endpoint: "https://push.example.com/expired", p256dh: "p1", auth: "a1" }],
      { title: "Teste", body: "Corpo", tag: "tag" },
    );

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.expiredEndpoints).toEqual(["https://push.example.com/expired"]);
  });
});

