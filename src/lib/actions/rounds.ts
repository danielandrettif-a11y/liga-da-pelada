"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getActiveSeason } from "./seasons";
import { createClient as createServerClient } from "../supabase/server";
import { getAdminClient } from "../auth";
import type { RoundType } from "../types";
import {
  DEFAULT_PLAYERS_PER_TEAM,
  MAX_PLAYERS_PER_TEAM,
  MAX_TEAMS_PER_ROUND,
  MIN_TEAMS_PER_ROUND,
  TEAMS_PER_ROUND,
} from "../constants";
import { drawGoalkeeperOrder } from "../goalkeeperOrder";
import { TEAM_CREST_URLS } from "../teamPresets";

export async function getActiveLeague() {
  const { data, error } = await supabase
    .from("leagues")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) {
    // Para o MVP, se não tiver liga ativa, pegamos a primeira que existir
    const { data: fallback, error: err2 } = await supabase
      .from("leagues")
      .select("id")
      .limit(1)
      .single();
    
    if (err2 || !fallback) throw new Error("Nenhuma liga encontrada. Execute as migrations.");
    return fallback;
  }

  return data;
}

export async function getRounds() {
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return [];

  const { data, error } = await supabase
    .from("rounds")
    .select(`
      *,
      round_players (count),
      matches (count)
    `)
    .eq("season_id", season.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar rodadas:", error);
    return [];
  }

  // Transformar o count que vem como array de objetos
  return data.map((round: any) => ({
    ...round,
    playersCount: round.round_players[0]?.count || 0,
    matchesCount: round.matches[0]?.count || 0,
  }));
}

export async function getRound(id: string) {
  const { data, error } = await supabase
    .from("rounds")
    .select(`
      *,
      round_players (
        player_id,
        availability_status,
        availability_updated_at,
        players (*)
      ),
      teams (
        *,
        team_players (
          player_id,
          goalkeeper_order,
          players (*)
        )
      ),
      matches (
        *,
        match_events (*)
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Erro ao buscar rodada:", error);
    return null;
  }

  return data;
}

export async function getNextTeamPresetOffset(roundType: RoundType = "official") {
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return 0;

  const { data, error } = await supabase
    .from("rounds")
    .select("number")
    .eq("league_id", league.id)
    .eq("season_id", season.id)
    .eq("round_type", roundType)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Erro ao calcular rodízio dos clubes:", error);
    return 0;
  }
  return (data?.number || 0) % 4;
}

export type TeamInput = {
  name: string;
  color: string;
  crestUrl?: string | null;
  playerIds: string[];
};

export async function setRoundPlayerAvailability(
  roundId: string,
  playerId: string,
  status: "available" | "injured",
) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem alterar a disponibilidade." };
    if (!roundId || !playerId || !["available", "injured"].includes(status)) {
      return { success: false, error: "Dados de disponibilidade invalidos." };
    }

    const { error } = await client.rpc("set_round_player_availability", {
      p_round_id: roundId,
      p_player_id: playerId,
      p_status: status,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/rodadas/${roundId}`);
    revalidatePath(`/rodadas/${roundId}/nova-partida`);
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao alterar disponibilidade:", err);
    return { success: false, error: err.message };
  }
}

