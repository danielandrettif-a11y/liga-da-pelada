"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "../supabase/server";
import { getSelectedLeague } from "../league-context";
import type { CreateMatchInput, RegisterGoalInput, SubstituteMatchPlayerInput } from "../types";
import { calculateRoundStats } from "./stats";
import { getAdminClient, getCurrentAccount } from "../auth";
import { getAllPlayersEquippedCosmeticsMap } from "./cosmetics";
import { sendMatchFinishedNotifications, sendMatchTimerNotifications } from "../push-notifications";
import { scheduleMatchTimerAlerts } from "../match-timer-scheduler";
import { buildStructuralLoans } from "../underfilled-rounds";
import { canTeamLendToMatch } from "../substitution-draw";
import { shouldExcludeReplacementScoring } from "../scoring-eligibility";
import { refreshFluidOverallSafely } from "./overall";
import { registerLiveGoal } from "@/modules/matches/application/register-live-goal";
import { finishSelectedMatch } from "@/modules/matches/application/finish-match";
import { getMatchState } from "@/modules/matches/infrastructure/match-scope";
import { GoalWriteError, supabaseGoalGateway } from "@/modules/matches/infrastructure/supabase-goal-gateway";
import { httpGoalGateway } from "@/modules/matches/infrastructure/http-goal-gateway";
import { supabaseFinishMatchGateway } from "@/modules/matches/infrastructure/supabase-finish-match-gateway";
import { chooseFixedGoalkeeper, switchMatchGoalkeeper } from "@/modules/matches/application/manage-goalkeepers";
import { supabaseGoalkeeperGateway } from "@/modules/matches/infrastructure/supabase-goalkeeper-gateway";
import { substitutePlayerInMatch } from "@/modules/matches/application/substitute-match-player";
import { supabaseMatchSubstitutionGateway } from "@/modules/matches/infrastructure/supabase-match-substitution-gateway";
import { undoMatchSubstitution } from "@/modules/matches/application/undo-match-substitution";
import { supabaseUndoMatchSubstitutionGateway } from "@/modules/matches/infrastructure/supabase-undo-match-substitution-gateway";
import { deleteLiveGoal } from "@/modules/matches/application/delete-live-goal";
import { supabaseDeleteGoalGateway } from "@/modules/matches/infrastructure/supabase-delete-goal-gateway";
import { correctFinishedGoalInMatch } from "@/modules/matches/application/correct-finished-goal";
import { supabaseFinishedGoalCorrectionGateway } from "@/modules/matches/infrastructure/supabase-finished-goal-correction-gateway";
import type { FinishedGoalCorrectionInput } from "@/modules/matches/domain/finished-goal-correction";
import { supabaseCreateMatchGateway, type MatchLineupCommand } from "@/modules/matches/infrastructure/supabase-create-match-gateway";
import { measureMatchStep } from "../match-performance";

const ADMIN_ERROR = "Somente administradores podem alterar a partida.";

