"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import { getActiveLeague } from "./rounds";
import { getActiveSeason } from "./seasons";
import { buildAwardSeasonsByPlayer } from "../awards";

export type InboxNotification = { id: string; title: string; body: string; href: string; notification_type?: string; state: "active" | "resolved"; read_at: string | null; created_at: string; updated_at: string };

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
      body: "Pontuação atualizada: DEF soma proteção base + bônus na vaga; MEI e ATA ativam bônus na posição correta; GOL premia o clean sheet de quem você apostou no rodízio. Confira o Guia de Pontuação!",
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

    // Recompensas do Passe: uma notificação por escolha pendente e por pacote entregue.
    if (fantasySeason) {
      const [{ data: pass }, { data: rewards }, { data: choices }, { data: passPacks }] = await Promise.all([
        account.client.from("fantasy_season_passes").select("progress").eq("fantasy_season_id", fantasySeason.id).eq("user_id", account.user.id).maybeSingle(),
        account.client.from("fantasy_season_pass_rewards").select("id, house, reward_type, card_tier").eq("fantasy_season_id", fantasySeason.id),
        account.client.from("fantasy_user_cosmetic_reward_choices").select("reward_id").eq("user_id", account.user.id),
        account.client.from("fantasy_round_packs").select("id, status, fantasy_season_pass_reward_id, card_tier").eq("user_id", account.user.id).eq("source", "season_pass").in("status", ["available", "opened"]),
      ]);
      const chosen = new Set((choices || []).map((choice: any) => choice.reward_id));
      for (const reward of rewards || []) {
        if (reward.reward_type === "cosmetic_choice" && Number(reward.house) <= Number(pass?.progress || 0) && !chosen.has(reward.id)) desired.push({ type: "fantasy_pass_cosmetic_reward", key: `pass:reward:${reward.id}`, title: "✨ Recompensa do Passe liberada", body: `A casa ${reward.house} abriu uma escolha cosmética para o seu perfil.`, href: `/jogadores?tab=passe&reward=${reward.id}` });
      }
      for (const pack of passPacks || []) desired.push({ type: "fantasy_pass_pack", key: `pass:pack:${pack.id}`, title: "🎴 Pacote do Passe disponível", body: `Seu pacote ${pack.card_tier === "gold" ? "Ouro" : "Bronze"} está pronto para abrir no Cartola.`, href: `/cartola?pack=${pack.id}` });
    }

    // Prêmios individuais da Ranked: o inbox registra uma mensagem permanente
    // por prêmio e rodada. A chave única evita duplicar ao recarregar a página.
    if (account.profile?.player_id) {
      const { data: awardRounds } = await account.client
        .from("rounds")
        .select("id, number, date, season_id, best_goalkeeper_player_id")
        .eq("season_id", season.id)
        .eq("round_type", "official")
        .eq("status", "finished")
        .order("number", { ascending: false });
      if (awardRounds?.length) {
        const { data: awardStats } = await account.client
          .from("player_round_stats")
          .select("round_id, player_id, goals, assists, games, defensive_clean_games, defensive_one_goal_games, team_goals_conceded, player:player_id(player_profile, member_category, is_selectable)")
          .in("round_id", awardRounds.map((round) => round.id));
        const playerAwards = buildAwardSeasonsByPlayer(
          awardRounds.map((round) => ({
            id: round.id,
            number: round.number,
            date: round.date,
            seasonId: season.id,
            seasonNumber: season.number,
            seasonStatus: season.status,
            bestGoalkeeperPlayerId: round.best_goalkeeper_player_id,
          })),
          (awardStats || []).map((stat: any) => ({
            ...stat,
            player: Array.isArray(stat.player) ? stat.player[0] || null : stat.player,
          })),
        ).get(account.profile.player_id)?.flatMap((item) => item.awards) || [];
        const awardCopy = {
          topScorer: { title: "⚽ Você foi o Artilheiro da Rodada", body: "Você terminou a rodada como o maior goleador da Ranked." },
          topAssister: { title: "🎯 Você foi o Garçom da Rodada", body: "Você terminou a rodada com o maior número de assistências." },
          bestDefender: { title: "🛡️ Você foi o Xerife da Rodada", body: "Você teve a melhor média defensiva entre os atletas DEF." },
        } as const;
        for (const award of playerAwards) {
          if (!(award.type in awardCopy)) continue;
          const copy = awardCopy[award.type as keyof typeof awardCopy];
          desired.push({
            type: `player_award_${award.type}`,
            key: `award:${award.type}:${award.roundId}:${account.profile.player_id}`,
            title: copy.title,
            body: `${copy.body} Rodada ${String(award.roundNumber).padStart(2, "0")}.`,
            href: `/rodadas/${award.roundId}`,
          });
        }
      }
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
      .select("id, title, body, href, notification_type, state, read_at, created_at, updated_at")
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