export async function createRoundWithTeams(
  date: string,
  teams: TeamInput[],
  options: { roundType?: RoundType; callupId?: string | null } = {},
) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem criar rodadas." };

    const normalizedTeams = teams.map((team) => ({
      ...team,
      name: team.name.trim(),
      crestUrl: team.crestUrl && TEAM_CREST_URLS.has(team.crestUrl) ? team.crestUrl : null,
    }));
    if (normalizedTeams.some((team) => !team.name)) {
      return { success: false, error: "Todos os times precisam ter um nome." };
    }
    if (normalizedTeams.some((team) => team.name.length > 40)) {
      return { success: false, error: "O nome de cada time deve ter no máximo 40 caracteres." };
    }
    const uniqueNames = new Set(normalizedTeams.map((team) => team.name.toLocaleLowerCase("pt-BR")));
    if (uniqueNames.size !== normalizedTeams.length) {
      return { success: false, error: "Use um nome diferente para cada time." };
    }

    const roundType: RoundType = options.roundType === "friendly" ? "friendly" : "official";
    const rawPlayerIds = normalizedTeams.flatMap((team) => team.playerIds);
    const allPlayerIds = Array.from(new Set(rawPlayerIds));
    if (rawPlayerIds.length !== allPlayerIds.length) {
      return { success: false, error: "Um jogador nao pode aparecer em mais de um time." };
    }
    const league = await getActiveLeague();
    const { data: leagueConfig, error: leagueConfigError } = await client
      .from("leagues")
      .select("players_per_team, teams_per_round")
      .eq("id", league.id)
      .single();
    if (leagueConfigError) throw new Error(`Erro ao consultar configurações da liga: ${leagueConfigError.message}`);
    const playersPerTeam = Math.min(
      MAX_PLAYERS_PER_TEAM,
      Math.max(1, leagueConfig?.players_per_team || DEFAULT_PLAYERS_PER_TEAM),
    );
    const teamsPerRound = Math.min(
      MAX_TEAMS_PER_ROUND,
      Math.max(MIN_TEAMS_PER_ROUND, leagueConfig?.teams_per_round || TEAMS_PER_ROUND),
    );
    if (normalizedTeams.length !== teamsPerRound) {
      return { success: false, error: `Esta liga usa ${teamsPerRound} times por rodada.` };
    }
    if (normalizedTeams.some((team) => team.playerIds.length > playersPerTeam)) {
      return { success: false, error: `Cada time pode ter no máximo ${playersPerTeam} jogadores.` };
    }
    const season = await getActiveSeason(league.id);
    if (!season) throw new Error("Temporada ativa não encontrada. Execute a migration 005.");

    if (allPlayerIds.length > 0) {
      const { data: eligiblePlayers, error: eligibleError } = await client
        .from("players")
        .select("id")
        .in("id", allPlayerIds)
        .eq("is_selectable", true)
        .in("member_category", ["player", "guest"]);
      if (eligibleError || (eligiblePlayers?.length || 0) !== allPlayerIds.length) {
        return { success: false, error: "A lista contem uma pessoa que nao pode participar de partidas." };
      }
    }

    if (options.callupId) {
      const { data: callup, error: callupReadError } = await client
        .from("callups")
        .select("date, round_type, status, capacity, callup_entries(player_id, status)")
        .eq("id", options.callupId)
        .eq("league_id", league.id)
        .single();
      if (callupReadError || !callup || callup.status !== "locked") {
        return { success: false, error: "A convocacao precisa estar bloqueada antes de montar a rodada." };
      }
      const confirmedIds = (callup.callup_entries || [])
        .filter((entry) => entry.status === "confirmed")
        .map((entry) => entry.player_id)
        .sort();
      if (callup.date !== date || callup.round_type !== roundType || confirmedIds.length !== callup.capacity || confirmedIds.join(",") !== [...allPlayerIds].sort().join(",")) {
        return { success: false, error: `Use a data, o tipo e os ${callup.capacity} confirmados da convocacao bloqueada.` };
      }
    }

    // 1. Descobrir o número da nova rodada (maior number + 1)
    const { data: lastRound } = await client
      .from("rounds")
      .select("number")
      .eq("league_id", league.id)
      .eq("season_id", season.id)
      .eq("round_type", roundType)
      .order("number", { ascending: false })
      .limit(1)
      .single();

    const nextNumber = lastRound ? lastRound.number + 1 : 1;

    // 2. Criar a rodada
    const { data: round, error: roundError } = await client
      .from("rounds")
      .insert({
        league_id: league.id,
        season_id: season.id,
        number: nextNumber,
        date,
        status: "draft",
        round_type: roundType,
      })
      .select()
      .single();

    if (roundError) throw new Error(`Erro ao criar rodada: ${roundError.message}`);

    // 3. Obter todos os jogadores únicos selecionados
    // 4. Inserir round_players
    if (allPlayerIds.length > 0) {
      const { error: rpError } = await client
        .from("round_players")
        .insert(
          allPlayerIds.map(playerId => ({
            round_id: round.id,
            player_id: playerId,
          }))
        );
      if (rpError) throw new Error(`Erro ao vincular jogadores: ${rpError.message}`);
    }

    // 5. Inserir times e team_players
    for (const team of normalizedTeams) {
      const { data: teamData, error: teamError } = await client
        .from("teams")
        .insert({
          round_id: round.id,
          name: team.name,
          color: team.color,
          crest_url: team.crestUrl,
        })
        .select()
        .single();

      if (teamError) throw new Error(`Erro ao criar time ${team.name}: ${teamError.message}`);

      if (team.playerIds.length > 0) {
        const goalkeeperOrder = drawGoalkeeperOrder(team.playerIds);
        const { error: tpError } = await client
          .from("team_players")
          .insert(
            goalkeeperOrder.map(({ playerId, order }) => ({
              team_id: teamData.id,
              player_id: playerId,
              goalkeeper_order: order,
            }))
          );
        if (tpError) throw new Error(`Erro ao vincular jogadores ao time ${team.name}: ${tpError.message}`);
      }
    }

    if (options.callupId) {
      const { error: callupError } = await client
        .from("callups")
        .update({ status: "converted", round_id: round.id, updated_at: new Date().toISOString() })
        .eq("id", options.callupId)
        .eq("league_id", league.id)
        .in("status", ["open", "locked"]);
      if (callupError) throw new Error(`Erro ao vincular convocacao: ${callupError.message}`);
    }

    revalidatePath("/rodadas");
    revalidatePath("/convocacao");
    revalidatePath("/", "layout");
    return { success: true, roundId: round.id };

  } catch (err: any) {
    console.error("Erro em createRoundWithTeams:", err);
    return { success: false, error: err.message };
  }
}

export async function finishRound(roundId: string, paymentPix: string, paymentTotal: number) {
  try {
    const pix = paymentPix.trim();
    if (!pix) return { success: false, error: "Informe a chave PIX que recebera os pagamentos." };
    if (pix.length > 200) return { success: false, error: "A chave PIX deve ter no maximo 200 caracteres." };
    const total = Number(paymentTotal);
    if (!Number.isFinite(total) || total <= 0) {
      return { success: false, error: "Informe um valor total valido para a pelada." };
    }

    if (total > 99999999.99) return { success: false, error: "O valor informado e muito alto." };

    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem encerrar rodadas." };

    const { error } = await client
      .from("rounds")
      .update({
        status: "finished",
        payment_pix: pix,
        payment_total: Math.round(total * 100) / 100,
      })
      .eq("id", roundId);

    if (error) throw new Error(error.message);

    // Recalcula estatísticas por precaução
    const { calculateRoundStats } = await import("./stats");
    await calculateRoundStats(roundId);

    revalidatePath(`/rodadas/${roundId}`);
    revalidatePath("/rodadas");
    revalidatePath("/convocacao");
    revalidatePath("/", "layout");
    revalidatePath("/ranking");
    revalidatePath("/pagamentos");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao encerrar rodada:", err);
    return { success: false, error: err.message };
  }
}