export async function findLiveMatchForTeams(roundId: string, teamAId: string, teamBId: string) {
  const league = await getSelectedLeague();
  if (!league || !roundId || !teamAId || !teamBId || teamAId === teamBId) return null;
  const client = await createServerClient();
  const { data: round, error: roundError } = await client.from("rounds")
    .select("league_id").eq("id", roundId).single();
  if (roundError || round?.league_id !== league.id) return null;
  const { data, error } = await client.from("matches")
    .select("id, team_a_id, team_b_id, timer_started_at, match_players(player_id), match_goalkeepers(player_id)")
    .eq("round_id", roundId).eq("status", "live");
  if (error) throw new Error(error.message);
  return (data || []).find((item) =>
    item.timer_started_at
    && item.match_players.length > 0
    && item.match_goalkeepers.length === 2
    && ((item.team_a_id === teamAId && item.team_b_id === teamBId)
      || (item.team_a_id === teamBId && item.team_b_id === teamAId)))?.id || null;
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
    const structuralLoanOverrides = input.structural_loan_overrides || [];
    const structuralLoanExcludedPlayerIds = input.structural_loan_excluded_player_ids || [];
    if (replacements.length > 30) return { success: false, error: "Quantidade de substitutos invalida." };
    if (structuralLoanOverrides.length > 12 || structuralLoanExcludedPlayerIds.length > 30) {
      return { success: false, error: "Quantidade de trocas de empréstimo inválida." };
    }

    const [
      { data: round, error: roundError },
      { data: teams, error: teamsError },
      { data: roundPlayers, error: roundPlayersError },
      { data: previousMatches, error: previousMatchesError },
      { data: liveMatches, error: liveMatchesError },
      selectedLeague,
    ] = await Promise.all([
      client.from("rounds").select("*, league:league_id (match_duration, players_per_team)").eq("id", input.round_id).single(),
      client.from("teams").select("id, position, name, fixed_goalkeeper_player_id, team_players (*)").eq("round_id", input.round_id),
      client.from("round_players").select("player_id, availability_status, attendance_status, attendance_order").eq("round_id", input.round_id),
      client.from("matches")
        .select("team_a_id, team_b_id, status, match_order, created_at, match_players(player_id, team_id, original_team_id)")
        .eq("round_id", input.round_id)
        .order("match_order", { ascending: false })
        .order("created_at", { ascending: false }),
      client.from("matches")
        .select("id, team_a_id, team_b_id")
        .eq("round_id", input.round_id)
        .eq("status", "live"),
      getSelectedLeague(),
    ]);

    if (roundError || !round) throw new Error("Rodada nao encontrada.");
    if (!selectedLeague || round.league_id !== selectedLeague.id) {
      return { success: false, error: "Rodada fora da pelada selecionada." };
    }
    if (teamsError || !teams) throw new Error("Nao foi possivel carregar os times.");
    if (roundPlayersError || !roundPlayers) throw new Error("Nao foi possivel carregar os jogadores da rodada.");
    if (previousMatchesError) throw new Error(previousMatchesError.message);
    if (liveMatchesError) throw new Error(liveMatchesError.message);
    if (round.status === "finished") return { success: false, error: "A rodada ja foi encerrada." };
    const replacementsDoNotScore = shouldExcludeReplacementScoring(round.number);

    const selectedTeams = teams.filter((team: any) => selectedTeamIds.includes(team.id));
    if (selectedTeams.length !== 2) return { success: false, error: "Os times precisam pertencer a esta rodada." };

    const availability = new Map(roundPlayers.map((entry: any) => [entry.player_id, entry.availability_status]));
    const attendance = new Map(roundPlayers.map((entry: any) => [entry.player_id, entry.attendance_status]));
    // Presença controla os desfalques. O bloqueio dos dois primeiros times é
    // uma regra separada e exclusiva do sorteio por ordem de chegada.
    const tracksAttendance = round.formation_mode !== "manual";
    const usesArrivalOrder = round.arrival_order_enabled === true;
    const previousMatch = previousMatches?.[0];
    if (!previousMatch && usesArrivalOrder) {
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
          .filter((playerId: string) => availability.get(playerId) === "injured" || (tracksAttendance && attendance.get(playerId) !== "present")),
      ));
    }

    const usedAbsentPlayers = new Set<string>();
    const usedReplacementPlayers = new Set<string>();
    const forcedGoalkeeperByTeam = new Map<string, string>();
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
      if (!canTeamLendToMatch(originalTeamId, selectedTeamIds)) {
        return { success: false, error: "O substituto precisa vir de um time que não participa desta partida." };
      }
      if (availability.get(replacement.replacement_player_id) !== "available"
        || (tracksAttendance && attendance.get(replacement.replacement_player_id) !== "present")) {
        return { success: false, error: "O substituto escolhido nao esta disponivel." };
      }
      usedAbsentPlayers.add(replacement.absent_player_id);
      usedReplacementPlayers.add(replacement.replacement_player_id);
      if (!forcedGoalkeeperByTeam.has(replacement.team_id)) {
        forcedGoalkeeperByTeam.set(replacement.team_id, replacement.replacement_player_id);
      }
    }
    const missingReplacementCount = [...unavailableByTeam.values()].reduce((total, ids) => total + ids.size, 0) - usedAbsentPlayers.size;
    if (missingReplacementCount > 0) {
      return { success: false, error: `Escolha substitutos para as ${missingReplacementCount} vaga(s) desfalcadas.` };
    }

    const leagueConfig = Array.isArray(round.league) ? round.league[0] : round.league;
    const targetPlayersPerTeam = Math.max(1, Number(round.target_players_per_team || (leagueConfig as any)?.players_per_team || 6));
    if (selectedTeams.some((team: any) => (team.team_players || []).length > targetPlayersPerTeam)) {
      return { success: false, error: `Um dos times possui mais de ${targetPlayersPerTeam} jogadores.` };
    }
    const previousLoanCount = new Map<string, number>();
    for (const previous of previousMatches || []) {
      for (const player of (previous as any).match_players || []) {
        if (player.original_team_id && player.team_id !== player.original_team_id) {
          previousLoanCount.set(player.player_id, (previousLoanCount.get(player.player_id) || 0) + 1);
        }
      }
    }
    const preferredPlayerBySlot = new Map<string, string>();
    for (const override of structuralLoanOverrides) {
      if (!selectedTeamIds.includes(override.target_team_id) || !Number.isInteger(override.rotation_order) || override.rotation_order < 1) {
        return { success: false, error: "A troca de empréstimo enviada é inválida." };
      }
      const slotKey = `${override.target_team_id}:${override.rotation_order}`;
      if (preferredPlayerBySlot.has(slotKey)) return { success: false, error: "Uma vaga de empréstimo foi enviada duas vezes." };
      preferredPlayerBySlot.set(slotKey, override.player_id);
    }
    const validLenderPlayerIds = new Set((teams as any[])
      .filter((team) => !selectedTeamIds.includes(team.id))
      .flatMap((team) => (team.team_players || []).map((entry: any) => entry.player_id)));
    if (structuralLoanExcludedPlayerIds.some((playerId) => !validLenderPlayerIds.has(playerId))) {
      return { success: false, error: "A lista de jogadores que recusaram o empréstimo é inválida." };
    }
    const reservedStructuralPlayers = new Set([...usedReplacementPlayers, ...structuralLoanExcludedPlayerIds]);
    const structuralLoans = buildStructuralLoans({
      teams: (teams as any[]).map((team) => ({
        id: team.id,
        position: Number(team.position || 0),
        players: (team.team_players || []).map((entry: any, index: number) => ({
          playerId: entry.player_id,
          loanOrder: Number(entry.loan_order || entry.goalkeeper_order || index + 1),
          eligible: availability.get(entry.player_id) === "available"
            && (!tracksAttendance || attendance.get(entry.player_id) === "present"),
        })),
      })),
      selectedTeamIds,
      targetPlayersPerTeam,
      previousLoanCount,
      reservedPlayerIds: reservedStructuralPlayers,
      preferredPlayerBySlot,
    });
    const structuralShortage = (selectedTeams as any[]).reduce(
      (total, team) => total + Math.max(0, targetPlayersPerTeam - (team.team_players || []).length),
      0,
    );
    if (structuralLoans.length !== structuralShortage) {
      return { success: false, error: `O time de fora nao possui jogadores disponiveis suficientes para completar ${targetPlayersPerTeam}x${targetPlayersPerTeam}.` };
    }
    if (structuralLoanOverrides.some((override) => !structuralLoans.some((loan) =>
      loan.targetTeamId === override.target_team_id
      && loan.rotationOrder === override.rotation_order
      && loan.playerId === override.player_id
    ))) {
      return { success: false, error: "O jogador escolhido não está disponível para este empréstimo." };
    }

    if ((liveMatches || []).some((match: any) =>
      selectedTeamIds.includes(match.team_a_id) || selectedTeamIds.includes(match.team_b_id)
    )) {
      return { success: false, error: "Um dos times selecionados ja esta em outra partida ao vivo." };
    }

    const proposedPlayerIds = new Set<string>(usedReplacementPlayers);
    const effectiveTeamByPlayer = new Map<string, string>();
    for (const team of selectedTeams as any[]) {
      for (const teamPlayer of team.team_players || []) {
        if (availability.get(teamPlayer.player_id) !== "injured" && (!tracksAttendance || attendance.get(teamPlayer.player_id) === "present")) {
          proposedPlayerIds.add(teamPlayer.player_id);
          effectiveTeamByPlayer.set(teamPlayer.player_id, team.id);
        }
      }
    }
    for (const replacement of replacements) {
      effectiveTeamByPlayer.set(replacement.replacement_player_id, replacement.team_id);
    }
    for (const loan of structuralLoans) {
      proposedPlayerIds.add(loan.playerId);
      effectiveTeamByPlayer.set(loan.playerId, loan.targetTeamId);
    }
    if (effectiveTeamByPlayer.get(input.goalkeeper_a_id) !== input.team_a_id
      || effectiveTeamByPlayer.get(input.goalkeeper_b_id) !== input.team_b_id) {
      return { success: false, error: "O goleiro precisa estar escalado pelo time nesta partida." };
    }
    for (const team of selectedTeams as any[]) {
      const fixedPlayerId = team.fixed_goalkeeper_player_id;
      if (!fixedPlayerId || effectiveTeamByPlayer.get(fixedPlayerId) !== team.id) continue;
      const selectedGoalkeeperId = team.id === input.team_a_id ? input.goalkeeper_a_id : input.goalkeeper_b_id;
      if (selectedGoalkeeperId !== fixedPlayerId) {
        return { success: false, error: `O goleiro fixo do ${team.name} está disponível e deve iniciar no gol.` };
      }
    }
    for (const [teamId, replacementPlayerId] of forcedGoalkeeperByTeam) {
      const selectedGoalkeeperId = teamId === input.team_a_id ? input.goalkeeper_a_id : input.goalkeeper_b_id;
      if (selectedGoalkeeperId !== replacementPlayerId) {
        return {
          success: false,
          error: replacementsDoNotScore
            ? "O substituto do jogador ausente precisa iniciar no gol e não pontua nesta partida."
            : "O substituto do jogador ausente precisa iniciar no gol nesta partida.",
        };
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

    const lineupRows: MatchLineupCommand[] = [];
    for (const team of selectedTeams as any[]) {
      for (const teamPlayer of team.team_players || []) {
        if (availability.get(teamPlayer.player_id) !== "injured" && (!tracksAttendance || attendance.get(teamPlayer.player_id) === "present")) {
          lineupRows.push({
            player_id: teamPlayer.player_id,
            team_id: team.id,
            original_team_id: team.id,
            participation_kind: "roster",
            absent_player_id: null,
          });
        }
      }
    }
    for (const replacement of replacements) {
      lineupRows.push({
        player_id: replacement.replacement_player_id,
        team_id: replacement.team_id,
        original_team_id: originalTeamByPlayer.get(replacement.replacement_player_id)!,
        participation_kind: "replacement",
        absent_player_id: replacement.absent_player_id,
      });
    }
    for (const loan of structuralLoans) {
      lineupRows.push({
        player_id: loan.playerId,
        team_id: loan.targetTeamId,
        original_team_id: loan.originalTeamId,
        participation_kind: "structural",
        absent_player_id: null,
      });
    }

    const goalkeeperRotationOrder = (teamId: string, playerId: string) => {
      const structural = structuralLoans.find((loan) => loan.targetTeamId === teamId && loan.playerId === playerId);
      if (structural) return structural.rotationOrder;
      const loanStartsGoalkeeperQueue = structuralLoans.some((loan) =>
        loan.targetTeamId === teamId && loan.rotationOrder === 1,
      );
      const absentReplacement = replacements.find((replacement) => replacement.team_id === teamId && replacement.replacement_player_id === playerId);
      const sourcePlayerId = absentReplacement?.absent_player_id || playerId;
      const rotationOrder = Number((selectedTeams as any[])
        .find((team) => team.id === teamId)?.team_players
        ?.find((entry: any) => entry.player_id === sourcePlayerId)?.goalkeeper_order || 0);
      return rotationOrder > 0 ? rotationOrder + (loanStartsGoalkeeperQueue ? 1 : 0) : null;
    };
    const supportsLogicalRotation = Object.prototype.hasOwnProperty.call(round, "target_players_per_team");
    const idempotencyKey = input.idempotency_key?.trim() || crypto.randomUUID();
    const receipt = await measureMatchStep("create_match", "transactional_rpc", () =>
      supabaseCreateMatchGateway(client).create({
        roundId: input.round_id,
        teamAId: input.team_a_id,
        teamBId: input.team_b_id,
        goalkeeperAId: input.goalkeeper_a_id,
        goalkeeperBId: input.goalkeeper_b_id,
        goalkeeperARotationOrder: supportsLogicalRotation
          ? goalkeeperRotationOrder(input.team_a_id, input.goalkeeper_a_id)
          : null,
        goalkeeperBRotationOrder: supportsLogicalRotation
          ? goalkeeperRotationOrder(input.team_b_id, input.goalkeeper_b_id)
          : null,
        lineup: lineupRows,
        idempotencyKey,
        clientStartedAt: input.client_started_at || null,
      }),
    );

    // Alertas externos e invalidações não fazem parte do commit esportivo e
    // não atrasam a abertura da tela ao vivo. Uma repetição idempotente também
    // agenda novamente: os webhooks possuem trava de entrega por partida/marco.
    after(async () => {
      try {
        const scheduling = await measureMatchStep("create_match", "schedule_timer_alerts", () =>
          scheduleMatchTimerAlerts({
            matchId: receipt.match_id,
            durationSeconds: receipt.duration_seconds,
            accumulatedSeconds: 0,
            startedAt: receipt.kickoff_at,
          }),
        );
        if (!scheduling.scheduled) {
          console.error("Alertas da partida não foram agendados; a partida continua disponível no app.");
        }
      } catch (schedulingError) {
        console.error("Erro ao agendar alertas da partida:", schedulingError);
      }
      revalidatePath(`/rodadas/${input.round_id}`);
      // O primeiro apito encerra a janela de desistência da convocação.
      revalidatePath("/", "layout");
      revalidatePath("/convocacao");
      revalidatePath("/mais");
    });
    return {
      success: true,
      matchId: receipt.match_id,
      idempotent: receipt.idempotent,
      receipt,
    };
  } catch (err: any) {
    console.error("Erro ao criar partida:", err);
    const message = String(err?.message || "Não foi possível criar a partida.");
    const uncertain = /fetch failed|failed to fetch|network|econn|socket|aborted|timeout|timed out/i.test(message);
    return { success: false, error: message, uncertain };
  }
}

