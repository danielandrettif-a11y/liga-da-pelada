import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushNotificationsToUsers } from "@/lib/push-notifications";

export async function notifyCallupAdminsAboutWithdrawal(
  fallbackClient: SupabaseClient,
  callupId: string,
  playerId: string,
) {
  try {
    const client = createServiceClient() || fallbackClient;
    const { data: callup } = await client.from("callups")
      .select("league_id")
      .eq("id", callupId)
      .maybeSingle();
    if (!callup?.league_id) return { sent: 0 };

    const [{ data: player }, { data: admins }, { data: playerAccount }, actorResult] = await Promise.all([
      client.from("players").select("name").eq("id", playerId).maybeSingle(),
      client.from("league_members")
        .select("user_id")
        .eq("league_id", callup.league_id)
        .eq("role", "admin")
        .eq("is_active", true),
      client.from("account_profiles").select("user_id").eq("player_id", playerId).maybeSingle(),
      fallbackClient.auth.getUser().catch(() => ({ data: { user: null } })),
    ]);

    const excludedUserIds = new Set([
      playerAccount?.user_id,
      actorResult.data.user?.id,
    ].filter((userId): userId is string => Boolean(userId)));
    const adminUserIds = [...new Set((admins || [])
      .map((admin) => admin.user_id)
      .filter((userId): userId is string => Boolean(userId) && !excludedUserIds.has(userId)))];
    if (!adminUserIds.length) return { sent: 0 };

    const { data: preferences } = await client.from("user_notification_preferences")
      .select("user_id, callup_push_enabled")
      .in("user_id", adminUserIds);
    const disabled = new Set((preferences || [])
      .filter((item) => item.callup_push_enabled === false)
      .map((item) => item.user_id));
    const recipients = adminUserIds.filter((userId) => !disabled.has(userId));

    return sendPushNotificationsToUsers(client, recipients, {
      title: "Saída da convocação",
      body: `${player?.name || "Um jogador"} saiu da convocação. Confira a lista atualizada.`,
      tag: `callup-withdrawal-admin-${callupId}-${playerId}`,
      url: `/convocacao?callup=${encodeURIComponent(callupId)}`,
    }, "/convocacao");
  } catch (error) {
    console.error("Falha ao avisar os ADMs sobre a saída da convocação:", error);
    return { sent: 0, failed: 1 };
  }
}

export async function notifyCartolaLineupsAboutWithdrawal(
  fallbackClient: SupabaseClient,
  callupId: string,
  playerId: string,
) {
  try {
    const client = createServiceClient() || fallbackClient;
    const { data: callup } = await client.from("callups").select("round_id").eq("id", callupId).maybeSingle();
    if (!callup?.round_id) return { sent: 0 };
    const [{ data: player }, { data: fantasyRound }] = await Promise.all([
      client.from("players").select("name").eq("id", playerId).maybeSingle(),
      client.from("fantasy_rounds").select("id, market_status").eq("round_id", callup.round_id).maybeSingle(),
    ]);
    if (!fantasyRound || fantasyRound.market_status !== "open") return { sent: 0 };
    const { data: lineups } = await client.from("fantasy_lineups").select("id, user_id").eq("fantasy_round_id", fantasyRound.id);
    const lineupIds = (lineups || []).map((lineup) => lineup.id);
    if (!lineupIds.length) return { sent: 0 };
    const [{ data: starters }, { data: reserves }] = await Promise.all([
      client.from("fantasy_lineup_players").select("lineup_id").in("lineup_id", lineupIds).eq("player_id", playerId),
      client.from("fantasy_lineup_reserves").select("lineup_id").in("lineup_id", lineupIds).eq("player_id", playerId),
    ]);
    const affectedLineups = new Set([...(starters || []), ...(reserves || [])].map((item) => item.lineup_id));
    const affectedUserIds = [...new Set((lineups || []).filter((lineup) => affectedLineups.has(lineup.id)).map((lineup) => lineup.user_id))];
    if (!affectedUserIds.length) return { sent: 0 };
    const { data: preferences } = await client.from("user_notification_preferences")
      .select("user_id, cartola_push_enabled").in("user_id", affectedUserIds);
    const disabled = new Set((preferences || []).filter((item) => item.cartola_push_enabled === false).map((item) => item.user_id));
    const recipients = affectedUserIds.filter((userId) => !disabled.has(userId));
    return sendPushNotificationsToUsers(client, recipients, {
      title: "Troque um atleta no Cartola",
      body: `${player?.name || "Um jogador da sua escalação"} saiu da convocação. Substitua antes do mercado fechar.`,
      tag: `cartola-withdrawal-${callupId}-${playerId}`,
      url: `/cartola?substituir=${encodeURIComponent(playerId)}`,
    }, "/cartola");
  } catch (error) {
    console.error("Falha ao avisar escalações afetadas pela saída:", error);
    return { sent: 0, failed: 1 };
  }
}

export async function notifyCallupWithdrawal(
  fallbackClient: SupabaseClient,
  callupId: string,
  playerId: string,
) {
  const [admins, cartola] = await Promise.all([
    notifyCallupAdminsAboutWithdrawal(fallbackClient, callupId, playerId),
    notifyCartolaLineupsAboutWithdrawal(fallbackClient, callupId, playerId),
  ]);
  return { admins, cartola };
}
