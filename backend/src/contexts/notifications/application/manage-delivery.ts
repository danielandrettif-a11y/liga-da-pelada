import {
  buildPushTestPayload,
  type CartolaEmailTestInput,
  type CartolaEmailTestResult,
  type PushDeliveryReport,
  type PushNotificationPayload,
  type StoredPushSubscription,
} from "../domain/push-delivery.js";
import type { PushConfigurationProvider } from "./manage-preferences.js";

export interface PushAlertScheduler {
  schedulePushTest(userId: string): Promise<{ scheduled: boolean }>;
}

export interface PushNotificationSender {
  sendPush(
    subscriptions: StoredPushSubscription[],
    payload: PushNotificationPayload,
  ): Promise<{
    sent: number;
    failed: number;
    expiredEndpoints: string[];
    failureReasons: string[];
  }>;
}

export interface PushDeliverySubscriptionRepository {
  listSubscriptionsByUser(userId: string): Promise<StoredPushSubscription[]>;
  removeExpiredEndpoints(userId: string, endpoints: string[]): Promise<boolean>;
}

export interface CartolaEmailSender {
  sendCartolaEmailTest(input: CartolaEmailTestInput): Promise<{ providerMessageId?: string | null }>;
}

export interface LeagueNotificationSettingsRepository {
  recordEmailTestedAt(leagueId: string, actor: { userId: string }, testedAt: string): Promise<boolean>;
}

export class NotificationDeliveryError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
    this.name = "NotificationDeliveryError";
  }
}

export type DeliveryDependencies = {
  pushScheduler: PushAlertScheduler;
  pushSender: PushNotificationSender;
  pushSubscriptions: PushDeliverySubscriptionRepository;
  pushConfig: PushConfigurationProvider;
  emailSender: CartolaEmailSender;
  leagueSettings: LeagueNotificationSettingsRepository;
};

export function manageDelivery(deps: DeliveryDependencies) {
  return {
    async schedulePushTest(actor: { userId: string }): Promise<{ scheduled: boolean }> {
      if (!actor.userId) {
        throw new NotificationDeliveryError("Entre na sua conta para testar as notificações.", 401);
      }
      return deps.pushScheduler.schedulePushTest(actor.userId);
    },

    async deliverPushTestAlert(userId: string): Promise<PushDeliveryReport> {
      if (!deps.pushConfig.isConfigured()) {
        return { sent: 0, failed: 0, disabled: true };
      }

      const subscriptions = await deps.pushSubscriptions.listSubscriptionsByUser(userId);
      if (subscriptions.length === 0) {
        return { sent: 0, failed: 0 };
      }

      const payload = buildPushTestPayload(userId);
      const delivery = await deps.pushSender.sendPush(subscriptions, payload);

      if (delivery.expiredEndpoints.length > 0) {
        await deps.pushSubscriptions.removeExpiredEndpoints(userId, delivery.expiredEndpoints);
      }

      return {
        sent: delivery.sent,
        failed: delivery.failed,
        failureReasons: delivery.failureReasons,
      };
    },

    async sendCartolaEmailTest(
      leagueId: string,
      actor: { userId: string; email?: string | null; name?: string | null },
    ): Promise<CartolaEmailTestResult> {
      if (!actor.userId) {
        throw new NotificationDeliveryError("Entre na sua conta para testar.", 401);
      }
      if (!actor.email) {
        throw new NotificationDeliveryError("Somente um ADM com e-mail pode executar o teste.", 400);
      }

      const displayName = actor.name?.trim() || actor.email.split("@")[0] || "Jogador";
      const firstName = displayName.split(" ")[0] || "Jogador";
      await deps.emailSender.sendCartolaEmailTest({
        userId: actor.userId,
        email: actor.email,
        name: firstName,
      });

      const testedAt = new Date().toISOString();
      await deps.leagueSettings.recordEmailTestedAt(leagueId, { userId: actor.userId }, testedAt);

      return {
        success: true,
        testedAt,
      };
    },
  };
}

export type DeliveryApplicationService = ReturnType<typeof manageDelivery>;