export async function getMatch(matchId: string) {
  const league = await getSelectedLeague();
  if (!league) return null;
  const client = await createServerClient();
  const { data, error } = await client
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
        *,
        player:player_id (id, name, nickname, avatar_url),
        assist_player:assist_player_id (id, name, nickname, avatar_url)
      ),
      match_goalkeeper_stints (
        id, match_id, team_id, player_id, entered_elapsed_seconds, left_elapsed_seconds, selected_at
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
      round:round_id!inner(
        id,
        league_id,
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
    .eq("round.league_id", league.id)
    .maybeSingle();

  if (error || !data) {
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

  // A fonte das capas equipadas é a mesma view usada pelas cartas de jogador.
  // Usar os IDs da partida inclui empréstimos e substituições, não só os
  // jogadores originalmente escalados no time.
  const playerIds = [...new Set(
    (data.match_players || [])
      .map((matchPlayer: any) => matchPlayer.player_id)
      .filter(Boolean),
  )];
  const player_cosmetics: Record<string, { bannerAssetKey: string | null; frameKey: string | null; auraKey: string | null }> = {};

  // Fonte principal: a seleção atual feita pelo usuário no perfil/Cartola,
  // vinculada à conta e à temporada ativa.
  const selectedCosmetics = await getAllPlayersEquippedCosmeticsMap(playerIds);
  for (const playerId of playerIds) {
    const selected = selectedCosmetics.get(playerId);
    if (!selected) continue;
    player_cosmetics[playerId] = {
      bannerAssetKey: selected.bannerAssetKey,
      frameKey: selected.frameKey,
      auraKey: selected.auraKey,
    };
  }

  // Compatibilidade com cosméticos antigos ainda gravados diretamente por
  // jogador. Eles só completam lacunas e nunca sobrescrevem a escolha atual.
  const missingPlayerIds = playerIds.filter((playerId) => !player_cosmetics[playerId]);
  if (missingPlayerIds.length > 0) {
    const { data: equippedCosmetics, error: cosmeticsError } = await client
      .from("player_equipped_cosmetics")
      .select("player_id, slot, cosmetic:cosmetic_id(asset_key)")
      .in("player_id", missingPlayerIds)
      .in("slot", ["banner", "frame", "aura"]);

    if (cosmeticsError) {
      console.error("Erro ao buscar capas equipadas da partida:", cosmeticsError);
    } else {
      for (const item of equippedCosmetics || []) {
        const playerId = item.player_id;
        if (!playerId) continue;

        const equipped = player_cosmetics[playerId] ||= {
          bannerAssetKey: null,
          frameKey: null,
          auraKey: null,
        };
        const assetKey = (item.cosmetic as { asset_key?: string | null } | null)?.asset_key || null;
        if (item.slot === "banner") equipped.bannerAssetKey = assetKey;
        if (item.slot === "frame") equipped.frameKey = assetKey;
        if (item.slot === "aura") equipped.auraKey = assetKey;
      }
    }
  }

  return { ...data, player_cosmetics };
}

export type MatchAdminAuditEntry = {
  id: number;
  action: string;
  changedByName: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function getFinishedMatchAudit(matchId: string): Promise<MatchAdminAuditEntry[]> {
  const account = await getCurrentAccount();
  if (!account.isAdmin || !matchId) return [];
  try { await getMatchState(account.client, matchId); } catch { return []; }

  const { data: rows, error } = await (account.client as any)
    .from("sports_admin_audit")
    .select("id, action, changed_by, changed_by_name, payload, created_at")
    .eq("match_id", matchId)
    .in("action", ["goal_corrected", "goal_assist_corrected", "goal_event_corrected", "goal_event_added"])
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Erro ao buscar auditoria da partida:", error);
    return [];
  }

  const userIds = [...new Set((rows || []).map((row: any) => row.changed_by).filter(Boolean))] as string[];
  const { data: profiles } = userIds.length
    ? await account.client
        .from("account_profiles")
        .select("user_id, player:players!account_profiles_player_id_fkey(name)")
        .in("user_id", userIds)
    : { data: [] };
  const nameByUserId = new Map((profiles || []).map((profile: any) => {
    const player = Array.isArray(profile.player) ? profile.player[0] : profile.player;
    return [profile.user_id, player?.name || "Administrador"];
  }));

  return (rows || []).map((row: any) => ({
    id: Number(row.id),
    action: row.action,
    changedByName: String(row.changed_by_name || nameByUserId.get(row.changed_by) || "Administrador"),
    payload: row.payload || {},
    createdAt: row.created_at,
  }));
}

export async function registerGoal(input: RegisterGoalInput) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    let gateway = supabaseGoalGateway(client);
    if (process.env.MATCH_GOAL_API_ENABLED === "true") {
      const backendUrl = process.env.MATCH_GOAL_BACKEND_URL;
      if (!backendUrl) throw new GoalWriteError("API de gols não configurada.", false);
      // getAdminClient validou o usuário com getUser. O backend verifica o
      // access token novamente e aplica o escopo da pelada na própria RPC.
      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session?.access_token) {
        throw new GoalWriteError("Sessão expirada. Entre novamente.", false);
      }
      gateway = httpGoalGateway(backendUrl, session.access_token);
    }
    const result = await registerLiveGoal(input, gateway);
    if (!result.success) return result;

    // A tela ao vivo aplica o placar e o evento pelo resultado da ação e
    // pelo Realtime. Invalidar a própria rota embutiria outro render pesado
    // na resposta de cada gol.
    after(() => {
      if (result.roundId) revalidatePath(`/rodadas/${result.roundId}`);
      // Ranking e Cartola não fazem parte da confirmação do toque. As telas
      // ao vivo recebem o evento via resposta + Realtime; estes caches podem
      // ser invalidados depois que o recibo já voltou ao celular.
      revalidatePath("/cartola");
      revalidatePath("/ranking");
    });

    return {
      success: true,
      eventId: result.eventId,
      idempotent: result.idempotent,
      scoreA: result.scoreA,
      scoreB: result.scoreB,
    };
  } catch (err: any) {
    console.error("Erro ao registrar gol:", err);
    // A gravação pode ter sido concluída antes de a resposta se perder.
    // O cliente não deve criar uma nova chave para esse mesmo lance.
    return {
      success: false,
      error: err.message,
      uncertain: err instanceof GoalWriteError ? err.uncertain : true,
    };
  }
}

