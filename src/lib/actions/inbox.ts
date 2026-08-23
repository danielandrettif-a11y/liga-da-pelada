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

    const [{ data: testSession }, { data: fantasySeason }] = await Promise.all([
      account.client
        .from("fantasy_test_sessions")
        .select("id, round_id, status, round:round_id(number, date)")
        .eq("league_id", league.id)
        .eq("season_id", season.id)
        .in("status", ["open", "in_progress"])
        .maybeSingle(),
      account.client
        .from("fantasy_seasons")
        .select("id")
        .eq("season_id", season.id)
        .maybeSingle(),
    ]);

    const { data: officialRounds } = fantasySeason
      ? await account.client
          .from("fantasy_rounds")
          .select("id, round_id, market_status, round:round_id(number, date, status)")
          .eq("fantasy_season_id", fantasySeason.id)
          .in("market_status", ["open", "in_progress"])
          .order("created_at", { ascending: false })
      : { data: [] as any[] };

    const activeRound = testSession
      ? {
          id: testSession.id,
          roundId: testSession.round_id,
          isTest: true,
          roundNumber: (testSession.round as any)?.number,
          status: testSession.status,
        }
      : officialRounds?.[0]
      ? {
          id: officialRounds[0].id,
          roundId: officialRounds[0].round_id,
          isTest: false,
          roundNumber: (officialRounds[0].round as any)?.number,
          status: officialRounds[0].market_status,
        }
      : null;

    const desired: Array<{ type: string; key: string; title: string; body: string; href: string }> = [];

    // Notificação educativa de introdução aos novos bônus
    desired.push({
      type: "tactical_revolution_r2",
      key: `announcement:tactical_r2:${league.id}`,
      title: "⚡ Bônus de Posição Ativos no Cartola!",
      body: "Zaga com Clean Sheet Regressivo (+4/+2 pts), Meia com Assistência turbinada (+4 pts) e Atacante com Artilharia (+3 pts extras). Confira no Guia de Pontuação!",
      href: "/cartola",
    });

    let count = 0;
    let captainId: string | null = null;
    let topScorerId: string | null = null;
    let topAssistId: string | null = null;

    if (activeRound?.isTest) {
      const { data: testLineup } = await account.client
        .from("fantasy_test_lineups")
        .select("captain_player_id, top_scorer_player_id, top_assist_player_id, fantasy_test_lineup_players(player_id)")
        .eq("test_session_id", activeRound.id)
        .eq("user_id", account.user.id)
        .maybeSingle();

      count = testLineup?.fantasy_test_lineup_players?.length || 0;
      captainId = testLineup?.captain_player_id || null;
      topScorerId = testLineup?.top_scorer_player_id || null;
      topAssistId = testLineup?.top_assist_player_id || null;
    } else if (activeRound) {
      const { data: lineup } = await account.client
        .from("fantasy_lineups")
        .select("captain_player_id, top_scorer_player_id, top_assist_player_id, fantasy_lineup_players(player_id)")
        .eq("fantasy_round_id", activeRound.id)
        .eq("user_id", account.user.id)
        .maybeSingle();

      count = lineup?.fantasy_lineup_players?.length || 0;
      captainId = lineup?.captain_player_id || null;
      topScorerId = lineup?.top_scorer_player_id || null;
      topAssistId = lineup?.top_assist_player_id || null;
    } else if (fantasySeason) {
      const { data: portfolio } = await account.client
        .from("fantasy_portfolios")
        .select("captain_player_id, fantasy_portfolio_players(player_id)")
        .eq("fantasy_season_id", fantasySeason.id)
        .eq("user_id", account.user.id)
        .maybeSingle();

      count = portfolio?.fantasy_portfolio_players?.length || 0;
      captainId = portfolio?.captain_player_id || null;
    }

    const roundIdRef = activeRound ? activeRound.id : fantasySeason?.id || "portfolio";
    const roundNumberStr = activeRound?.roundNumber ? ` da Rodada ${activeRound.roundNumber}` : "";

    // 1. Falta escalar ou escalação incompleta
    if (count < maxPlayers) {
      desired.push({
        type: "fantasy_lineup_incomplete",
        key: `cartola:lineup:incomplete:${roundIdRef}`,
        title: count === 0 ? "⚽ Escale seu time no Cartola" : "⚽ Escalação Incompleta",
        body:
          count === 0
            ? `O mercado${roundNumberStr} está aberto! Escale seus ${maxPlayers} jogadores para pontuar.`
            : `Você escolheu ${count} de ${maxPlayers} jogadores. Complete seu time antes do mercado fechar!`,
        href: "/cartola",
      });
    }

    // 2. Falta definir o capitão (sempre que tiver atletas escalados e capitão vazio)
    if (count >= 1 && !captainId) {
      desired.push({
        type: "fantasy_captain_missing",
        key: `cartola:captain:missing:${roundIdRef}`,
        title: "👑 Falta definir o Capitão",
        body: "Sua escalação no Cartola está sem capitão! O capitão multiplica todos os pontos por 1.5x.",
        href: "/cartola",
      });
    }

    // 3. Faltam os palpites da rodada
    if (activeRound && count >= 1 && (!topScorerId || !topAssistId)) {
      const missingBoth = !topScorerId && !topAssistId;
      desired.push({
        type: "fantasy_predictions_missing",
        key: `cartola:predictions:missing:${activeRound.id}`,
        title: "🎯 Palpites da Rodada Pendentes",
        body: missingBoth
          ? "Envie seus palpites de Artilheiro e Garçom da rodada (+3.0 pts extras em cada)."
          : !topScorerId
          ? "Falta enviar seu palpite de Artilheiro da rodada (+3.0 pts extras)."
          : "Falta enviar seu palpite de Garçom da rodada (+3.0 pts extras).",
        href: "/cartola",
      });
    }

    const keys = new Set(desired.map((item) => item.key));

    // Buscar notificações existentes para nunca reabrir notificações já lidas/dispensadas pelo usuário
    const { data: existing } = await account.client
      .from("user_inbox_notifications")
      .select("id, dedupe_key, read_at, state")
      .eq("user_id", account.user.id)
      .in("dedupe_key", Array.from(keys));

    const existingMap = new Map((existing || []).map((item: any) => [item.dedupe_key, item]));

    // Criar apenas as que não existem ou que não foram resolvidas/lidas
    const toInsert = desired
      .filter((item) => {
        const ex = existingMap.get(item.key);
        // Se já existe e o usuário já marcou como lido/resolvido, não reabrir
        if (ex && (ex.read_at || ex.state === "resolved")) {
          return false;
        }
        return !ex;
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

    if (toInsert.length) {
      await account.client
        .from("user_inbox_notifications")
        .upsert(toInsert, { onConflict: "user_id,dedupe_key" });
    }

    // Resolver notificações ativas que já foram solucionadas (ex: usuário escolheu o capitão)
    const { data: activeNotifications } = await account.client
      .from("user_inbox_notifications")
      .select("id, dedupe_key")
      .eq("user_id", account.user.id)
      .eq("state", "active");

    const staleIds = (activeNotifications || [])
      .filter((item) => !keys.has(item.dedupe_key))
      .map((item) => item.id);

    if (staleIds.length) {
      await account.client
        .from("user_inbox_notifications")
        .update({ state: "resolved", resolved_at: new Date().toISOString() })
        .in("id", staleIds);
    }

    const { data } = await account.client
      .from("user_inbox_notifications")
      .select("id, title, body, href, state, read_at, created_at, updated_at")
      .eq("user_id", account.user.id)
      .order("updated_at", { ascending: false })
      .limit(30);

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
  revalidatePath("/notificacoes");
  return { success: !error };
}
