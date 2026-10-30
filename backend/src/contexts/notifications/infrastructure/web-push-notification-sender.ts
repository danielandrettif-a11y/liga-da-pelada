import webpush, { type PushSubscription as WebPushSubscription, type WebPushError } from "web-push";
import type { PushNotificationSender } from "../application/manage-delivery.js";
import type { PushNotificationPayload, StoredPushSubscription } from "../domain/push-delivery.js";
import type { PushConfigurationProvider } from "../application/manage-preferences.js";

function isExpiredSubscription(error: unknown): boolean {
  const statusCode = (error as WebPushError | undefined)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

function getPushFailureReason(error: unknown): string {
  const pushError = error as (WebPushError & { body?: unknown }) | undefined;
  const status = typeof pushError?.statusCode === "number"
    ? `HTTP ${pushError.statusCode}`
    : "erro do provedor push";
  const body = typeof pushError?.body === "string" ? pushError.body.trim() : "";
  const message = error instanceof Error ? error.message.trim() : "";
  return [status, body || message].filter(Boolean).join(" — ").slice(0, 320);
}

export type WebPushSenderConfig = {
  pushConfig: PushConfigurationProvider;
  privateKey?: string;
  subject?: string;
};

export function webPushNotificationSender(config: WebPushSenderConfig): PushNotificationSender {
  return {
    async sendPush(subscriptions: StoredPushSubscription[], payload: PushNotificationPayload) {
      const publicKey = config.pushConfig.getPublicKey();
      const privateKey = config.privateKey?.trim();
      const subject = config.subject?.trim() || "mailto:admin@ligadapelada.com";

      if (!publicKey || !privateKey) {
        throw new Error("Chaves VAPID incompletas no servidor.");
      }

      const stringifiedPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || "/icons/pelada-bq-v2-192.png",
        badge: payload.badge || "/icons/pelada-bq-v2-192.png",
        tag: payload.tag,
        url: payload.url || "/mais/notificacoes",
      });

      const expiredEndpoints: string[] = [];
      const failureReasons: string[] = [];
      let sent = 0;
      let failed = 0;

      await Promise.all(
        subscriptions.map(async (stored) => {
          const subscription: WebPushSubscription = {
            endpoint: stored.endpoint,
            keys: { p256dh: stored.p256dh, auth: stored.auth },
          };

          try {
            await webpush.sendNotification(subscription, stringifiedPayload, {
              TTL: 60 * 60,
              urgency: "high",
              vapidDetails: {
                subject,
                publicKey,
                privateKey,
              },
            });
            sent += 1;
          } catch (error) {
            failed += 1;
            if (isExpiredSubscription(error)) {
              expiredEndpoints.push(stored.endpoint);
            } else {
              failureReasons.push(getPushFailureReason(error));
            }
          }
        }),
      );

      return {
        sent,
        failed,
        expiredEndpoints,
        failureReasons,
      };
    },
  };
}