export async function setRoundTeamFixedGoalkeeper(roundId: string, teamId: string, playerId: string | null) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    const league = await getSelectedLeague();
    const result = await chooseFixedGoalkeeper(
      { roundId, teamId, playerId, leagueId: league?.id || null },
      supabaseGoalkeeperGateway(client),
    );
    if (!result.success) return result;
    revalidatePath(`/rodadas/${result.roundId}`);
    revalidatePath(`/rodadas/${result.roundId}/nova-partida`);
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao definir goleiro fixo:", err);
    return { success: false, error: err.message || "Não foi possível definir o goleiro fixo." };
  }
}

export async function changeMatchGoalkeeper(
  matchId: string,
  teamId: string,
  playerId: string,
  elapsedSeconds?: number,
) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    const result = await switchMatchGoalkeeper(
      { matchId, teamId, playerId, elapsedSeconds },
      supabaseGoalkeeperGateway(client),
    );
    if (!result.success) return result;
    revalidatePath(`/rodadas/${result.roundId}`);
    revalidatePath("/cartola");
    return { success: true, ...(result.data || {}) };
  } catch (err: any) {
    console.error("Erro ao trocar goleiro:", err);
    return { success: false, error: err.message || "Não foi possível trocar o goleiro." };
  }
}

export async function substituteMatchPlayer(input: SubstituteMatchPlayerInput) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    const result = await substitutePlayerInMatch(input, supabaseMatchSubstitutionGateway(client));
    if (!result.success) return result;
    revalidatePath(`/partidas/${input.match_id}`);
    revalidatePath(`/rodadas/${result.roundId}`);
    revalidatePath(`/rodadas/${result.roundId}/nova-partida`);
    return { success: true, substitutionId: result.substitutionId };
  } catch (err: any) {
    console.error("Erro ao substituir jogador:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Remove uma partida criada por engano antes do encerramento da rodada.
 * Os relacionamentos da partida usam cascade no banco; depois recalculamos os
 * scouts da rodada e, quando existir, a rodada correspondente do Cartola.
 */
export async function deleteMatch(matchId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    if (!matchId) return { success: false, error: "Partida inválida para exclusão." };
    await getMatchState(client, matchId);

    const { data: match, error: matchError } = await client
      .from("matches")
      .select("id, round_id, status, round:round_id(status)")
      .eq("id", matchId)
      .maybeSingle();

    if (matchError) throw new Error(matchError.message);
    if (!match) return { success: false, error: "Partida não encontrada." };
    if (match.status === "live") return { success: false, error: "Encerre a partida antes de apagá-la." };
    if ((match as any).round?.status === "finished") {
      return { success: false, error: "A rodada já foi encerrada. Use a correção da rodada para preservar o histórico." };
    }

    const { error: deleteError } = await client.from("matches").delete().eq("id", matchId);
    if (deleteError) throw new Error(deleteError.message);

    const roundId = match.round_id;
    const warnings: string[] = [];
    const statsResult = await calculateRoundStats(roundId);
    if (!statsResult.success) warnings.push(statsResult.error || "Não foi possível recalcular as estatísticas.");

    const { data: fantasyRound, error: fantasyRoundError } = await client
      .from("fantasy_rounds")
      .select("id")
      .eq("round_id", roundId)
      .maybeSingle();
    if (fantasyRoundError) warnings.push("A partida foi apagada, mas não foi possível localizar a rodada do Cartola.");
    if (fantasyRound) {
      const { error: fantasyError } = await client.rpc("reprocess_fantasy_from_round", { p_round_id: roundId });
      if (fantasyError) warnings.push(`A partida foi apagada, mas o Cartola precisa ser reprocessado: ${fantasyError.message}`);
    }

    revalidatePath(`/rodadas/${roundId}`);
    revalidatePath(`/rodadas/${roundId}/nova-partida`);
    revalidatePath("/ranking");
    revalidatePath("/cartola", "layout");
    return { success: true, warning: warnings.join(" ") || undefined };
  } catch (err: any) {
    console.error("Erro ao apagar partida:", err);
    return { success: false, error: err.message || "Não foi possível apagar a partida." };
  }
}

export async function undoLastMatchSubstitution(substitutionId: string, matchId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: ADMIN_ERROR };
    const result = await undoMatchSubstitution(
      substitutionId, matchId, supabaseUndoMatchSubstitutionGateway(client),
    );
    if (!result.success) return result;
    revalidatePath(`/partidas/${matchId}`);
    revalidatePath(`/rodadas/${result.roundId}`);
    revalidatePath(`/rodadas/${result.roundId}/nova-partida`);
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
    const result = await deleteLiveGoal(eventId, matchId, supabaseDeleteGoalGateway(client));
    if (!result.success) return result;

    revalidatePath(`/partidas/${matchId}`);
    if (result.roundId) {
      revalidatePath(`/rodadas/${result.roundId}`);
    }
    revalidatePath("/cartola");

    return {
      success: true,
      scoreA: result.scoreA,
      scoreB: result.scoreB,
    };
  } catch (err: any) {
    console.error("Erro ao deletar evento:", err);
    return { success: false, error: err.message };
  }
}

