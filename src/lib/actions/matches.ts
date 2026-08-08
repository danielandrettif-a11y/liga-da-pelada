"use server";

import { revalidatePath } from "next/cache";

import { supabase } from "../supabase";
import type { CreateMatchInput, RegisterGoalInput } from "../types";
import { calculateRoundStats } from "./stats";

export async function createMatch(input: CreateMatchInput) {
  try {
    const { data, error } = await supabase
      .from("matches")
      .insert({
        round_id: input.round_id,
        team_a_id: input.team_a_id,
        team_b_id: input.team_b_id,
        match_order: input.match_order || 1,
        status: "in_progress",
        score_a: 0,
        score_b: 0,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    revalidatePath(`/rodadas/${input.round_id}`);
    return { success: true, matchId: data.id };
  } catch (err: any) {
    console.error("Erro ao criar partida:", err);
    return { success: false, error: err.message };
  }
}

export async function getMatch(matchId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select(`
      *,
      team_a:team_a_id (
        *,
        team_players (
          player_id,
          players (*)
        )
      ),
      team_b:team_b_id (
        *,
        team_players (
          player_id,
          players (*)
        )
      ),
      match_events (
        *,
        player:player_id (*),
        assist_player:assist_player_id (*)
      )
    `)
    .eq("id", matchId)
    .single();

  if (error) {
    console.error("Erro ao buscar partida:", error);
    return null;
  }

  // Ordenar eventos do mais recente pro mais antigo
  if (data.match_events) {
    data.match_events.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  return data;
}

export async function registerGoal(input: RegisterGoalInput) {
  try {
    // 1. Inserir o evento de gol
    const { error: eventError } = await supabase
      .from("match_events")
      .insert({
        match_id: input.match_id,
        player_id: input.player_id,
        assist_player_id: input.assist_player_id || null,
        team_id: input.team_id,
        event_type: "goal",
        minute: input.minute || null,
      });

    if (eventError) throw new Error(eventError.message);

    // 2. Atualizar o placar da partida
    const match = await getMatch(input.match_id);
    if (!match) throw new Error("Partida não encontrada");

    const isTeamA = match.team_a_id === input.team_id;
    const newScoreA = isTeamA ? match.score_a + 1 : match.score_a;
    const newScoreB = !isTeamA ? match.score_b + 1 : match.score_b;

    const { error: updateError } = await supabase
      .from("matches")
      .update({
        score_a: newScoreA,
        score_b: newScoreB,
      })
      .eq("id", input.match_id);

    if (updateError) throw new Error(updateError.message);

    revalidatePath(`/partidas/${input.match_id}`);
    revalidatePath(`/rodadas/${match.round_id}`);
    
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao registrar gol:", err);
    return { success: false, error: err.message };
  }
}

export async function deleteEvent(eventId: string, matchId: string, teamId: string) {
  try {
    const { error } = await supabase
      .from("match_events")
      .delete()
      .eq("id", eventId);

    if (error) throw new Error(error.message);

    // Subtrair 1 do placar
    const match = await getMatch(matchId);
    if (!match) throw new Error("Partida não encontrada");

    const isTeamA = match.team_a_id === teamId;
    const newScoreA = isTeamA ? Math.max(0, match.score_a - 1) : match.score_a;
    const newScoreB = !isTeamA ? Math.max(0, match.score_b - 1) : match.score_b;

    const { error: updateError } = await supabase
      .from("matches")
      .update({
        score_a: newScoreA,
        score_b: newScoreB,
      })
      .eq("id", matchId);

    if (updateError) throw new Error(updateError.message);

    revalidatePath(`/partidas/${matchId}`);
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao deletar evento:", err);
    return { success: false, error: err.message };
  }
}

export async function finishMatch(matchId: string) {
  try {
    const { data: match, error } = await supabase
      .from("matches")
      .update({ status: "finished" })
      .eq("id", matchId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    revalidatePath(`/partidas/${matchId}`);
    revalidatePath(`/rodadas/${match.round_id}`);
    
    // Atualiza as estatísticas de todos os jogadores da rodada
    await calculateRoundStats(match.round_id);
    
    return { success: true, roundId: match.round_id };
  } catch (err: any) {
    console.error("Erro ao finalizar partida:", err);
    return { success: false, error: err.message };
  }
}
