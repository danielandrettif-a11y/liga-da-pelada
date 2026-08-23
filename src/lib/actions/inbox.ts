"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import { getActiveLeague } from "./rounds";
import { getActiveSeason } from "./seasons";

export type InboxNotification = { id: string; title: string; body: string; href: string; state: "active" | "resolved"; read_at: string | null; created_at: string; updated_at: string };

export async function getMyInboxNotifications(): Promise<InboxNotification[]> {
  const account = await getCurrentAccount();
  if (!account.user) return [];
  try {
    const league = await getActiveLeague();
    const season = await getActiveSeason(league.id);
    if (!season) return [];
    const maxPlayers = league.players_per_team || 5;
    const { data: fantasySeason } = await account.client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle();
    const desired: Array<{ type: string; key: string; title: string; body: string; href: string }> = [
      {
        type: "tactical_revolution_r2",
        key: `announcement:tactical_r2:${league.id}`,
        title: "🚨 Novas Regras a partir da Rodada 02: Bônus por Posição!",
        body: "Zagueiros (DEF) agora ganham até +2 pts por jogo sem levar gols, Meias (MEI/ALA) ganham +4,5 por assistência e Atacantes (ATA) +6 por gol. Atualize a tag do seu perfil em 'Meu Perfil' para pontuar com os bônus!",
        href: "/meu-perfil",
      },
    ];
    if (fantasySeason) {
      const { data: round } = await account.client.from("fantasy_rounds").select("id, round_id, market_status, round:round_id(number)").eq("fantasy_season_id", fantasySeason.id).eq("market_status", "open").maybeSingle();
      if (round) {
        const { data: lineup } = await account.client.from("fantasy_lineups").select("captain_player_id, top_scorer_player_id, top_assist_player_id, fantasy_lineup_players(player_id)").eq("fantasy_round_id", round.id).eq("user_id", account.user.id).maybeSingle();
        const count = lineup?.fantasy_lineup_players?.length || 0;
        desired.push({ type: "fantasy_market_open", key: `market:${round.id}`, title: "Escalação disponível", body: `A Rodada ${(round.round as any)?.number || ""} está com mercado aberto.`, href: "/cartola" });
        if (count < maxPlayers) desired.push({ type: "fantasy_lineup_incomplete", key: `lineup:${round.id}`, title: "Falta escalar o Cartola", body: `Você escolheu ${count} de ${maxPlayers} jogadores.`, href: "/cartola" });
        if (count === maxPlayers && !lineup?.captain_player_id) desired.push({ type: "fantasy_captain_missing", key: `captain:${round.id}`, title: "Escolha seu capitão", body: "Sua escalação está pronta, mas ainda falta definir o capitão.", href: "/cartola" });
        if (!lineup?.top_scorer_player_id || !lineup?.top_assist_player_id) desired.push({ type: "fantasy_predictions_missing", key: `predictions:${round.id}`, title: "Palpites pendentes", body: "Você ainda pode enviar os palpites de artilheiro e garçom.", href: "/cartola" });
      }
    }
    const keys = new Set(desired.map((item) => item.key));
    if (desired.length) {
      // Busca notificações existentes para não resetar read_at de quem já leu
      const { data: existing } = await account.client
        .from("user_inbox_notifications")
        .select("dedupe_key, read_at, state")
        .eq("user_id", account.user.id)
        .in("dedupe_key", Array.from(keys));

      const existingMap = new Map((existing || []).map((item: any) => [item.dedupe_key, item]));

      const toUpsert = desired
        .filter((item) => {
          const ex = existingMap.get(item.key);
          // Se já foi lido e resolvido, não reabre
          return !ex || !ex.read_at;
        })
        .map((item) => ({
          user_id: account.user!.id,
          league_id: league.id,
          notification_type: item.type,
          dedupe_key: item.key,
          title: item.title,
          body: item.body,
          href: item.href,
          state: "active",
          read_at: null,
          resolved_at: null,
        }));

      if (toUpsert.length) {
        await account.client.from("user_inbox_notifications").upsert(toUpsert, { onConflict: "user_id,dedupe_key" });
      }
    }
    const { data: activeNotifications } = await account.client.from("user_inbox_notifications").select("id, dedupe_key").eq("user_id", account.user.id).eq("state", "active");
    const staleIds = (activeNotifications || []).filter((item) => !keys.has(item.dedupe_key)).map((item) => item.id);
    if (staleIds.length) await account.client.from("user_inbox_notifications").update({ state: "resolved", resolved_at: new Date().toISOString() }).in("id", staleIds);
    const { data } = await account.client.from("user_inbox_notifications").select("id, title, body, href, state, read_at, created_at, updated_at").eq("user_id", account.user.id).order("updated_at", { ascending: false }).limit(30);
    return (data || []) as InboxNotification[];
  } catch (error) {
    console.error("Erro ao carregar notificações do inbox:", error);
    return [];
  }
}

export async function markInboxRead(ids?: string[]) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false };
  let query = account.client
    .from("user_inbox_notifications")
    .update({ read_at: new Date().toISOString(), state: "resolved", resolved_at: new Date().toISOString() })
    .eq("user_id", account.user.id);
  if (ids?.length) {
    query = query.in("id", ids);
  } else {
    query = query.is("read_at", null);
  }
  const { error } = await query;
  revalidatePath("/");
  return { success: !error };
}
