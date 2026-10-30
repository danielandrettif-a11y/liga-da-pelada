import { describe, expect, it, vi } from "vitest";
import {
  manageDelivery,
  NotificationDeliveryError,
  type CartolaEmailSender,
  type LeagueNotificationSettingsRepository,
  type MatchTimerClaimRepository,
  type MatchTimerDeliveryRepository,
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
    getEmailTestRecipient: vi.fn(async () => ({ email: "admin@pelada.com", name: "Admin Pelada" })),
    recordEmailTestedAt: vi.fn(async () => true),
  };

  const matchTimerClaims: MatchTimerClaimRepository = {
    dispatchMatchTimerThresholdSystem: vi.fn(async () => ({ skipped: true, reason: "already_alerted" })),
    releaseMatchTimerThresholdSystem: vi.fn(async () => undefined),
  };
  const matchTimerDelivery: MatchTimerDeliveryRepository = {
    listSubscriptionsForRound: vi.fn(async () => []),
    removeExpiredEndpoints: vi.fn(async () => true),
  };

  const service = manageDelivery({
    pushScheduler,
    pushSender,
    pushSubscriptions,
    pushConfig,
    emailSender,
    leagueSettings,
    matchTimerClaims,
    matchTimerDelivery,
  });

  return {
    service,
    pushScheduler,
    pushSender,
    pushSubscriptions,
    pushConfig,
    emailSender,
    leagueSettings,
    matchTimerClaims,
    matchTimerDelivery,
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

  describe("deliverMatchTimerAlert", () => {
    const match = {
      id: "00000000-0000-4000-8000-000000000001",
      round_id: "00000000-0000-4000-8000-000000000002",
      score_a: 2,
      score_b: 1,
      team_a: { name: "Azul" },
      team_b: { name: "Branco" },
    };

    it("claims, resolves the audience and delivers the timer push", async () => {
      const { service, matchTimerClaims, matchTimerDelivery, pushSender } = createFixtures();
      vi.mocked(matchTimerClaims.dispatchMatchTimerThresholdSystem).mockResolvedValue({
        claimedAt: "2026-10-30T00:00:00.000Z",
        secondsLeft: 30,
        match,
      });
      vi.mocked(matchTimerDelivery.listSubscriptionsForRound).mockResolvedValue([
        { endpoint: "https://push.example.com/match", p256dh: "key", auth: "auth" },
      ]);

      const result = await service.deliverMatchTimerAlert(match.id, "thirty_seconds");

      expect(result.sent).toBe(1);
      expect(matchTimerDelivery.listSubscriptionsForRound).toHaveBeenCalledWith(match.round_id);
      expect(pushSender.sendPush).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          title: "30 segundos restantes!",
          tag: `match-timer-thirty_seconds-${match.id}`,
          url: `/partidas/${match.id}`,
        }),
      );
    });

    it("releases the exact claim when every provider delivery fails", async () => {
      const { service, matchTimerClaims, matchTimerDelivery, pushSender } = createFixtures();
      const claimedAt = "2026-10-30T00:00:00.000Z";
      vi.mocked(matchTimerClaims.dispatchMatchTimerThresholdSystem).mockResolvedValue({ claimedAt, match });
      vi.mocked(matchTimerDelivery.listSubscriptionsForRound).mockResolvedValue([
        { endpoint: "https://push.example.com/match", p256dh: "key", auth: "auth" },
      ]);
      vi.mocked(pushSender.sendPush).mockResolvedValue({
        sent: 0,
        failed: 1,
        expiredEndpoints: [],
        failureReasons: ["provider failure"],
      });

      await expect(service.deliverMatchTimerAlert(match.id, "finished")).rejects.toThrow(
        "Nenhuma notificação pôde ser entregue.",
      );
      expect(matchTimerClaims.releaseMatchTimerThresholdSystem).toHaveBeenCalledWith(
        match.id,
        "finished",
        claimedAt,
      );
    });

    it("does not claim an alert while VAPID is disabled", async () => {
      const { service, pushConfig, matchTimerClaims } = createFixtures();
      vi.mocked(pushConfig.isConfigured).mockReturnValue(false);

      await expect(service.deliverMatchTimerAlert(match.id, "finished")).resolves.toEqual({
        sent: 0,
        failed: 0,
        disabled: true,
      });
      expect(matchTimerClaims.dispatchMatchTimerThresholdSystem).not.toHaveBeenCalled();
    });
  });

  describe("sendCartolaEmailTest", () => {
    it("sends test email and records tested date for admin with email", async () => {
      const { service, emailSender, leagueSettings } = createFixtures();
      const result = await service.sendCartolaEmailTest("league-1", {
        userId: "admin-1",
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

    it("rejects before sending when the repository cannot authorize or resolve the recipient", async () => {
      const { service, leagueSettings, emailSender } = createFixtures();
      vi.mocked(leagueSettings.getEmailTestRecipient).mockRejectedValue(
        new Error("Somente um ADM com e-mail pode executar o teste."),
      );
      await expect(
        service.sendCartolaEmailTest("league-1", {
          userId: "admin-1",
        }),
      ).rejects.toThrow("Somente um ADM com e-mail pode executar o teste.");
      expect(emailSender.sendCartolaEmailTest).not.toHaveBeenCalled();
    });
  });
});

