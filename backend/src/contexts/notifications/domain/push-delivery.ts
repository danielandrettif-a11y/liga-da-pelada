export type StoredPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

export type PushNotificationPayload = {
  title: string;
  body: string;
  tag: string;
  url?: string;
  icon?: string;
  badge?: string;
};

export type PushDeliveryReport = {
  sent: number;
  failed: number;
  disabled?: boolean;
  failureReasons?: string[];
};

export type CartolaEmailTestInput = {
  userId: string;
  email: string;
  name: string;
};

export type CartolaEmailTestResult = {
  success: boolean;
  testedAt: string;
};

export function buildPushTestPayload(userId: string): PushNotificationPayload {
  return {
    title: "Notificações ativadas!",
    body: "Este é um teste. Os avisos de 1 minuto, 30 segundos e fim de jogo chegarão mesmo com o celular bloqueado.",
    tag: `push-test-${userId}`,
    url: "/mais/notificacoes",
    icon: "/icons/pelada-bq-v2-192.png",
    badge: "/icons/pelada-bq-v2-192.png",
  };
}

