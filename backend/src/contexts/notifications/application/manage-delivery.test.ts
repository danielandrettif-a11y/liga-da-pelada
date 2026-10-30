import { describe, expect, it, vi } from "vitest";
import {
  manageDelivery,
  NotificationDeliveryError,
  type CartolaEmailSender,
  type LeagueNotificationSettingsRepository,
  type PushAlertScheduler,
  type PushDeliverySubscriptionRepository,
  type PushNotificationSender,
} from "./manage-delivery.js";
import type { PushConfigurationProvider } from "./manage-preferences.js";

function createFixtures() {
  const pushScheduler: PushAlertScheduler = {
    schedulePushTest: vi.fn(async () => ({ scheduled: true })),
  };

  const pushSender: PushNotificationSender = {
    sendPush: vi.fn(async () => ({
      sent: 1,
      failed: 0,
      expiredEndpoints: [],
      failureReasons: [],
    })),
  };

  const pushSubscriptions: PushDeliverySubscriptionRepository = {
    listSubscriptionsByUser: vi.fn(async () => [
      { endpoint: "https://push.example.com/sub1", p256dh: "key1", auth: "auth1" },
    ]),
    removeExpiredEndpoints: vi.fn(async () => true),
  };

  const pushConfig: PushConfigurationProvider = {
    getPublicKey: vi.fn(() => "test-pub-key"),
    isConfigured: vi.fn(() => true),
    getConfigurationError: vi.fn(() => null),
    isBackgroundAlertsConfigured: vi.fn(() => true),
  };

  const emailSender: CartolaEmailSender = {
    sendCartolaEmailTest: vi.fn(async () => ({ providerMessageId: "msg-123" })),
  };

  const leagueSettings: LeagueNotificationSettingsRepository = {
    recordEmailTestedAt: vi.fn(async () => true),
  };

  const service = manageDelivery({
    pushScheduler,
    pushSender,
    pushSubscriptions,
    pushConfig,
    emailSender,
    leagueSettings,
  });

  return {
    service,
    pushScheduler,
    pushSender,
    pushSubscriptions,
    pushConfig,
    emailSender,
    leagueSettings,
  };
}

describe("manageDelivery application service", () => {
  describe("schedulePushTest", () => {
    it("schedules a push test for the authenticated user", async () => {
      const { service, pushScheduler } = createFixtures();
      const result = await service.schedulePushTest({ userId: "user-1" });
      expect(result).toEqual({ scheduled: true });
      expect(pushScheduler.schedulePushTest).toHaveBeenCalledWith("user-1");
    });

    it("rejects when actor userId is missing", async () => {
      const { service } = createFixtures();
      await expect(service.schedulePushTest({ userId: "" })).rejects.toThrow(NotificationDeliveryError);
    });
  });

  describe("deliverPushTestAlert", () => {
    it("returns disabled when VAPID keys are not configured", async () => {
      const { service, pushConfig } = createFixtures();
      vi.mocked(pushConfig.isConfigured).mockReturnValue(false);

      const result = await service.deliverPushTestAlert("user-1");
      expect(result).toEqual({ sent: 0, failed: 0, disabled: true });
    });

    it("returns zero sent when user has no active subscriptions", async () => {
      const { service, pushSubscriptions } = createFixtures();
      vi.mocked(pushSubscriptions.listSubscriptionsByUser).mockResolvedValue([]);

      const result = await service.deliverPushTestAlert("user-1");
      expect(result).toEqual({ sent: 0, failed: 0 });
    });

    it("delivers push and cleans up expired subscriptions", async () => {
      const { service, pushSender, pushSubscriptions } = createFixtures();
      vi.mocked(pushSender.sendPush).mockResolvedValue({
        sent: 1,
        failed: 1,
        expiredEndpoints: ["https://push.example.com/expired"],
        failureReasons: ["HTTP 410"],
      });

      const result = await service.deliverPushTestAlert("user-1");
      expect(result).toEqual({
        sent: 1,
        failed: 1,
        failureReasons: ["HTTP 410"],
      });
      expect(pushSubscriptions.removeExpiredEndpoints).toHaveBeenCalledWith("user-1", [
        "https://push.example.com/expired",
      ]);
    });
  });

  describe("sendCartolaEmailTest", () => {
    it("sends test email and records tested date for admin with email", async () => {
      const { service, emailSender, leagueSettings } = createFixtures();
      const result = await service.sendCartolaEmailTest("league-1", {
        userId: "admin-1",
        email: "admin@pelada.com",
        name: "Admin Pelada",
      });

      expect(result.success).toBe(true);
      expect(result.testedAt).toBeDefined();
      expect(emailSender.sendCartolaEmailTest).toHaveBeenCalledWith({
        userId: "admin-1",
        email: "admin@pelada.com",
        name: "Admin",
      });
      expect(leagueSettings.recordEmailTestedAt).toHaveBeenCalledWith(
        "league-1",
        { userId: "admin-1" },
        result.testedAt,
      );
    });

    it("rejects when admin has no email", async () => {
      const { service } = createFixtures();
      await expect(
        service.sendCartolaEmailTest("league-1", {
          userId: "admin-1",
          email: null,
          name: "Admin",
        }),
      ).rejects.toThrow("Somente um ADM com e-mail pode executar o teste.");
    });
  });
});

