"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import type { PlayerAdminAttributes } from "../types";
import { drawTeamsByAttendance } from "../round-draw";
import { drawTeamsBySpeed, summarizeSpeedTeams, type SpeedTeamSummary } from "../speed-draw";

export type ServerSpeedDrawResult = {
  success: boolean;
  teams?: string[][];
  teamSummaries?: SpeedTeamSummary[];
  unratedCount?: number;
  attendanceOrder?: string[];
  error?: string;
};

/**
 * Executa o sorteio de velocidade em ambiente confiável. O navegador envia
 * somente os IDs e a ordem de presença; estrelas e elegibilidade são lidas
 * novamente no servidor para não expor nem aceitar avaliações adulteradas.
 */
export async function drawTeamsBySpeedOnServer(input: {
  playerIds: string[];
  attendanceOrder?: string[];
  teamCount: number;
  playersPerTeam: number;
}): Promise<ServerSpeedDrawResult> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Apenas administradores podem sortear por velocidade." };

  const playerIds = [...new Set(input.playerIds)];
  const teamCount = Math.trunc(input.teamCount);
  const playersPerTeam = Math.trunc(input.playersPerTeam);
  if (teamCount < 2 || teamCount > 4 || playersPerTeam < 1 || playersPerTeam > 10) {
    return { success: false, error: "Configuração de times inválida." };
  }
  if (!playerIds.length || playerIds.length > teamCount * playersPerTeam) {
    return { success: false, error: "Quantidade de jogadores inválida para o sorteio." };
  }

  const { data: activeLeague, error: leagueError } = await account.client
    .from("leagues")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (leagueError || !activeLeague) return { success: false, error: "Liga ativa não encontrada." };

  const { data: members, error: membersError } = await account.client
    .from("league_members")
    .select("player_id, players!inner(id, is_selectable, member_category)")
    .eq("league_id", activeLeague.id)
    .eq("is_active", true)
    .in("player_id", playerIds);
  if (membersError) return { success: false, error: membersError.message };
  const eligibleIds = new Set((members || []).filter((member: any) => {
    const player = Array.isArray(member.players) ? member.players[0] : member.players;
    return player?.is_selectable && ["player", "guest"].includes(player.member_category);
  }).map((member: any) => member.player_id));
  if (eligibleIds.size !== playerIds.length || playerIds.some((id) => !eligibleIds.has(id))) {
    return { success: false, error: "A lista contém uma pessoa que não está elegível nesta liga." };
  }

  const { data: attributes, error: attributesError } = await account.client
    .from("player_admin_attributes")
    .select("player_id, speed_rating")
    .in("player_id", playerIds);
  if (attributesError) return { success: false, error: attributesError.message };
  const speedByPlayer = new Map<string, 1 | 2 | 3 | null>((attributes || []).map((row: any) => [
    row.player_id,
    [1, 2, 3].includes(row.speed_rating) ? row.speed_rating : null,
  ]));
  const speedPlayers = playerIds.map((id) => ({ id, speedRating: speedByPlayer.get(id) ?? null }));

  try {
    const attendanceOrder = [...new Set(input.attendanceOrder || [])].filter((id) => eligibleIds.has(id));
    if (attendanceOrder.length) {
      const minimumPresent = Math.min(playerIds.length, playersPerTeam * 2);
      const fullOrder = attendanceOrder.length < minimumPresent
        ? [...attendanceOrder, ...playerIds.filter((id) => !attendanceOrder.includes(id))]
        : attendanceOrder;
      const attendanceResult = drawTeamsByAttendance({
        players: playerIds.map((id) => ({ id })),
        attendanceOrder: fullOrder,
        teamCount,
        playersPerTeam,
        mode: "speed",
        speedRatings: speedByPlayer,
      });
      return {
        success: true,
        teams: attendanceResult.teams,
        teamSummaries: summarizeSpeedTeams(attendanceResult.teams, speedByPlayer),
        unratedCount: speedPlayers.filter((player) => player.speedRating === null).length,
        attendanceOrder: fullOrder,
      };
    }

    const result = drawTeamsBySpeed({ players: speedPlayers, teamCount, playersPerTeam });
    return { success: true, ...result, attendanceOrder: [] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Não foi possível sortear por velocidade." };
  }
}

export async function getPlayerSpeedRatings(): Promise<Record<string, 1 | 2 | 3 | null>> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return {};

  const { data, error } = await account.client
    .from("player_admin_attributes")
    .select("player_id, speed_rating");

  if (error) {
    console.error("Erro ao buscar atributos de velocidade:", error);
    return {};
  }

  const result: Record<string, 1 | 2 | 3 | null> = {};
  for (const item of data || []) {
    result[item.player_id] = item.speed_rating;
  }
  return result;
}

export async function setPlayerSpeedRating(
  playerId: string,
  speedRating: 1 | 2 | 3 | null,
): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) {
    return { success: false, error: "Apenas administradores podem definir atributos de velocidade." };
  }

  if (speedRating !== null && ![1, 2, 3].includes(speedRating)) {
    return { success: false, error: "Avaliação de velocidade inválida (deve ser 1, 2 ou 3 estrelas)." };
  }

  const { error } = await account.client
    .from("player_admin_attributes")
    .upsert(
      {
        player_id: playerId,
        speed_rating: speedRating,
        updated_by: account.user?.id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id" },
    );

  if (error) {
    console.error("Erro ao salvar velocidade do jogador:", error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/jogadores/${playerId}`);
  revalidatePath("/admin/jogadores");
  return { success: true };
}
