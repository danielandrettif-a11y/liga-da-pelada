import {
  buildPushTestPayload,
  buildMatchTimerPayload,
  type CartolaEmailTestInput,
  type CartolaEmailTestResult,
  type PushDeliveryReport,
  type PushNotificationPayload,
  type StoredPushSubscription,
} from "../domain/push-delivery.js";
import type { PushConfigurationProvider } from "./manage-preferences.js";
import type {
  FinishedMatchSummary,
  MatchTimerNotificationClaim,
} from "../../matches/application/manage-matches.js";
import type { MatchTimerThreshold } from "../../matches/domain/match.js";
import type { Actor } from "../../../shared/actor.js";

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

export interface MatchTimerDeliveryRepository {
  listSubscriptionsForRound(roundId: string): Promise<StoredPushSubscription[]>;
  removeExpiredEndpoints(endpoints: string[]): Promise<boolean>;
}

export interface MatchTimerClaimRepository {
  dispatchMatchTimerThresholdSystem(
    matchId: string,
    threshold: MatchTimerThreshold,
  ): Promise<MatchTimerNotificationClaim>;
  releaseMatchTimerThresholdSystem(
    matchId: string,
    threshold: MatchTimerThreshold,
    claimedAt: string,
  ): Promise<void>;
}

export interface CartolaEmailSender {
  sendCartolaEmailTest(input: CartolaEmailTestInput): Promise<{ providerMessageId?: string | null }>;
}

export interface LeagueNotificationSettingsRepository {
  getEmailTestRecipient(
    leagueId: string,
    actor: Actor,
  ): Promise<{ email: string; name: string }>;
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
  matchTimerClaims: MatchTimerClaimRepository;
  matchTimerDelivery: MatchTimerDeliveryRepository;
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

    async deliverMatchTimerAlert(
      matchId: string,
      threshold: MatchTimerThreshold,
    ): Promise<PushDeliveryReport & Pick<MatchTimerNotificationClaim, "skipped" | "reason" | "secondsLeft">> {
      if (!deps.pushConfig.isConfigured()) {
        return { sent: 0, failed: 0, disabled: true };
      }

      let claimedAt: string | undefined;
      try {
        const claim = await deps.matchTimerClaims.dispatchMatchTimerThresholdSystem(matchId, threshold);
        if (claim.skipped) {
          return {
            sent: 0,
            failed: 0,
            skipped: true,
            reason: claim.reason,
            secondsLeft: claim.secondsLeft,
          };
        }
        if (!claim.match || !claim.claimedAt) {
          throw new NotificationDeliveryError("O backend não devolveu uma trava válida para o alerta.");
        }
        claimedAt = claim.claimedAt;

        const subscriptions = await deps.matchTimerDelivery.listSubscriptionsForRound(claim.match.round_id);
        if (subscriptions.length === 0) {
          return { sent: 0, failed: 0, secondsLeft: claim.secondsLeft };
        }

        const delivery = await deps.pushSender.sendPush(
          subscriptions,
          buildMatchTimerPayload(claim.match as FinishedMatchSummary, threshold),
        );
        if (delivery.expiredEndpoints.length > 0) {
          await deps.matchTimerDelivery.removeExpiredEndpoints(delivery.expiredEndpoints);
        }
        if (delivery.sent === 0 && delivery.failed > 0) {
          throw new NotificationDeliveryError("Nenhuma notificação pôde ser entregue.", 502);
        }
        return {
          sent: delivery.sent,
          failed: delivery.failed,
          failureReasons: delivery.failureReasons,
          secondsLeft: claim.secondsLeft,
        };
      } catch (error) {
        if (claimedAt) {
          try {
            await deps.matchTimerClaims.releaseMatchTimerThresholdSystem(matchId, threshold, claimedAt);
          } catch {
            // A falha original continua sendo a informação mais útil ao chamador.
          }
        }
        throw error;
      }
    },

    async sendCartolaEmailTest(
      leagueId: string,
      actor: Actor,
    ): Promise<CartolaEmailTestResult> {
      if (!actor.userId) {
        throw new NotificationDeliveryError("Entre na sua conta para testar.", 401);
      }

      // O destino nunca vem do cliente: o repositório autoriza o ADM e resolve
      // e-mail/nome a partir da identidade verificada antes do efeito externo.
      const recipient = await deps.leagueSettings.getEmailTestRecipient(leagueId, actor);
      const displayName = recipient.name.trim() || recipient.email.split("@")[0] || "Jogador";
      const firstName = displayName.split(" ")[0] || "Jogador";
      await deps.emailSender.sendCartolaEmailTest({
        userId: actor.userId,
        email: recipient.email,
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

