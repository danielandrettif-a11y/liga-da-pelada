"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { supabase } from "../supabase";
import type { CreateMatchInput, RegisterGoalInput } from "../types";
import { calculateRoundStats } from "./stats";
import { getAdminClient } from "../auth";
import { sendMatchFinishedNotifications } from "../push-notifications";

const ADMIN_ERROR = "Somente administradores podem alterar a partida.";

async function getMatchState(
  client: NonNullable<Awaited<ReturnType<typeof getAdminClient>>>,
  matchId: string,
) {
  const { data, error } = await client
    .from("matches")
    .select("round_id, team_a_id, score_a, score_b, timer_started_at, timer_accumulated_seconds")
    .eq("id", matchId)
    .single();

  if (error || !data) throw new Error("Partida não encontrada");
  return data;
}

export async function createMatch(input: CreateMatchInput) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };

    const { data, error } = await client
      .from("matches")
      .insert({
        round_id: input.round_id,
        team_a_id: input.team_a_id,
        team_b_id: input.team_b_id,
        match_order: input.match_order || 1,
        status: "live",
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
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };

    // 1. Inserir o evento de gol
    const { error: eventError } = await client
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
    const match = await getMatchState(client, input.match_id);

    const isTeamA = match.team_a_id === input.team_id;
    const newScoreA = isTeamA ? match.score_a + 1 : match.score_a;
    const newScoreB = !isTeamA ? match.score_b + 1 : match.score_b;

    const { error: updateError } = await client
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
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };

    const { error } = await client
      .from("match_events")
      .delete()
      .eq("id", eventId);

    if (error) throw new Error(error.message);

    // Subtrair 1 do placar
    const match = await getMatchState(client, matchId);

    const isTeamA = match.team_a_id === teamId;
    const newScoreA = isTeamA ? Math.max(0, match.score_a - 1) : match.score_a;
    const newScoreB = !isTeamA ? Math.max(0, match.score_b - 1) : match.score_b;

    const { error: updateError } = await client
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
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };

    const { data: match, error } = await client
      .from("matches")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
        timer_started_at: null,
      })
      .eq("id", matchId)
      .neq("status", "finished")
      .select(`
        id,
        round_id,
        score_a,
        score_b,
        team_a:team_a_id (name),
        team_b:team_b_id (name)
      `)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!match) return { success: true, alreadyFinished: true };

    revalidatePath(`/partidas/${matchId}`);
    revalidatePath(`/rodadas/${match.round_id}`);
    revalidatePath("/ranking");
    
    // Atualiza as estatísticas de todos os jogadores da rodada
    await calculateRoundStats(match.round_id);

    // Envia depois da resposta para não atrasar o encerramento da partida.
    // Os destinatários são as contas vinculadas aos jogadores inscritos na rodada.
    after(async () => {
      try {
        await sendMatchFinishedNotifications(client, match);
      } catch (notificationError) {
        console.error("Erro ao notificar fim de partida:", notificationError);
      }
    });
    
    return { success: true, roundId: match.round_id };
  } catch (err: any) {
    console.error("Erro ao finalizar partida:", err);
    return { success: false, error: err.message };
  }
}

export async function updateMatchTimer(matchId: string, action: "start" | "pause") {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };

    const match = await getMatchState(client, matchId);

    if (action === "start") {
      const { error } = await client
        .from("matches")
        .update({ timer_started_at: new Date().toISOString() })
        .eq("id", matchId);
      if (error) throw new Error(error.message);
    } else if (action === "pause") {
      if (match.timer_started_at) {
        const elapsed = Math.floor((new Date().getTime() - new Date(match.timer_started_at).getTime()) / 1000);
        const newAccumulated = (match.timer_accumulated_seconds || 0) + elapsed;
        
        const { error } = await client
          .from("matches")
          .update({ 
            timer_accumulated_seconds: newAccumulated,
            timer_started_at: null 
          })
          .eq("id", matchId);
        if (error) throw new Error(error.message);
      }
    }

    revalidatePath(`/partidas/${matchId}`);
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao atualizar timer:", err);
    return { success: false, error: err.message };
  }
}

export async function resetMatchTimer(matchId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };

    const { error } = await client
      .from("matches")
      .update({ 
        timer_accumulated_seconds: 0,
        timer_started_at: null 
      })
      .eq("id", matchId);
      
    if (error) throw new Error(error.message);

    revalidatePath(`/partidas/${matchId}`);
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao resetar timer:", err);
    return { success: false, error: err.message };
  }
}
