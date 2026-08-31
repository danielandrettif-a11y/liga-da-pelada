"use server";

import { revalidatePath } from "next/cache";
import { cache } from "react";
import { supabase } from "../supabase";
import { getActiveSeason } from "./seasons";
import { createClient as createServerClient } from "../supabase/server";
import { getAdminClient, getCurrentAccount } from "../auth";
import type { RoundType, TeamFormationMode } from "../types";
import { VEST_COLORS } from "../vest-colors";
import {
  DEFAULT_PLAYERS_PER_TEAM,
  MAX_PLAYERS_PER_TEAM,
  MAX_TEAMS_PER_ROUND,
  MIN_TEAMS_PER_ROUND,
  TEAMS_PER_ROUND,
} from "../constants";
import { drawGoalkeeperOrder } from "../goalkeeperOrder";
import { TEAM_CREST_URLS } from "../teamPresets";
import { scheduleCartolaRoundReminders } from "../cartola-reminder-scheduler";

const getActiveLeagueCached = cache(async () => {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, players_per_team, teams_per_round, match_duration, stadium_name, stadium_map_url, event_duration_minutes, preseason_enabled")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) {
    // Para o MVP, se não tiver liga ativa, pegamos a primeira que existir
    const { data: fallback, error: err2 } = await supabase
      .from("leagues")
      .select("id, players_per_team, teams_per_round, match_duration, stadium_name, stadium_map_url, event_duration_minutes, preseason_enabled")
      .limit(1)
      .single();
    
    if (err2 || !fallback) throw new Error("Nenhuma liga encontrada. Execute as migrations.");
    return fallback;
  }

  return data;
});

export async function getActiveLeague() {
  return getActiveLeagueCached();
}

export async function getRounds() {
  const season = await getActiveSeason();
  if (!season) return [];

  const query = supabase
    .from("rounds")
    .select(`
      id,
      number,
      date,
      start_time,
      status,
      round_type,
      preparation_stage,
      notes,
      created_at,
      season_id,
      league_id,
      best_goalkeeper_player_id,
      round_players (count),
      matches (count)
    `)
    .eq("season_id", season.id)
    .eq("preparation_stage", "teams_ready");

  const { data, error } = await query
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar rodadas:", error);
    return [];
  }

  // Transformar o count que vem como array de objetos
  return data.map((round: any) => ({
    ...round,
    playersCount: round.round_players?.[0]?.count || 0,
    matchesCount: round.matches?.[0]?.count || 0,
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
        attendance_status,
        attendance_order,
        attendance_marked_at,
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
        match_events (*),
        match_players (
          player_id,
          team_id,
          original_team_id
        ),
        match_goalkeepers (
          team_id,
          player_id,
          selected_at
        )
      ),
      league:league_id (stadium_name, stadium_map_url, event_duration_minutes)
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Erro ao buscar rodada:", error);
    return null;
  }

  if (data.teams) data.teams.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
  if (data.matches) {
    const statusOrder: Record<string, number> = { live: 0, pending: 1, finished: 2 };
    data.matches.sort((a: any, b: any) => {
      const statusDifference = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      if (statusDifference !== 0) return statusDifference;
      const aTimestamp = new Date(a.finished_at || a.started_at || a.created_at || 0).getTime();
      const bTimestamp = new Date(b.finished_at || b.started_at || b.created_at || 0).getTime();
      return bTimestamp - aTimestamp;
    });
  }
  return data;
}

export async function getAdminRoundPrelists() {
  const client = await getAdminClient();
  if (!client) return [];
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return [];

  const { data, error } = await client
    .from("rounds")
    .select(`
      id,
      number,
      date,
      start_time,
      round_type,
      status,
      created_at,
      round_players (count),
      callups (id, status)
    `)
    .eq("league_id", league.id)
    .eq("season_id", season.id)
    .eq("status", "draft")
    .eq("preparation_stage", "prelist")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao buscar pre-listas:", error);
    return [];
  }

  return (data || []).map((round: any) => ({
    ...round,
    playersCount: round.round_players?.[0]?.count || 0,
    callupId: round.callups?.[0]?.id || null,
    callupStatus: round.callups?.[0]?.status || null,
  }));
}