async function runFinishedGoalCorrection(client: SupabaseClient, input: FinishedGoalCorrectionInput) {
  const result = await correctFinishedGoalInMatch(input, supabaseFinishedGoalCorrectionGateway(client), {
    recalculateStats: calculateRoundStats,
    async refreshOverall(roundId) {
      const overall = await refreshFluidOverallSafely(`correção de gol na rodada ${roundId}`);
      if (!overall.success) throw new Error(overall.error || "Não foi possível atualizar o Overall.");
    },
  });
  if (!result.success) return result;

  let warning = result.warning;
  try {
    revalidatePath(`/partidas/${result.matchId}`);
    revalidatePath(`/rodadas/${result.roundId}`);
    revalidatePath("/ranking");
    revalidatePath("/cartola", "layout");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Atualize a página para ver os dados.";
    warning = [warning, `A correção foi salva, mas a atualização das telas falhou: ${message}`]
      .filter(Boolean).join(" ");
  }
  return { success: true as const, warning };
}

export async function correctFinishedGoal(eventId: string, confirmation: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false as const, error: ADMIN_ERROR };
    return await runFinishedGoalCorrection(client, { kind: "remove", eventId, confirmation });
  } catch (err: any) {
    console.error("Erro ao corrigir gol finalizado:", err);
    return { success: false as const, error: err.message };
  }
}

