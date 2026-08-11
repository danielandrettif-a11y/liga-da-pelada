"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { supabase } from "../supabase";
import type { CreateMatchInput, RegisterGoalInput, SubstituteMatchPlayerInput } from "../types";
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
    .select("round_id, team_a_id, team_b_id, score_a, score_b, status, timer_started_at, timer_accumulated_seconds, eligibility_elapsed_offset_seconds, duration_seconds")
    .eq("id", matchId)
    .single();

  if (error || !data) throw new Error("Partida não encontrada");
  return data;
}

export async function createMatch(input: CreateMatchInput) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };

    if (!input.round_id || !input.team_a_id || !input.team_b_id || input.team_a_id === input.team_b_id) {
      return { success: false, error: "Selecione dois times diferentes." };
    }

    const selectedTeamIds = [input.team_a_id, input.team_b_id];
    const replacements = input.replacements || [];
    if (replacements.length > 30) return { success: false, error: "Quantidade de substitutos invalida." };

    const [{ data: round, error: roundError }, { data: teams, error: teamsError }, { data: roundPlayers, error: roundPlayersError }] = await Promise.all([
      client.from("rounds").select("id, status, league:league_id (match_duration)").eq("id", input.round_id).single(),
      client.from("teams").select("id, team_players (player_id)").eq("round_id", input.round_id),
      client.from("round_players").select("player_id, availability_status").eq("round_id", input.round_id),
    ]);

    if (roundError || !round) throw new Error("Rodada nao encontrada.");
    if (teamsError || !teams) throw new Error("Nao foi possivel carregar os times.");
    if (roundPlayersError || !roundPlayers) throw new Error("Nao foi possivel carregar os jogadores da rodada.");
    if (round.status === "finished") return { success: false, error: "A rodada ja foi encerrada." };

    const selectedTeams = teams.filter((team: any) => selectedTeamIds.includes(team.id));
    if (selectedTeams.length !== 2) return { success: false, error: "Os times precisam pertencer a esta rodada." };

    const availability = new Map(roundPlayers.map((entry: any) => [entry.player_id, entry.availability_status]));
    const originalTeamByPlayer = new Map<string, string>();
    for (const team of teams as any[]) {
      for (const teamPlayer of team.team_players || []) originalTeamByPlayer.set(teamPlayer.player_id, team.id);
    }

    const unavailableByTeam = new Map<string, Set<string>>();
    for (const team of selectedTeams as any[]) {
      unavailableByTeam.set(team.id, new Set(
        (team.team_players || [])
          .map((entry: any) => entry.player_id)
          .filter((playerId: string) => availability.get(playerId) === "injured"),
      ));
    }

    const usedAbsentPlayers = new Set<string>();
    const usedReplacementPlayers = new Set<string>();
    for (const replacement of replacements) {
      if (!selectedTeamIds.includes(replacement.team_id)) {
        return { success: false, error: "O time do emprestimo nao participa desta partida." };
      }
      if (!unavailableByTeam.get(replacement.team_id)?.has(replacement.absent_player_id)) {
        return { success: false, error: "O emprestimo precisa ocupar a vaga de um jogador machucado." };
      }
      if (usedAbsentPlayers.has(replacement.absent_player_id) || usedReplacementPlayers.has(replacement.replacement_player_id)) {
        return { success: false, error: "Um jogador nao pode ocupar duas vagas na mesma partida." };
      }

      const originalTeamId = originalTeamByPlayer.get(replacement.replacement_player_id);
      if (!originalTeamId || selectedTeamIds.includes(originalTeamId)) {
        return { success: false, error: "O substituto precisa ser de um time que esteja aguardando." };
      }
      if (availability.get(replacement.replacement_player_id) !== "available") {
        return { success: false, error: "O substituto escolhido nao esta disponivel." };
      }
      usedAbsentPlayers.add(replacement.absent_player_id);
      usedReplacementPlayers.add(replacement.replacement_player_id);
    }

    const { data: liveMatches, error: liveMatchesError } = await client
      .from("matches")
      .select("id, team_a_id, team_b_id")
      .eq("round_id", input.round_id)
      .eq("status", "live");
    if (liveMatchesError) throw new Error(liveMatchesError.message);
    if ((liveMatches || []).some((match: any) =>
      selectedTeamIds.includes(match.team_a_id) || selectedTeamIds.includes(match.team_b_id)
    )) {
      return { success: false, error: "Um dos times selecionados ja esta em outra partida ao vivo." };
    }

    const proposedPlayerIds = new Set<string>(usedReplacementPlayers);
    for (const team of selectedTeams as any[]) {
      for (const teamPlayer of team.team_players || []) {
        if (availability.get(teamPlayer.player_id) !== "injured") proposedPlayerIds.add(teamPlayer.player_id);
      }
    }
    const liveMatchIds = (liveMatches || []).map((match: any) => match.id);
    if (liveMatchIds.length > 0 && proposedPlayerIds.size > 0) {
      const { data: busyPlayers, error: busyPlayersError } = await client
        .from("match_players")
        .select("player_id")
        .in("match_id", liveMatchIds)
        .in("player_id", [...proposedPlayerIds])
        .eq("is_active", true);
      if (busyPlayersError) throw new Error(busyPlayersError.message);
      if (busyPlayers?.length) {
        return { success: false, error: "Um dos jogadores escalados ja esta em outra partida ao vivo." };
      }
    }

    const leagueConfig = Array.isArray(round.league) ? round.league[0] : round.league;
    const durationMinutes = Number((leagueConfig as any)?.match_duration || 7);
    const durationSeconds = Math.max(60, Math.round(durationMinutes * 60));

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
        started_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const lineupRows: Array<Record<string, unknown>> = [];
    for (const team of selectedTeams as any[]) {
      for (const teamPlayer of team.team_players || []) {
        if (availability.get(teamPlayer.player_id) !== "injured") {
          lineupRows.push({
            match_id: data.id,
            player_id: teamPlayer.player_id,
            team_id: team.id,
            original_team_id: team.id,
            is_starter: true,
            is_active: true,
            result_eligible: true,
            entered_elapsed_seconds: 0,
          });
        }
      }
    }
    for (const replacement of replacements) {
      lineupRows.push({
        match_id: data.id,
        player_id: replacement.replacement_player_id,
        team_id: replacement.team_id,
        original_team_id: originalTeamByPlayer.get(replacement.replacement_player_id),
        is_starter: true,
        is_active: true,
        result_eligible: true,
        entered_elapsed_seconds: 0,
      });
    }

    if (lineupRows.length > 0) {
      const { error: lineupError } = await client.from("match_players").insert(lineupRows);
      if (lineupError) {
        await client.from("matches").delete().eq("id", data.id);
        throw new Error(`Erro ao salvar a escalacao: ${lineupError.message}`);
      }
    }

    if (round.status === "draft") {
      await client.from("rounds").update({ status: "active" }).eq("id", input.round_id);
    }

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
          goalkeeper_order,
          players (*)
        )
      ),
      team_b:team_b_id (
        *,
        team_players (
          player_id,
          goalkeeper_order,
          players (*)
        )
      ),
      match_players (
        *,
        player:player_id (*),
        original_team:original_team_id (id, name, color)
      ),
      match_events (
        *,
        player:player_id (*),
        assist_player:assist_player_id (*)
      ),
      match_substitutions (
        *,
        player_out:player_out_id (*),
        player_in:player_in_id (*),
        player_in_original_team:player_in_original_team_id (id, name, color)
      ),
      round:round_id (
        round_players (
          player_id,
          availability_status,
          players (*)
        ),
        teams (
          id,
          name,
          color,
          team_players (player_id, goalkeeper_order)
        )
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
  if (data.match_substitutions) {
    data.match_substitutions.sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  return data;
}

export async function registerGoal(input: RegisterGoalInput) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };

    const match = await getMatchState(client, input.match_id);
    if (match.status !== "live") return { success: false, error: "A partida nao esta em andamento." };
    if (input.team_id !== match.team_a_id && input.team_id !== match.team_b_id) {
      return { success: false, error: "O time informado nao participa da partida." };
    }

    const participantIds = [input.player_id, input.assist_player_id].filter(Boolean) as string[];
    if (new Set(participantIds).size !== participantIds.length) {
      return { success: false, error: "O autor do gol nao pode dar assistencia para si mesmo." };
    }
    const { data: activeParticipants, error: participantsError } = await client
      .from("match_players")
      .select("player_id")
      .eq("match_id", input.match_id)
      .eq("team_id", input.team_id)
      .eq("is_active", true)
      .in("player_id", participantIds);

    if (participantsError) throw new Error(participantsError.message);
    if ((activeParticipants || []).length !== participantIds.length) {
      return { success: false, error: "Gol e assistencia so podem ser registrados para jogadores em campo." };
    }

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