export async function getAdminRoundPrelist(id: string) {
  const client = await getAdminClient();
  if (!client || !id) return null;
  const { data, error } = await client
    .from("rounds")
    .select(`
      *,
      round_players (player_id, players (*))
    `)
    .eq("id", id)
    .eq("status", "draft")
    .eq("preparation_stage", "prelist")
    .maybeSingle();
  if (error || !data) return null;
  const { data: callup } = await client
    .from("callups")
    .select("id, status")
    .eq("round_id", id)
    .in("status", ["open", "locked"])
    .maybeSingle();
  return { ...data, callupId: callup?.id || null };
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

function refreshRoundManagement(roundId: string) {
  revalidatePath(`/rodadas/${roundId}`);
  revalidatePath(`/rodadas/${roundId}/nova-partida`);
  revalidatePath("/rodadas");
  revalidatePath("/", "layout");
}

export async function setRoundPlayerAttendance(roundId: string, playerId: string, present: boolean) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem alterar a presenca." };
    const { error } = await client.rpc("set_round_player_attendance", {
      p_round_id: roundId,
      p_player_id: playerId,
      p_present: present,
    });
    if (error) throw new Error(error.message);
    refreshRoundManagement(roundId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function setRoundAttendanceBulk(roundId: string, presentPlayerIds: string[]) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem alterar a presenca." };
    const { error } = await client.rpc("set_round_attendance_bulk", {
      p_round_id: roundId,
      p_present_player_ids: [...new Set(presentPlayerIds)],
    });
    if (error) throw new Error(error.message);
    refreshRoundManagement(roundId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function markRoundTeamArrived(roundId: string, teamId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem alterar a presenca." };
    const { error } = await client.rpc("mark_round_team_arrived", { p_round_id: roundId, p_team_id: teamId });
    if (error) throw new Error(error.message);
    refreshRoundManagement(roundId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function swapRoundTeamPlayers(roundId: string, playerAId: string, playerBId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem trocar jogadores." };
    const { error } = await client.rpc("swap_round_team_players", {
      p_round_id: roundId,
      p_player_a_id: playerAId,
      p_player_b_id: playerBId,
    });
    if (error) throw new Error(error.message);
    refreshRoundManagement(roundId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Refaz a distribuição de todos os atletas entre os times da rodada.
 * Partidas já encerradas preservam a escalação em match_players; somente os
 * próximos jogos usarão a nova composição.
 */
export async function shuffleRoundTeams(roundId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem misturar os times." };
    if (!roundId) return { success: false, error: "Rodada inválida." };

    const { error } = await client.rpc("shuffle_round_teams", { p_round_id: roundId });
    if (error) throw new Error(error.message);

    refreshRoundManagement(roundId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Não foi possível misturar os times." };
  }
}

export async function setRoundTeamCaptain(roundId: string, teamId: string, playerId: string | null) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem definir capitaes." };
    const { error } = await client.rpc("set_round_team_captain", {
      p_round_id: roundId,
      p_team_id: teamId,
      p_player_id: playerId,
    });
    if (error) throw new Error(error.message);
    refreshRoundManagement(roundId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function setRoundTeamVestColor(roundId: string, teamId: string, color: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem definir os coletes." };
    if (!VEST_COLORS.some((item) => item.color === color)) return { success: false, error: "Cor de colete inválida." };
    const { error } = await client.from("teams").update({ color }).eq("id", teamId).eq("round_id", roundId);
    if (error) throw new Error(error.message);
    refreshRoundManagement(roundId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteRound(roundId: string, confirmation: string) {
  try {
    if (confirmation.trim().toUpperCase() !== "EXCLUIR") return { success: false, error: "Digite EXCLUIR para confirmar." };
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem excluir rodadas." };
    const { error } = await client.rpc("delete_round_cascade", { p_round_id: roundId });
    if (error) throw new Error(error.message);
    for (const path of ["/rodadas", "/ranking", "/pagamentos", "/cartola", "/cartola/ranking", "/cartola/historico", "/admin/cartola", "/admin/transfermarket", "/admin/prelistas", "/convocacao", "/mais"]) {
      revalidatePath(path);
    }
    revalidatePath("/", "layout");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export type SaveRoundPrelistInput = {
  roundId?: string | null;
  date: string;
  startTime: string;
  roundType: RoundType;
  playerIds: string[];
  callupId?: string | null;
  stadiumId?: string | null;
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
};

export async function saveRoundPrelist(input: SaveRoundPrelistInput) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem salvar uma pre-lista." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)) {
      return { success: false, error: "Informe uma data e um horario validos." };
    }
    const playerIds = [...new Set(input.playerIds.filter(Boolean))];
    const league = await getActiveLeague();
    const { data: leagueConfig, error: configError } = await client
      .from("leagues")
      .select("players_per_team, teams_per_round, stadium_name, stadium_map_url")
      .eq("id", league.id)
      .single();
    if (configError) throw new Error(configError.message);
    const capacity = Math.min(MAX_PLAYERS_PER_TEAM, Math.max(1, leagueConfig?.players_per_team || DEFAULT_PLAYERS_PER_TEAM))
      * Math.min(MAX_TEAMS_PER_ROUND, Math.max(MIN_TEAMS_PER_ROUND, leagueConfig?.teams_per_round || TEAMS_PER_ROUND));
    if (playerIds.length > capacity) return { success: false, error: `A pre-lista aceita no maximo ${capacity} jogadores.` };

    let effectivePlayerIds = playerIds;
    let effectiveDate = input.date;
    let effectiveRoundType = input.roundType;
    let effectiveStadiumId = input.stadiumId || null;
    let effectiveStadiumName = input.stadiumName || null;
    let effectiveStadiumMapUrl = input.stadiumMapUrl || null;

    if (input.callupId) {
      const { data: callup, error: callupError } = await client
        .from("callups")
        .select("date, round_type, start_time, stadium_id, stadium_name, stadium_map_url, callup_entries(player_id, status)")
        .eq("id", input.callupId)
        .eq("status", "open")
        .single();
      if (callupError || !callup) throw new Error(callupError?.message || "Convocacao aberta nao encontrada.");
      effectivePlayerIds = (callup.callup_entries || [])
        .filter((entry: any) => entry.status === "confirmed")
        .map((entry: any) => entry.player_id);
      effectiveDate = callup.date;
      effectiveRoundType = callup.round_type as RoundType;
      effectiveStadiumId = effectiveStadiumId || callup.stadium_id;
      effectiveStadiumName = effectiveStadiumName || callup.stadium_name;
      effectiveStadiumMapUrl = effectiveStadiumMapUrl || callup.stadium_map_url;
    }

    if (effectiveStadiumId && (!effectiveStadiumName || !effectiveStadiumMapUrl)) {
      const { data: stadiumData } = await client
        .from("stadiums")
        .select("name, google_maps_url")
        .eq("id", effectiveStadiumId)
        .maybeSingle();

      if (stadiumData) {
        effectiveStadiumName = stadiumData.name;
        effectiveStadiumMapUrl = stadiumData.google_maps_url;
      }
    }

    const { data: roundId, error } = await client.rpc("save_round_prelist", {
      p_round_id: input.roundId || null,
      p_date: effectiveDate,
      p_start_time: input.startTime,
      p_round_type: effectiveRoundType === "friendly" ? "friendly" : "official",
      p_player_ids: effectivePlayerIds,
      p_callup_id: input.callupId || null,
      p_stadium_id: effectiveStadiumId,
      p_stadium_name: effectiveStadiumName,
      p_stadium_map_url: effectiveStadiumMapUrl,
    });
    if (error) {
      if (error.code === "23505") throw new Error("Houve um conflito na numeracao. Atualize a pagina e tente novamente.");
      throw new Error(error.message);
    }

    if (effectiveRoundType === "official") {
      try {
        await scheduleCartolaRoundReminders({ roundId: String(roundId), date: effectiveDate, startTime: input.startTime, includeOpening: !input.roundId });
      } catch (scheduleError) {
        console.error("Pré-lista salva, mas os lembretes do Cartola não foram agendados:", scheduleError);
      }
    }

    revalidatePath("/admin/rodada");
    revalidatePath("/admin/prelistas");
    revalidatePath("/rodadas");
    revalidatePath("/convocacao");
    revalidatePath("/cartola");
    revalidatePath("/", "layout");
    return { success: true, roundId: String(roundId) };
  } catch (err: any) {
    console.error("Erro ao salvar pre-lista:", err);
    return { success: false, error: err.message };
  }
}

export type CreateRoundOptions = {
  roundType?: RoundType;
  callupId?: string | null;
  formationMode?: TeamFormationMode;
  attendanceOrder?: string[];
  prelistRoundId?: string | null;
  startTime?: string;
  stadiumId?: string | null;
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
};

export async function createRoundWithTeams(
  date: string,
  teams: TeamInput[],
  options: CreateRoundOptions = {},
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
    const formationMode: TeamFormationMode = options.formationMode === "random" || options.formationMode === "balanced"
      ? options.formationMode
      : "manual";
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
    const attendanceOrder = [...new Set(options.attendanceOrder || [])];
    const minimumPresent = playersPerTeam * 2;
    if (attendanceOrder.length > 0) {
      if (allPlayerIds.length < minimumPresent) {
        return { success: false, error: `Selecione pelo menos ${minimumPresent} jogadores para sortear por ordem de chegada.` };
      }
      if (attendanceOrder.length < minimumPresent || attendanceOrder.some((id) => !allPlayerIds.includes(id))) {
        return { success: false, error: `Marque pelo menos ${minimumPresent} presenças válidas.` };
      }
      const starterIds = new Set(attendanceOrder.slice(0, minimumPresent));
      const startingTeamIds = new Set(normalizedTeams.slice(0, 2).flatMap((team) => team.playerIds));
      if (starterIds.size !== minimumPresent || startingTeamIds.size !== minimumPresent
        || [...starterIds].some((id) => !startingTeamIds.has(id))) {
        return { success: false, error: "Os primeiros presentes precisam formar os dois times titulares." };
      }
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
        .select("date, round_type, status, capacity, round_id, callup_entries(player_id, status)")
        .eq("id", options.callupId)
        .eq("league_id", league.id)
        .single();
      if (callupReadError || !callup || !["open", "locked"].includes(callup.status)) {
        return { success: false, error: "A convocacao precisa estar aberta ou bloqueada antes de montar a rodada." };
      }
      const confirmedIds = (callup.callup_entries || [])
        .filter((entry) => entry.status === "confirmed")
        .map((entry) => entry.player_id)
        .sort();
      if (callup.date !== date || callup.round_type !== roundType || confirmedIds.length !== callup.capacity || confirmedIds.join(",") !== [...allPlayerIds].sort().join(",")) {
        return { success: false, error: `Use a data, o tipo e os ${callup.capacity} confirmados da convocacao.` };
      }
      if (options.prelistRoundId && callup.round_id !== options.prelistRoundId) {
        return { success: false, error: "A convocacao nao esta vinculada a esta pre-lista." };
      }
    }

    let stadiumId = options.stadiumId || null;
    let stadiumName = options.stadiumName || null;
    let stadiumMapUrl = options.stadiumMapUrl || null;
    let startTime = options.startTime || "08:00";

    if (stadiumId && (!stadiumName || !stadiumMapUrl)) {
      const { data: stadiumData } = await client
        .from("stadiums")
        .select("name, google_maps_url")
        .eq("id", stadiumId)
        .maybeSingle();
      if (stadiumData) {
        stadiumName = stadiumData.name;
        stadiumMapUrl = stadiumData.google_maps_url;
      }
    }

    // 1. Descobrir o número da nova rodada (maior number + 1)
    let round: any;
    if (options.prelistRoundId) {
      const { data: existingRound, error: existingRoundError } = await client
        .from("rounds")
        .select("*, round_players(player_id), teams(id)")
        .eq("id", options.prelistRoundId)
        .eq("league_id", league.id)
        .eq("season_id", season.id)
        .eq("status", "draft")
        .eq("preparation_stage", "prelist")
        .single();
      if (existingRoundError || !existingRound) return { success: false, error: "Pre-lista editavel nao encontrada." };
      const prelistIds = (existingRound.round_players || []).map((entry: any) => entry.player_id).sort();
      if (existingRound.date !== date || existingRound.round_type !== roundType || prelistIds.join(",") !== [...allPlayerIds].sort().join(",")) {
        return { success: false, error: "Salve a pre-lista com todos os jogadores antes de montar os times." };
      }
      if ((existingRound.teams || []).length > 0) return { success: false, error: "Esta rodada ja possui times montados." };
      
      if (stadiumId || startTime) {
        await client.from("rounds").update({
          start_time: startTime || existingRound.start_time,
          stadium_id: stadiumId || existingRound.stadium_id,
          stadium_name: stadiumName || existingRound.stadium_name,
          stadium_map_url: stadiumMapUrl || existingRound.stadium_map_url,
        }).eq("id", existingRound.id);
      }
      round = existingRound;
    } else {
    const { data: lastRound } = await client
      .from("rounds")
      .select("number")
      .eq("league_id", league.id)
      .eq("season_id", season.id)
      .eq("round_type", roundType)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNumber = lastRound ? lastRound.number + 1 : 1;

    // 2. Criar a rodada
    const { data: createdRound, error: roundError } = await client
      .from("rounds")
      .insert({
        league_id: league.id,
        season_id: season.id,
        number: nextNumber,
        date,
        start_time: startTime,
        stadium_id: stadiumId,
        stadium_name: stadiumName,
        stadium_map_url: stadiumMapUrl,
        status: "draft",
        round_type: roundType,
        formation_mode: formationMode,
        preparation_stage: "teams_ready",
      })
      .select()
      .single();

    if (roundError) throw new Error(`Erro ao criar rodada: ${roundError.message}`);
    round = createdRound;

    // 3. Obter todos os jogadores únicos selecionados
    // 4. Inserir round_players
    if (allPlayerIds.length > 0) {
      const { error: rpError } = await client
        .from("round_players")
        .insert(
          allPlayerIds.map((playerId) => ({ round_id: round.id, player_id: playerId }))
        );
      if (rpError) throw new Error(`Erro ao vincular jogadores: ${rpError.message}`);
    }
    }

    const arrivalOrderEnabled = attendanceOrder.length > 0;
    const initialPresentPlayerIds = arrivalOrderEnabled ? attendanceOrder : allPlayerIds;
    const { error: attendanceError } = await client.rpc("set_round_attendance_bulk", {
      p_round_id: round.id,
      p_present_player_ids: initialPresentPlayerIds,
    });
    if (attendanceError) throw new Error(`Erro ao preparar presencas: ${attendanceError.message}`);

    // 5. Inserir times e team_players
    for (const [teamIndex, team] of normalizedTeams.entries()) {
      const { data: teamData, error: teamError } = await client
        .from("teams")
        .insert({
          round_id: round.id,
          name: team.name,
          color: team.color,
          crest_url: team.crestUrl,
          position: teamIndex + 1,
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

    const { error: readyError } = await client
      .from("rounds")
      .update({ preparation_stage: "teams_ready", formation_mode: formationMode, arrival_order_enabled: arrivalOrderEnabled })
      .eq("id", round.id);
    if (readyError) throw new Error(`Erro ao concluir a rodada: ${readyError.message}`);

    if (options.callupId) {
      const { error: lockError } = await client
        .from("callups")
        .update({ status: "locked", updated_at: new Date().toISOString() })
        .eq("id", options.callupId)
        .eq("status", "open");
      if (lockError) throw new Error(`Erro ao bloquear convocacao: ${lockError.message}`);
      const { error: callupError } = await client
        .from("callups")
        .update({ status: "converted", round_id: round.id, updated_at: new Date().toISOString() })
        .eq("id", options.callupId)
        .eq("league_id", league.id)
        .in("status", ["open", "locked"]);
      if (callupError) throw new Error(`Erro ao vincular convocacao: ${callupError.message}`);
    }

    revalidatePath("/rodadas");
    revalidatePath("/admin/prelistas");
    revalidatePath("/convocacao");
    revalidatePath("/", "layout");
    return { success: true, roundId: round.id };

  } catch (err: any) {
    console.error("Erro em createRoundWithTeams:", err);
    return { success: false, error: err.message };
  }
}

export async function finishRound(roundId: string, paymentPix: string, paymentTotal: number, recipient?: { id?: string | null; name?: string | null }) {
  try {
    let pix = paymentPix.trim();
    const total = Number(paymentTotal);
    if (!Number.isFinite(total) || total <= 0) {
      return { success: false, error: "Informe um valor total valido para a pelada." };
    }

    if (total > 99999999.99) return { success: false, error: "O valor informado e muito alto." };

    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem encerrar rodadas." };

    let recipientId: string | null = null;
    let recipientName = recipient?.name?.trim() || null;
    if (recipient?.id) {
      const { data: preset } = await client.from("payment_recipients").select("id, name, pix_key, is_active").eq("id", recipient.id).eq("is_active", true).maybeSingle();
      if (!preset) return { success: false, error: "O PIX escolhido não está disponível." };
      recipientId = preset.id;
      recipientName = preset.name;
      pix = preset.pix_key;
    }
    if (!pix) return { success: false, error: "Informe a chave PIX que recebera os pagamentos." };
    if (pix.length > 200) return { success: false, error: "A chave PIX deve ter no maximo 200 caracteres." };

    const { data: originalRound, error: originalRoundError } = await client
      .from("rounds")
      .select("status, payment_pix, payment_total, payment_recipient_id, payment_recipient_name")
      .eq("id", roundId)
      .single();
    if (originalRoundError || !originalRound) {
      throw new Error(originalRoundError?.message || "Rodada não encontrada.");
    }

    // Consolida as estatísticas antes de encerrar. Se esta etapa falhar, a rodada
    // continua ativa em vez de ficar finalizada com o Cartola vazio.
    const { calculateRoundStats } = await import("./stats");
    const statsResult = await calculateRoundStats(roundId);
    if (!statsResult.success) {
      throw new Error(`Não foi possível consolidar as estatísticas da rodada: ${statsResult.error || "erro desconhecido"}`);
    }

    const { error } = await client
      .from("rounds")
      .update({
        status: "finished",
        payment_pix: pix,
        payment_total: Math.round(total * 100) / 100,
        payment_recipient_id: recipientId,
        payment_recipient_name: recipientName,
      })
      .eq("id", roundId);

    if (error) throw new Error(error.message);

    const { data: fantasyTest } = await client
      .from("fantasy_test_sessions")
      .select("id")
      .eq("round_id", roundId)
      .maybeSingle();
    const { error: fantasyError } = await client.rpc(
      fantasyTest ? "process_fantasy_test_round" : "process_fantasy_round",
      { p_round_id: roundId },
    );
    if (fantasyError) {
      // A atualização da rodada e o RPC são requisições diferentes. Se o Cartola
      // falhar, restaura o estado anterior para o ADM poder corrigir e tentar de novo.
      const { error: rollbackError } = await client
        .from("rounds")
        .update({
          status: originalRound.status,
          payment_pix: originalRound.payment_pix,
          payment_total: originalRound.payment_total,
          payment_recipient_id: originalRound.payment_recipient_id,
          payment_recipient_name: originalRound.payment_recipient_name,
        })
        .eq("id", roundId);
      if (rollbackError) {
        throw new Error(`O Cartola não foi processado (${fantasyError.message}) e não foi possível restaurar a rodada (${rollbackError.message}).`);
      }
      throw new Error(`O Cartola não foi processado e a rodada foi restaurada para nova tentativa: ${fantasyError.message}`);
    }

    // Gerar pacotes de recompensa V3 para participantes da rodada oficial finalizada
    if (!fantasyTest) {
      try {
        const { generatePacksForFinishedRound } = await import("./fantasy-cards");
        await generatePacksForFinishedRound(roundId);
      } catch (packErr) {
        console.error("Erro ao gerar pacotes da rodada:", packErr);
      }
    }

    revalidatePath(`/rodadas/${roundId}`);
    revalidatePath("/rodadas");
    revalidatePath("/convocacao");
    revalidatePath("/", "layout");
    revalidatePath("/ranking");
    revalidatePath("/pagamentos");
    revalidatePath("/cartola", "layout");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao encerrar rodada:", err);
    return { success: false, error: err.message };
  }
}

export async function transferRoundPlayerIdentity(roundId: string, sourcePlayerId: string, targetPlayerId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem corrigir participantes." };
    const { error } = await client.rpc("transfer_round_player_identity", {
      p_round_id: roundId,
      p_source_player_id: sourcePlayerId,
      p_target_player_id: targetPlayerId,
    });
    if (error) throw new Error(error.message);
    const { calculateRoundStats } = await import("./stats");
    const stats = await calculateRoundStats(roundId);
    if (!stats.success) throw new Error(stats.error || "Não foi possível recalcular a rodada.");
    const { data: fantasyRound } = await client.from("fantasy_rounds").select("id").eq("round_id", roundId).maybeSingle();
    if (fantasyRound) {
      const { error: fantasyError } = await client.rpc("reprocess_fantasy_from_round", { p_round_id: roundId });
      if (fantasyError) throw new Error(`Participação transferida, mas o Cartola precisa ser reprocessado: ${fantasyError.message}`);
    }
    revalidatePath(`/rodadas/${roundId}`);
    revalidatePath("/ranking");
    revalidatePath("/cartola", "layout");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function zeroPlayerRoundPoints(roundId: string, playerId: string, reason: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem corrigir pontuação." };
    const { error } = await client.rpc("zero_player_round_points", {
      p_round_id: roundId,
      p_player_id: playerId,
      p_reason: reason.trim() || "Jogador não participou da rodada",
    });
    if (error) throw new Error(error.message);

    const stats = await (await import("./stats")).calculateRoundStats(roundId);
    if (!stats.success) throw new Error(stats.error || "Não foi possível recalcular as estatísticas.");

    const { data: fantasyRound } = await client.from("fantasy_rounds").select("id").eq("round_id", roundId).maybeSingle();
    if (fantasyRound) {
      const { error: fantasyError } = await client.rpc("reprocess_fantasy_from_round", { p_round_id: roundId });
      if (fantasyError) throw new Error(`Pontuação corrigida, mas o Cartola precisa ser reprocessado: ${fantasyError.message}`);
    }

    revalidatePath(`/rodadas/${roundId}`);
    revalidatePath("/ranking");
    revalidatePath("/jogadores");
    revalidatePath(`/jogadores/${playerId}`);
    revalidatePath("/cartola", "layout");
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Não foi possível zerar a pontuação." };
  }
}

export async function addRoundEmergencySubstitute(roundId: string, outPlayerId: string, inPlayerId: string, teamId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem incluir substitutos." };
    const { error } = await client.rpc("add_round_emergency_substitute", {
      p_round_id: roundId,
      p_out_player_id: outPlayerId,
      p_in_player_id: inPlayerId,
      p_team_id: teamId,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/rodadas/${roundId}`);
    revalidatePath(`/rodadas/${roundId}/nova-partida`);
    revalidatePath("/convocacao");
    revalidatePath("/pagamentos");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