export async function correctFinishedGoalEvent(eventId: string, playerId: string, assistPlayerId: string | null, confirmation: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false as const, error: ADMIN_ERROR };
    return await runFinishedGoalCorrection(client, {
      kind: "edit", eventId, playerId, assistPlayerId, confirmation,
    });
  } catch (err: any) {
    console.error("Erro ao corrigir gol finalizado:", err);
    return { success: false as const, error: err.message };
  }
}

export async function addFinishedGoalEvent(
  matchId: string,
  teamId: string,
  playerId: string,
  assistPlayerId: string | null,
  confirmation: string,
) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false as const, error: ADMIN_ERROR };
    return await runFinishedGoalCorrection(client, {
      kind: "add", matchId, teamId, playerId, assistPlayerId, confirmation,
    });
  } catch (err: any) {
    console.error("Erro ao adicionar gol em partida finalizada:", err);
    return { success: false as const, error: err.message };
  }
}

export async function finishMatch(matchId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false as const, error: ADMIN_ERROR };
    return await finishSelectedMatch(matchId, supabaseFinishMatchGateway(client), {
      revalidate(id, roundId) {
        after(() => {
          revalidatePath(`/partidas/${id}`);
          revalidatePath(`/rodadas/${roundId}`);
          revalidatePath("/ranking");
          revalidatePath("/cartola");
        });
      },
      recalculate: calculateRoundStats,
      notifyAfterResponse(match) {
        // O envio continua fora do caminho crítico da resposta.
        after(async () => {
          try {
            await sendMatchFinishedNotifications(client, match);
          } catch (notificationError) {
            console.error("Erro ao notificar fim de partida:", notificationError);
          }
        });
      },
    });
  } catch (err: any) {
    console.error("Erro ao finalizar partida:", err);
    return { success: false as const, error: err.message };
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
