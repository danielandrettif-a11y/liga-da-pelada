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

export function buildMatchTimerPayload(
  match: {
    id: string;
    score_a: number;
    score_b: number;
    team_a: { name: string } | null;
    team_b: { name: string } | null;
  },
  threshold: "one_minute" | "thirty_seconds" | "finished",
): PushNotificationPayload {
  const leftTeam = match.team_a?.name || "Time A";
  const rightTeam = match.team_b?.name || "Time B";
  const score = `${leftTeam} ${match.score_a} × ${match.score_b} ${rightTeam}`;
  const isFinal = threshold === "finished";
  return {
    title: isFinal ? "Fim de jogo!!" : threshold === "one_minute" ? "1 minuto restante!" : "30 segundos restantes!",
    body: isFinal ? score : `${score} · prepare o apito final.`,
    tag: `match-timer-${threshold}-${match.id}`,
    url: `/partidas/${match.id}`,
    icon: "/icons/pelada-bq-v2-192.png",
    badge: "/icons/pelada-bq-v2-192.png",
  };
}

