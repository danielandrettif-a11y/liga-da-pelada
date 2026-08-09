import webpush, { type PushSubscription, type WebPushError } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/siteUrl";

type FinishedMatchForPush = {
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

function teamName(team: FinishedMatchForPush["team_a"], fallback: string) {
  if (Array.isArray(team)) return team[0]?.name || fallback;
  return team?.name || fallback;
}

function isExpiredSubscription(error: unknown) {
  const statusCode = (error as WebPushError | undefined)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

export async function sendMatchFinishedNotifications(
  client: SupabaseClient,
  match: FinishedMatchForPush,
) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("Notificação de fim de jogo ignorada: chaves VAPID não configuradas.");
    return { sent: 0, failed: 0, disabled: true };
  }

  const { data: roundPlayers, error: playersError } = await client
    .from("round_players")
    .select("player_id")
    .eq("round_id", match.round_id);

  if (playersError) throw playersError;
  const playerIds = [...new Set((roundPlayers || []).map((item) => item.player_id))];
  if (playerIds.length === 0) return { sent: 0, failed: 0 };

  const { data: profiles, error: profilesError } = await client
    .from("account_profiles")
    .select("user_id")
    .in("player_id", playerIds);

  if (profilesError) throw profilesError;
  const userIds = [...new Set((profiles || []).map((profile) => profile.user_id))];
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  const { data: subscriptions, error: subscriptionsError } = await client
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (subscriptionsError) throw subscriptionsError;
  if (!subscriptions?.length) return { sent: 0, failed: 0 };

  const leftTeam = teamName(match.team_a, "Time A");
  const rightTeam = teamName(match.team_b, "Time B");
  const payload = JSON.stringify({
    title: "Fim de jogo!",
    body: `${leftTeam} ${match.score_a} × ${match.score_b} ${rightTeam}`,
    icon: "/icons/pelada-bq-v2-192.png",
    badge: "/icons/pelada-bq-v2-192.png",
    tag: `match-finished-${match.id}`,
    url: `/partidas/${match.id}`,
  });

  const expiredEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;

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
      else console.error("Erro ao enviar Web Push:", error);
    }
  }));

  if (expiredEndpoints.length > 0) {
    await client.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
  }

  return { sent, failed };
}
