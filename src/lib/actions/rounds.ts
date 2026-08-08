"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";

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
  const { data, error } = await supabase
    .from("rounds")
    .select(`
      *,
      round_players (count),
      matches (count)
    `)
    .order("number", { ascending: false });

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
      teams (
        *,
        team_players (
          player_id,
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

export type TeamInput = {
  name: string;
  color: string;
  playerIds: string[];
};

export async function createRoundWithTeams(date: string, teams: TeamInput[]) {
  try {
    const league = await getActiveLeague();

    // 1. Descobrir o número da nova rodada (maior number + 1)
    const { data: lastRound } = await supabase
      .from("rounds")
      .select("number")
      .eq("league_id", league.id)
      .order("number", { ascending: false })
      .limit(1)
      .single();

    const nextNumber = lastRound ? lastRound.number + 1 : 1;

    // 2. Criar a rodada
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .insert({
        league_id: league.id,
        number: nextNumber,
        date,
        status: "draft",
      })
      .select()
      .single();

    if (roundError) throw new Error(`Erro ao criar rodada: ${roundError.message}`);

    // 3. Obter todos os jogadores únicos selecionados
    const allPlayerIds = Array.from(new Set(teams.flatMap(t => t.playerIds)));

    // 4. Inserir round_players
    if (allPlayerIds.length > 0) {
      const { error: rpError } = await supabase
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
    for (const team of teams) {
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .insert({
          round_id: round.id,
          name: team.name,
          color: team.color,
        })
        .select()
        .single();

      if (teamError) throw new Error(`Erro ao criar time ${team.name}: ${teamError.message}`);

      if (team.playerIds.length > 0) {
        const { error: tpError } = await supabase
          .from("team_players")
          .insert(
            team.playerIds.map(pid => ({
              team_id: teamData.id,
              player_id: pid,
            }))
          );
        if (tpError) throw new Error(`Erro ao vincular jogadores ao time ${team.name}: ${tpError.message}`);
      }
    }

    revalidatePath("/rodadas");
    return { success: true, roundId: round.id };

  } catch (err: any) {
    console.error("Erro em createRoundWithTeams:", err);
    return { success: false, error: err.message };
  }
}

export async function finishRound(roundId: string) {
  try {
    const { error } = await supabase
      .from("rounds")
      .update({ status: "finished" })
      .eq("id", roundId);

    if (error) throw new Error(error.message);

    // Recalcula estatísticas por precaução
    const { calculateRoundStats } = await import("./stats");
    await calculateRoundStats(roundId);

    revalidatePath(`/rodadas/${roundId}`);
    revalidatePath("/rodadas");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao encerrar rodada:", err);
    return { success: false, error: err.message };
  }
}