export async function substituteMatchPlayer(input: SubstituteMatchPlayerInput) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    if (!input.match_id || !input.team_id || !input.player_out_id) {
      return { success: false, error: "Preencha os dados da substituicao." };
    }

    const { data, error } = await client.rpc("substitute_match_player", {
      p_match_id: input.match_id,
      p_team_id: input.team_id,
      p_player_out_id: input.player_out_id,
      p_player_in_id: input.player_in_id || null,
      p_reason: input.reason,
      p_mark_injured: Boolean(input.mark_injured),
    });

    if (error) throw new Error(error.message);
    const match = await getMatchState(client, input.match_id);
    revalidatePath(`/partidas/${input.match_id}`);
    revalidatePath(`/rodadas/${match.round_id}`);
    revalidatePath(`/rodadas/${match.round_id}/nova-partida`);
    return { success: true, substitutionId: data };
  } catch (err: any) {
    console.error("Erro ao substituir jogador:", err);
    return { success: false, error: err.message };
  }
}

export async function undoLastMatchSubstitution(substitutionId: string, matchId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    if (!substitutionId || !matchId) return { success: false, error: "Substituicao invalida." };

    const { error } = await client.rpc("undo_last_match_substitution", {
      p_substitution_id: substitutionId,
    });
    if (error) throw new Error(error.message);

    const match = await getMatchState(client, matchId);
    revalidatePath(`/partidas/${matchId}`);
    revalidatePath(`/rodadas/${match.round_id}`);
    revalidatePath(`/rodadas/${match.round_id}/nova-partida`);
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao desfazer substituicao:", err);
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
    if (!match) {
      const existingMatch = await getMatchState(client, matchId);
      if (existingMatch.status !== "finished") return { success: false, error: "Nao foi possivel encerrar a partida." };

      const { error: recoveryError } = await client
        .from("match_players")
        .update({ is_active: false })
        .eq("match_id", matchId)
        .eq("is_active", true);
      if (recoveryError) throw new Error(recoveryError.message);
      const recoveryStats = await calculateRoundStats(existingMatch.round_id);
      if (!recoveryStats.success) throw new Error(recoveryStats.error || "Erro ao recalcular estatisticas.");
      return { success: true, alreadyFinished: true, roundId: existingMatch.round_id };
    }

    revalidatePath(`/partidas/${matchId}`);
    revalidatePath(`/rodadas/${match.round_id}`);
    revalidatePath("/ranking");

    const { error: participantsFinishError } = await client
      .from("match_players")
      .update({ is_active: false })
      .eq("match_id", matchId)
      .eq("is_active", true);
    if (participantsFinishError) throw new Error(participantsFinishError.message);
    
    // Atualiza as estatísticas de todos os jogadores da rodada
    const statsResult = await calculateRoundStats(match.round_id);
    if (!statsResult.success) throw new Error(statsResult.error || "Erro ao recalcular estatisticas.");

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
    if (match.status !== "live") return { success: false, error: "A partida nao esta em andamento." };

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

    const match = await getMatchState(client, matchId);
    if (match.status !== "live") return { success: false, error: "A partida nao esta em andamento." };

    let displayedElapsed = match.timer_accumulated_seconds || 0;
    if (match.timer_started_at) {
      displayedElapsed += Math.max(
        0,
        Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000),
      );
    }
    const eligibilityOffset = (match.eligibility_elapsed_offset_seconds || 0) + displayedElapsed;

    const { error } = await client
      .from("matches")
      .update({ 
        timer_accumulated_seconds: 0,
        timer_started_at: null,
        eligibility_elapsed_offset_seconds: eligibilityOffset,
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
