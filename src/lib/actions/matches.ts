"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../supabase";
import type { CreateMatchInput, RegisterGoalInput, SubstituteMatchPlayerInput } from "../types";
import { calculateRoundStats } from "./stats";
import { getAdminClient } from "../auth";
import { sendMatchFinishedNotifications, sendMatchTimerNotifications } from "../push-notifications";
import { scheduleMatchTimerAlerts } from "../match-timer-scheduler";

const ADMIN_ERROR = "Somente administradores podem alterar a partida.";

async function getMatchState(
  client: SupabaseClient,
  matchId: string,
) {
  const { data, error } = await client
    .from("matches")
      .select("id, round_id, team_a_id, team_b_id, score_a, score_b, status, timer_started_at, timer_accumulated_seconds, eligibility_elapsed_offset_seconds, duration_seconds, timer_one_minute_alerted_at, timer_thirty_seconds_alerted_at, timer_finished_alerted_at")
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
    if (!input.goalkeeper_a_id || !input.goalkeeper_b_id || input.goalkeeper_a_id === input.goalkeeper_b_id) {
      return { success: false, error: "Escolha um goleiro diferente para cada time." };
    }

    const selectedTeamIds = [input.team_a_id, input.team_b_id];
    const replacements = input.replacements || [];
    if (replacements.length > 30) return { success: false, error: "Quantidade de substitutos invalida." };

    const [{ data: round, error: roundError }, { data: teams, error: teamsError }, { data: roundPlayers, error: roundPlayersError }] = await Promise.all([
      client.from("rounds").select("id, status, formation_mode, league:league_id (match_duration)").eq("id", input.round_id).single(),
      client.from("teams").select("id, position, team_players (player_id)").eq("round_id", input.round_id),
      client.from("round_players").select("player_id, availability_status, attendance_status, attendance_order").eq("round_id", input.round_id),
    ]);

    if (roundError || !round) throw new Error("Rodada nao encontrada.");
    if (teamsError || !teams) throw new Error("Nao foi possivel carregar os times.");
    if (roundPlayersError || !roundPlayers) throw new Error("Nao foi possivel carregar os jogadores da rodada.");
    if (round.status === "finished") return { success: false, error: "A rodada ja foi encerrada." };

    const selectedTeams = teams.filter((team: any) => selectedTeamIds.includes(team.id));
    if (selectedTeams.length !== 2) return { success: false, error: "Os times precisam pertencer a esta rodada." };

    const availability = new Map(roundPlayers.map((entry: any) => [entry.player_id, entry.availability_status]));
    const attendance = new Map(roundPlayers.map((entry: any) => [entry.player_id, entry.attendance_status]));
    // `formation_mode` distingue apenas manual/automático. A ordem de
    // chegada é identificada pelos registros efetivamente ordenados; assim,
    // sorteios aleatório/equilibrado não bloqueiam o terceiro time.
    const usesAttendance = round.formation_mode !== "manual"
      && roundPlayers.some((entry: any) => entry.attendance_order != null);
    const { data: previousMatches, error: previousMatchesError } = await client
      .from("matches")
      .select("team_a_id, team_b_id, status, match_order, created_at")
      .eq("round_id", input.round_id)
      .order("match_order", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    if (previousMatchesError) throw new Error(previousMatchesError.message);
    const previousMatch = previousMatches?.[0];
    if (!previousMatch && usesAttendance) {
      const firstTeamIds = teams.filter((team: any) => team.position <= 2).map((team: any) => team.id);
      if (firstTeamIds.length !== 2 || firstTeamIds.some((id: string) => !selectedTeamIds.includes(id))) {
        return { success: false, error: "A primeira partida precisa ser disputada pelos dois times titulares." };
      }
    }
    const originalTeamByPlayer = new Map<string, string>();
    for (const team of teams as any[]) {
      for (const teamPlayer of team.team_players || []) originalTeamByPlayer.set(teamPlayer.player_id, team.id);
    }

    const unavailableByTeam = new Map<string, Set<string>>();
    for (const team of selectedTeams as any[]) {
      unavailableByTeam.set(team.id, new Set(
        (team.team_players || [])
          .map((entry: any) => entry.player_id)
          .filter((playerId: string) => availability.get(playerId) === "injured" || (usesAttendance && attendance.get(playerId) !== "present")),
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
      const previousTeamIds = previousMatch ? [previousMatch.team_a_id, previousMatch.team_b_id] : [];
      const outgoingTeamIds = previousTeamIds.filter((id) => !selectedTeamIds.includes(id));
      if (!originalTeamId || selectedTeamIds.includes(originalTeamId)
        || (previousMatch && !outgoingTeamIds.includes(originalTeamId))) {
        return { success: false, error: "O substituto precisa vir do time que acabou de sair." };
      }
      if (availability.get(replacement.replacement_player_id) !== "available"
        || (usesAttendance && attendance.get(replacement.replacement_player_id) !== "present")) {
        return { success: false, error: "O substituto escolhido nao esta disponivel." };
      }
      usedAbsentPlayers.add(replacement.absent_player_id);
      usedReplacementPlayers.add(replacement.replacement_player_id);
    }
    const missingReplacementCount = [...unavailableByTeam.values()].reduce((total, ids) => total + ids.size, 0) - usedAbsentPlayers.size;
    if (missingReplacementCount > 0) {
      return { success: false, error: `Escolha substitutos para as ${missingReplacementCount} vaga(s) desfalcadas.` };
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
    const effectiveTeamByPlayer = new Map<string, string>();
    for (const team of selectedTeams as any[]) {
      for (const teamPlayer of team.team_players || []) {
        if (availability.get(teamPlayer.player_id) !== "injured" && (!usesAttendance || attendance.get(teamPlayer.player_id) === "present")) {
          proposedPlayerIds.add(teamPlayer.player_id);
          effectiveTeamByPlayer.set(teamPlayer.player_id, team.id);
        }
      }
    }
    for (const replacement of replacements) {
      effectiveTeamByPlayer.set(replacement.replacement_player_id, replacement.team_id);
    }
    if (effectiveTeamByPlayer.get(input.goalkeeper_a_id) !== input.team_a_id
      || effectiveTeamByPlayer.get(input.goalkeeper_b_id) !== input.team_b_id) {
      return { success: false, error: "O goleiro precisa estar escalado pelo time nesta partida." };
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

    const kickoffAt = new Date().toISOString();
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
        started_at: kickoffAt,
        timer_started_at: kickoffAt,
        timer_accumulated_seconds: 0,
        duration_seconds: durationSeconds,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const lineupRows: Array<Record<string, unknown>> = [];
    for (const team of selectedTeams as any[]) {
      for (const teamPlayer of team.team_players || []) {
        if (availability.get(teamPlayer.player_id) !== "injured" && (!usesAttendance || attendance.get(teamPlayer.player_id) === "present")) {
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

    const { error: goalkeeperError } = await client.from("match_goalkeepers").insert([
      { match_id: data.id, team_id: input.team_a_id, player_id: input.goalkeeper_a_id },
      { match_id: data.id, team_id: input.team_b_id, player_id: input.goalkeeper_b_id },
    ]);
    if (goalkeeperError) {
      await client.from("matches").delete().eq("id", data.id);
      throw new Error(`Erro ao salvar os goleiros: ${goalkeeperError.message}`);
    }

    // A partida já nasce com o cronômetro iniciado. Portanto, o agendamento
    // precisa ser criado aqui também; esperar o botão "Iniciar" faria o jogo
    // contar no app, mas deixaria o celular bloqueado sem os dois alertas.
    const scheduling = await scheduleMatchTimerAlerts({
      matchId: data.id,
      durationSeconds,
      accumulatedSeconds: 0,
      startedAt: kickoffAt,
    });
    if (!scheduling.scheduled) {
      await client.from("matches").update({ timer_started_at: null }).eq("id", data.id);
      throw new Error("O agendador da tela bloqueada não está configurado no servidor.");
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
      id,
      round_id,
      team_a_id,
      team_b_id,
      score_a,
      score_b,
      status,
      match_order,
      started_at,
      finished_at,
      timer_started_at,
      timer_accumulated_seconds,
      duration_seconds,
      eligibility_elapsed_offset_seconds,
      created_at,
      team_a:team_a_id (
        id,
        name,
        color,
        crest_url,
        position,
        team_players (
          player_id,
          goalkeeper_order,
          players (id, name, nickname, avatar_url, player_profile, is_goalkeeper)
        )
      ),
      team_b:team_b_id (
        id,
        name,
        color,
        crest_url,
        position,
        team_players (
          player_id,
          goalkeeper_order,
          players (id, name, nickname, avatar_url, player_profile, is_goalkeeper)
        )
      ),
      match_players (
        id,
        match_id,
        player_id,
        team_id,
        original_team_id,
        is_starter,
        is_active,
        result_eligible,
        entered_elapsed_seconds,
        player:player_id (id, name, nickname, avatar_url, player_profile, is_goalkeeper),
        original_team:original_team_id (id, name, color, crest_url)
      ),
      match_events (
        id,
        match_id,
        event_type,
        player_id,
        assist_player_id,
        team_id,
        minute,
        is_own_goal,
        created_at,
        player:player_id (id, name, nickname, avatar_url),
        assist_player:assist_player_id (id, name, nickname, avatar_url)
      ),
      match_substitutions (
        id,
        match_id,
        player_out_id,
        player_in_id,
        player_in_original_team_id,
        team_id,
        elapsed_seconds,
        created_at,
        player_out:player_out_id (id, name, nickname, avatar_url),
        player_in:player_in_id (id, name, nickname, avatar_url),
        player_in_original_team:player_in_original_team_id (id, name, color, crest_url)
      ),
      round:round_id (
        id,
        number,
        date,
        formation_mode,
        round_players (
          player_id,
          availability_status,
          attendance_status,
          players (id, name, nickname, avatar_url, player_profile, is_goalkeeper)
        ),
        teams (
          id,
          name,
          color,
          crest_url,
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
    if (!input.match_id || !input.team_id || !input.player_id) {
      return { success: false, error: "Dados do gol incompletos." };
    }

    const { data, error } = await client.rpc("register_goal", {
      p_match_id: input.match_id,
      p_player_id: input.player_id,
      p_team_id: input.team_id,
      p_assist_player_id: input.assist_player_id || null,
      p_minute: input.minute ?? null,
      p_idempotency_key: input.idempotency_key || null,
      p_is_own_goal: Boolean(input.is_own_goal),
    });

    if (error) throw new Error(error.message);

    const result = data as {
      event_id: string;
      idempotent: boolean;
      score_a: number;
      score_b: number;
      round_id?: string;
    } | null;

    revalidatePath(`/partidas/${input.match_id}`);
    if (result?.round_id) {
      revalidatePath(`/rodadas/${result.round_id}`);
    }

    return {
      success: true,
      eventId: result?.event_id,
      idempotent: result?.idempotent,
      scoreA: result?.score_a,
      scoreB: result?.score_b,
    };
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
    if (input.player_in_id) {
      const { data: incoming, error: incomingError } = await client
        .from("matches")
        .select("round:round_id (formation_mode, round_players!inner(player_id, attendance_status))")
        .eq("id", input.match_id)
        .eq("round.round_players.player_id", input.player_in_id)
        .single();
      if (incomingError || !incoming) return { success: false, error: "Substituto nao encontrado nesta rodada." };
      const incomingRound = Array.isArray(incoming.round) ? incoming.round[0] : incoming.round;
      const incomingEntry = (incomingRound as any)?.round_players?.find((entry: any) => entry.player_id === input.player_in_id);
      if ((incomingRound as any)?.formation_mode !== "manual" && incomingEntry?.attendance_status !== "present") {
        return { success: false, error: "O substituto ainda nao foi marcado como presente." };
      }
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

export async function deleteEvent(eventId: string, matchId: string, teamId?: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    if (!eventId || !matchId) {
      return { success: false, error: "Identificadores inválidos para exclusão do evento." };
    }

    const { data, error } = await client.rpc("delete_match_event", {
      p_event_id: eventId,
      p_match_id: matchId,
    });

    if (error) throw new Error(error.message);

    const result = data as {
      deleted: boolean;
      score_a: number;
      score_b: number;
      round_id?: string;
    } | null;

    revalidatePath(`/partidas/${matchId}`);
    if (result?.round_id) {
      revalidatePath(`/rodadas/${result.round_id}`);
    }

    return {
      success: true,
      scoreA: result?.score_a,
      scoreB: result?.score_b,
    };
  } catch (err: any) {
    console.error("Erro ao deletar evento:", err);
    return { success: false, error: err.message };
  }
}

export async function correctFinishedGoal(eventId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    const { data, error } = await client.rpc("correct_finished_goal", { p_event_id: eventId });
    if (error) throw new Error(error.message);
    const result = data as { round_id?: string; match_id?: string } | null;
    if (!result?.round_id || !result.match_id) throw new Error("A correção não retornou a rodada afetada.");

    const statsResult = await calculateRoundStats(result.round_id);
    if (!statsResult.success) throw new Error(statsResult.error || "Não foi possível recalcular as estatísticas.");

    const { data: fantasyRound } = await client.from("fantasy_rounds").select("id").eq("round_id", result.round_id).maybeSingle();
    if (fantasyRound) {
      const { error: fantasyError } = await client.rpc("reprocess_fantasy_from_round", { p_round_id: result.round_id });
      if (fantasyError) throw new Error(`Gol corrigido, mas o Cartola precisa ser reprocessado: ${fantasyError.message}`);
    }

    revalidatePath(`/partidas/${result.match_id}`);
    revalidatePath(`/rodadas/${result.round_id}`);
    revalidatePath("/ranking");
    revalidatePath("/cartola", "layout");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao corrigir gol finalizado:", err);
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
      const startedAt = new Date().toISOString();

      // O agendamento precisa terminar dentro desta requisição. Em servidores
      // próprios, uma tarefa deixada para depois da resposta pode ser encerrada
      // antes de chegar ao QStash, justamente quando o celular é bloqueado.
      const scheduling = await scheduleMatchTimerAlerts({
        matchId,
        durationSeconds: Number(match.duration_seconds || 420),
        accumulatedSeconds: Number(match.timer_accumulated_seconds || 0),
        startedAt,
      });
      if (!scheduling.scheduled) {
        throw new Error("O agendador da tela bloqueada não está configurado no servidor.");
      }

      const { error } = await client
        .from("matches")
        .update({ timer_started_at: startedAt })
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
        timer_one_minute_alerted_at: null,
        timer_thirty_seconds_alerted_at: null,
        timer_finished_alerted_at: null,
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

export async function addMatchExtraTime(matchId: string, extraSeconds: number) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };

    const match = await getMatchState(client, matchId);
    if (match.status !== "live") return { success: false, error: "A partida não está em andamento." };

    const currentDuration = Number(match.duration_seconds || 420);
    const newDuration = Math.max(60, currentDuration + extraSeconds);

    if (match.timer_started_at) {
      const scheduling = await scheduleMatchTimerAlerts({
        matchId,
        durationSeconds: newDuration,
        accumulatedSeconds: Number(match.timer_accumulated_seconds || 0),
        startedAt: match.timer_started_at,
      });
      if (!scheduling.scheduled) {
        throw new Error("O agendador da tela bloqueada não está configurado no servidor.");
      }
    }

    const { error } = await client
      .from("matches")
      .update({
        duration_seconds: newDuration,
        timer_one_minute_alerted_at: null,
        timer_thirty_seconds_alerted_at: null,
        timer_finished_alerted_at: null,
      })
      .eq("id", matchId);

    if (error) throw new Error(error.message);
    revalidatePath(`/partidas/${matchId}`);
    return { success: true, newDuration };
  } catch (err: any) {
    console.error("Erro ao adicionar acréscimo:", err);
    return { success: false, error: err.message };
  }
}

export async function notifyMatchTimerThreshold(
  matchId: string,
  threshold: "one_minute" | "thirty_seconds" | "finished",
) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: ADMIN_ERROR };
  return dispatchMatchTimerThreshold(client, matchId, threshold);
}

/** Usado pelo webhook do agendador, sem depender de um navegador aberto. */
export async function dispatchMatchTimerThreshold(
  client: SupabaseClient,
  matchId: string,
  threshold: "one_minute" | "thirty_seconds" | "finished",
) {
  try {
    const match = await getMatchState(client, matchId);
    if (match.status !== "live" || !match.timer_started_at) {
      return { success: true, skipped: true, reason: "inactive" as const };
    }

    const elapsed = (match.timer_accumulated_seconds || 0)
      + Math.max(0, Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000));
    const secondsLeft = Math.max(0, Number(match.duration_seconds || 420) - elapsed);
    // Caso o navegador fique em segundo plano, ele pode acordar diretamente
    // em 00:00. Ainda entregamos o aviso de 30s em vez de perdê-lo.
    const shouldSend = threshold === "one_minute"
      ? secondsLeft <= 60 + 4
      : threshold === "thirty_seconds"
        ? secondsLeft <= 30 + 4
        : secondsLeft <= 4;
    if (!shouldSend) {
      return {
        success: true,
        skipped: true,
        reason: "too_early" as const,
        secondsLeft,
      };
    }

    const now = new Date().toISOString();
    const updates = threshold === "one_minute"
      ? { timer_one_minute_alerted_at: now }
      : threshold === "thirty_seconds"
        ? { timer_thirty_seconds_alerted_at: now }
        : { timer_finished_alerted_at: now };
    const alertColumn = threshold === "one_minute"
      ? "timer_one_minute_alerted_at"
      : threshold === "thirty_seconds"
        ? "timer_thirty_seconds_alerted_at"
        : "timer_finished_alerted_at";
    const { data: claimed, error } = await client
      .from("matches")
      .update(updates)
      .eq("id", matchId)
      .is(alertColumn, null)
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
    if (!claimed) return { success: true, skipped: true };

    // Diferente do fim manual da partida, estes gatilhos vêm do timer do
    // navegador. Esperamos o envio terminar para não marcar o alerta como
    // entregue caso a execução em segundo plano seja interrompida.
    try {
      const delivery = await sendMatchTimerNotifications(client, claimed, threshold);
      if (delivery.disabled || (delivery.sent === 0 && delivery.failed > 0)) {
        throw new Error(delivery.disabled
          ? "As chaves VAPID não estão configuradas no servidor."
          : "Nenhuma notificação pôde ser entregue.");
      }
    } catch (notificationError) {
      await client
        .from("matches")
        .update({ [alertColumn]: null })
        .eq("id", matchId)
        .eq(alertColumn, now);
      throw notificationError;
    }

    return { success: true, sent: true };
  } catch (err: any) {
    console.error("Erro ao enviar alerta do cronometro:", err);
    return { success: false, error: err.message };
  }
}
