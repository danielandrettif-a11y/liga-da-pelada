"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getAdminClient } from "../auth";
import { MAX_PLAYERS_PER_TEAM, MAX_TEAMS_PER_ROUND, MIN_TEAMS_PER_ROUND } from "../constants";

export async function getLeagueConfig() {
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) {
    const { data: fallback } = await supabase
      .from("leagues")
      .select("*")
      .limit(1)
      .single();
    
    return fallback;
  }

  return data;
}

export async function updatePreSeasonEnabled(id: string, enabled: boolean) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem alterar a pré-temporada." };
    if (!id) return { success: false, error: "Liga inválida." };

    const { error } = await client
      .from("leagues")
      .update({ preseason_enabled: enabled })
      .eq("id", id);

    if (error) throw new Error(error.message);

    revalidatePath("/");
    revalidatePath("/mais");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao alterar pré-temporada:", err);
    return { success: false, error: err.message };
  }
}

export async function updateLeagueConfig(
  id: string,
  matchDuration: number,
  playersPerTeam: number,
  teamsPerRound: number,
  stadiumName: string,
  stadiumMapUrl: string,
  eventDurationMinutes: number,
) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem alterar a liga." };

    if (!id) return { success: false, error: "Liga inválida." };
    if (!Number.isInteger(matchDuration) || matchDuration < 1 || matchDuration > 90) {
      return { success: false, error: "A duração deve ficar entre 1 e 90 minutos." };
    }
    if (!Number.isInteger(playersPerTeam) || playersPerTeam < 1 || playersPerTeam > MAX_PLAYERS_PER_TEAM) {
      return { success: false, error: `Cada time deve ter entre 1 e ${MAX_PLAYERS_PER_TEAM} jogadores.` };
    }
    if (!Number.isInteger(teamsPerRound) || teamsPerRound < MIN_TEAMS_PER_ROUND || teamsPerRound > MAX_TEAMS_PER_ROUND) {
      return { success: false, error: `A rodada deve ter entre ${MIN_TEAMS_PER_ROUND} e ${MAX_TEAMS_PER_ROUND} times.` };
    }
    const normalizedStadium = stadiumName.trim();
    const normalizedMapUrl = stadiumMapUrl.trim();
    if (normalizedStadium.length > 240) return { success: false, error: "O nome/endereco do estadio e muito longo." };
    if (normalizedMapUrl && !/^https?:\/\//i.test(normalizedMapUrl)) {
      return { success: false, error: "O link do mapa precisa comecar com http:// ou https://." };
    }
    if (normalizedMapUrl.length > 1000) return { success: false, error: "O link do mapa e muito longo." };
    if (!Number.isInteger(eventDurationMinutes) || eventDurationMinutes < 30 || eventDurationMinutes > 720) {
      return { success: false, error: "A duracao total da pelada deve ficar entre 30 minutos e 12 horas." };
    }

    const { data: currentLeague, error: currentLeagueError } = await client
      .from("leagues")
      .select("players_per_team, teams_per_round")
      .eq("id", id)
      .single();
    if (currentLeagueError || !currentLeague) {
      return { success: false, error: currentLeagueError?.message || "Liga não encontrada." };
    }
    if ((currentLeague.players_per_team || 5) !== playersPerTeam || (currentLeague.teams_per_round || 3) !== teamsPerRound) {
      const { data: activeCallup, error: callupError } = await client
        .from("callups")
        .select("id")
        .eq("league_id", id)
        .in("status", ["open", "locked"])
        .limit(1)
        .maybeSingle();
      if (callupError) return { success: false, error: callupError.message };
      if (activeCallup) {
        return { success: false, error: "Feche ou conclua a convocação atual antes de mudar o formato da rodada." };
      }
    }

    const { error } = await client
      .from("leagues")
      .update({
        match_duration: matchDuration,
        players_per_team: playersPerTeam,
        teams_per_round: teamsPerRound,
        stadium_name: normalizedStadium || null,
        stadium_map_url: normalizedMapUrl || null,
        event_duration_minutes: eventDurationMinutes,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    revalidatePath("/admin/liga");
    revalidatePath("/admin/rodada");
    revalidatePath("/admin/prelistas");
    revalidatePath("/convocacao");
    revalidatePath("/mais");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao atualizar liga:", err);
    return { success: false, error: err.message };
  }
}
