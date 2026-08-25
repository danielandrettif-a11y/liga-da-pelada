import webpush, { type PushSubscription, type WebPushError } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/siteUrl";
import { createServiceClient } from "@/lib/supabase/service";

type MatchForPush = {
  id: string;
  round_id: string;
  score_a: number;
  score_b: number;
  team_a: { name: string } | Array<{ name: string }> | null;
  team_b: { name: string } | Array<{ name: string }> | null;
};

type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushNotification = {
  title: string;
  body: string;
  tag: string;
  url?: string;
};

type PushDeliveryResult = {
  sent: number;
  failed: number;
  disabled?: boolean;
  failureReasons?: string[];
};

export function getWebPushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  return {
    publicKey,
    privateKey,
    configured: Boolean(publicKey && privateKey),
  };
}

function teamName(team: MatchForPush["team_a"], fallback: string) {
  if (Array.isArray(team)) return team[0]?.name || fallback;
  return team?.name || fallback;
}

function isExpiredSubscription(error: unknown) {
  const statusCode = (error as WebPushError | undefined)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

function getPushFailureReason(error: unknown) {
  const pushError = error as (WebPushError & { body?: unknown }) | undefined;
  const status = typeof pushError?.statusCode === "number"
    ? `HTTP ${pushError.statusCode}`
    : "erro do provedor push";
  const body = typeof pushError?.body === "string" ? pushError.body.trim() : "";
  const message = error instanceof Error ? error.message.trim() : "";
  return [status, body || message].filter(Boolean).join(" — ").slice(0, 320);
}

async function sendMatchNotifications(
  client: SupabaseClient,
  match: MatchForPush,
  notification: PushNotification,
) {
  const { publicKey, privateKey, configured } = getWebPushConfiguration();
  if (!configured || !publicKey || !privateKey) {
    console.warn("Notificação de fim de jogo ignorada: chaves VAPID não configuradas.");
    return { sent: 0, failed: 0, disabled: true };
  }

  const queryClient = createServiceClient() || client;

  const { data: roundPlayers, error: playersError } = await queryClient
    .from("round_players")
    .select("player_id")
    .eq("round_id", match.round_id);

  if (playersError) throw playersError;
  const playerIds = [...new Set((roundPlayers || []).map((item) => item.player_id))];
  if (playerIds.length === 0) return { sent: 0, failed: 0 };

  const { data: profiles, error: profilesError } = await queryClient
    .from("account_profiles")
    .select("user_id")
    .in("player_id", playerIds);

  if (profilesError) throw profilesError;
  const userIds = [...new Set((profiles || []).map((profile) => profile.user_id))];
  return sendPushNotificationsToUsers(queryClient, userIds, notification, `/partidas/${match.id}`);
}

async function sendPushNotificationsToUsers(
  client: SupabaseClient,
  userIds: string[],
  notification: PushNotification,
  fallbackUrl: string,
  useServiceClient = true,
) {
  const { publicKey, privateKey, configured } = getWebPushConfiguration();
  if (!configured || !publicKey || !privateKey) {
    console.warn("Notificação push ignorada: chaves VAPID não configuradas.");
    return { sent: 0, failed: 0, disabled: true };
  }
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  // The test only needs the caller's own subscription. Keeping its authenticated
  // client avoids making the test depend on the background service key.
  const queryClient = useServiceClient ? (createServiceClient() || client) : client;

  const { data: subscriptions, error: subscriptionsError } = await queryClient
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (subscriptionsError) throw subscriptionsError;
  if (!subscriptions?.length) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: "/icons/pelada-bq-v2-192.png",
    badge: "/icons/pelada-bq-v2-192.png",
    tag: notification.tag,
    url: notification.url || fallbackUrl,
  });

  const expiredEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;
  const failureReasons: string[] = [];

  await Promise.all((subscriptions as StoredSubscription[]).map(async (stored) => {
    const subscription: PushSubscription = {
      endpoint: stored.endpoint,
      keys: { p256dh: stored.p256dh, auth: stored.auth },
    };

    try {
      await webpush.sendNotification(subscription, payload, {
        TTL: 60 * 60,
        urgency: "high",
        vapidDetails: {
          subject: SITE_URL,
          publicKey,
          privateKey,
        },
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      if (isExpiredSubscription(error)) expiredEndpoints.push(stored.endpoint);
      else {
        failureReasons.push(getPushFailureReason(error));
        console.error("Erro ao enviar Web Push:", error);
      }
    }
  }));

  if (expiredEndpoints.length > 0) {
    await queryClient.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
  }

  return { sent, failed, failureReasons } satisfies PushDeliveryResult;
}

export async function sendPushTestNotification(client: SupabaseClient, userId: string) {
  return sendPushNotificationsToUsers(client, [userId], {
    title: "Notificações ativadas!",
    body: "Este é um teste. Os avisos de 30 segundos e fim de jogo chegarão mesmo com o celular bloqueado.",
    tag: `push-test-${userId}`,
    url: "/mais",
  }, "/mais", false);
}

export async function sendMatchFinishedNotifications(
  client: SupabaseClient,
  match: MatchForPush,
) {
  const leftTeam = teamName(match.team_a, "Time A");
  const rightTeam = teamName(match.team_b, "Time B");
  return sendMatchNotifications(client, match, {
    title: "Fim de jogo!",
    body: `${leftTeam} ${match.score_a} × ${match.score_b} ${rightTeam}`,
    tag: `match-finished-${match.id}`,
  });
}

export async function sendMatchTimerNotifications(
  client: SupabaseClient,
  match: MatchForPush,
  threshold: "thirty_seconds" | "finished",
) {
  const leftTeam = teamName(match.team_a, "Time A");
  const rightTeam = teamName(match.team_b, "Time B");
  const isFinal = threshold === "finished";
  return sendMatchNotifications(client, match, {
    title: isFinal ? "Fim de jogo!!" : "30 segundos restantes!",
    body: isFinal
      ? `${leftTeam} ${match.score_a} × ${match.score_b} ${rightTeam}`
      : `${leftTeam} ${match.score_a} × ${match.score_b} ${rightTeam} · prepare o apito final.`,
    tag: `match-timer-${threshold}-${match.id}`,
  });
}
