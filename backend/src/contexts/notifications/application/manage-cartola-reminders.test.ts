import { describe, expect, it, vi } from "vitest";
import {
  manageCartolaReminders,
  CartolaReminderError,
  type CartolaReminderEmailSender,
  type CartolaReminderRepository,
  type CartolaReminderScheduler,
} from "./manage-cartola-reminders.js";
import type { PushDeliverySubscriptionRepository, PushNotificationSender } from "./manage-delivery.js";
import { createCartolaUnsubscribeToken, roundStartIso } from "../domain/cartola-reminder.js";

function createFixtures() {
  const repository: CartolaReminderRepository = {
    toggleReminders: vi.fn(async () => ({
      enabled: true,
      activeRoundToSchedule: { id: "round-10", date: "2026-11-01", startTime: "08:00" },
    })),
    cancelEmailReminders: vi.fn(async () => true),
    claimDelivery: vi.fn(async () => true),
    saveDelivery: vi.fn(async () => {}),
    getReminderContext: vi.fn(async () => ({
      roundId: "round-10",
      leagueId: "league-1",
      roundNumber: 10,
      date: "2026-11-01",
      startTime: "08:00",
      roundStatus: "in_progress",
      roundType: "official",
      remindersEnabled: true,
      marketStatus: "open",
      playersPerTeam: 5,
      candidates: [
        {
          userId: "user-1",
          email: "user1@pelada.com",
          name: "Jogador 1",
          pushEnabled: true,
          emailEnabled: true,
          lineupCompleted: false,
        },
      ],
    })),
  };

  const scheduler: CartolaReminderScheduler = {
    scheduleReminderJob: vi.fn(async () => ({ scheduled: true })),
    scheduleRoundReminders: vi.fn(async () => ({ scheduled: 2 })),
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
      { endpoint: "https://push.example.com/1", p256dh: "key", auth: "auth" },
    ]),
    removeExpiredEndpoints: vi.fn(async () => true),
  };

  const emailSender: CartolaReminderEmailSender = {
    sendReminderEmail: vi.fn(async () => "resend-msg-1"),
  };

  const unsubscribeSecret = "secret-test-token";

  const service = manageCartolaReminders({
    repository,
    scheduler,
    pushSender,
    pushSubscriptions,
    emailSender,
    unsubscribeSecret,
  });

  return {
    service,
    repository,
    scheduler,
    pushSender,
    pushSubscriptions,
    emailSender,
    unsubscribeSecret,
  };
}

describe("manageCartolaReminders application service", () => {
  describe("toggleReminders", () => {
    it("enables reminders and schedules jobs for active open round", async () => {
      const { service, repository, scheduler } = createFixtures();
      const result = await service.toggleReminders("league-1", true, { userId: "admin-1" });

      expect(result).toEqual({ success: true });
      expect(repository.toggleReminders).toHaveBeenCalledWith("league-1", true, { userId: "admin-1" });
      expect(scheduler.scheduleRoundReminders).toHaveBeenCalledWith({
        roundId: "round-10",
        date: "2026-11-01",
        startTime: "08:00",
      });
    });

    it("rejects when actor userId is missing", async () => {
      const { service } = createFixtures();
      await expect(service.toggleReminders("league-1", true, { userId: "" })).rejects.toThrow(
        CartolaReminderError,
      );
    });
  });

  describe("cancelEmailReminders", () => {
    it("cancels email reminders when unsubscribe token is valid", async () => {
      const { service, repository, unsubscribeSecret } = createFixtures();
      const validToken = createCartolaUnsubscribeToken("user-1", unsubscribeSecret);

      const result = await service.cancelEmailReminders("user-1", validToken);
      expect(result).toEqual({ success: true });
      expect(repository.cancelEmailReminders).toHaveBeenCalledWith("user-1");
    });

    it("rejects when unsubscribe token is invalid", async () => {
      const { service } = createFixtures();
      await expect(service.cancelEmailReminders("user-1", "invalid-token")).rejects.toThrow(
        "Este link de cancelamento é inválido.",
      );
    });
  });

  describe("dispatchCartolaReminder", () => {
    it("dispatches push and email to incomplete candidates and records delivery", async () => {
      const { service, repository, pushSender, emailSender } = createFixtures();

      const job = {
        roundId: "round-10",
        milestone: "24h" as const,
        targetAt: "2026-10-31T11:00:00.000Z",
        roundStartAt: roundStartIso("2026-11-01", "08:00"),
      };

      const result = await service.dispatchCartolaReminder(job);
      expect(result).toEqual({ sent: 2 });
      expect(repository.claimDelivery).toHaveBeenCalledTimes(2);
      expect(pushSender.sendPush).toHaveBeenCalled();
      expect(emailSender.sendReminderEmail).toHaveBeenCalled();
      expect(repository.saveDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "delivered", channel: "push" }),
      );
      expect(repository.saveDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "delivered", channel: "email" }),
      );
    });

    it("skips dispatch if market is closed or reminders are disabled", async () => {
      const { service, repository } = createFixtures();
      vi.mocked(repository.getReminderContext).mockResolvedValueOnce({
        roundId: "round-10",
        leagueId: "league-1",
        roundNumber: 10,
        date: "2026-11-01",
        startTime: "08:00",
        roundStatus: "in_progress",
        roundType: "official",
        remindersEnabled: false,
        marketStatus: "closed",
        playersPerTeam: 5,
        candidates: [],
      });

      const job = {
        roundId: "round-10",
        milestone: "24h" as const,
        targetAt: "2026-10-31T11:00:00.000Z",
        roundStartAt: roundStartIso("2026-11-01", "08:00"),
      };

      const result = await service.dispatchCartolaReminder(job);
      expect(result).toEqual({ skipped: "disabled" });
    });
  });
});

