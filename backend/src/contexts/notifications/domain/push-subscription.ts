export type SerializedPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
};

export class InvalidPushSubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPushSubscriptionError";
  }
}

export function validatePushSubscription(
  subscription: SerializedPushSubscription,
): SerializedPushSubscription {
  if (!subscription || typeof subscription !== "object") {
    throw new InvalidPushSubscriptionError("Assinatura de notificação inválida.");
  }
  if (
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://") ||
    subscription.endpoint.length > 4096
  ) {
    throw new InvalidPushSubscriptionError("Endpoint HTTPS válido é obrigatório.");
  }
  if (
    !subscription.keys ||
    typeof subscription.keys !== "object" ||
    typeof subscription.keys.p256dh !== "string" ||
    subscription.keys.p256dh.length === 0 ||
    subscription.keys.p256dh.length > 512
  ) {
    throw new InvalidPushSubscriptionError("Chave pública p256dh da assinatura inválida.");
  }
  if (
    typeof subscription.keys.auth !== "string" ||
    subscription.keys.auth.length === 0 ||
    subscription.keys.auth.length > 512
  ) {
    throw new InvalidPushSubscriptionError("Chave de autenticação auth da assinatura inválida.");
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime:
      typeof subscription.expirationTime === "number" ? subscription.expirationTime : null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    userAgent: subscription.userAgent?.slice(0, 500) || undefined,
  };
}

