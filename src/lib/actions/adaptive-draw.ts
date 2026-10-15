"use server";

import { getCurrentAccount } from "../auth";
import { drawTeamsAdaptive, type AdaptiveTeamSummary } from "../adaptive-draw";
import type { PlayerProfile } from "../types";
import { getPrivateBalanceTagsForDraw } from "../private-balance-tags";
import { getSelectedLeague } from "../league-context";

export type ServerAdaptiveDrawResult = {
  success: boolean;
  teams?: string[][];
  teamSummaries?: AdaptiveTeamSummary[];
  missingOverallCount?: number;
  missingSpeedCount?: number;
  balanceScore?: number;
  attendanceOrder?: string[];
  error?: string;
};

export async function drawTeamsAdaptiveOnServer(input: {
  playerIds: string[];
  attendanceOrder?: string[];
  teamCount: number;
  playersPerTeam: number;
}): Promise<ServerAdaptiveDrawResult> {
  const account = await getCurrentAccount();
  const activeLeague = await getSelectedLeague();
  if (!account.user || !activeLeague || activeLeague.role !== "admin") {
    return { success: false, error: "Apenas administradores desta pelada podem usar o equilíbrio completo." };
  }

  const playerIds = [...new Set(input.playerIds)];
  const teamCount = Math.trunc(input.teamCount);
  const playersPerTeam = Math.trunc(input.playersPerTeam);
  if (teamCount < 2 || teamCount > 4 || playersPerTeam < 1 || playersPerTeam > 10) {
    return { success: false, error: "Configuração de times inválida." };
  }
  if (!playerIds.length || playerIds.length > teamCount * playersPerTeam) {
    return { success: false, error: "Quantidade de jogadores inválida para o sorteio." };
  }

  const { data: members, error: membersError } = await account.client
    .from("league_members")
    .select("player_id, player_profile, speed_rating, players!inner(id, is_selectable, member_category)")
    .eq("league_id", activeLeague.id)
    .eq("is_active", true)
    .in("player_id", playerIds);
  if (membersError) return { success: false, error: membersError.message };

  const profileByPlayer = new Map<string, PlayerProfile | null>();
  const eligibleIds = new Set((members || []).filter((member: any) => {
    const player = Array.isArray(member.players) ? member.players[0] : member.players;
    if (player?.is_selectable && ["player", "guest"].includes(player.member_category)) {
      profileByPlayer.set(member.player_id, member.player_profile || null);
      return true;
    }
    return false;
  }).map((member: any) => member.player_id));
  if (eligibleIds.size !== playerIds.length || playerIds.some((id) => !eligibleIds.has(id))) {
    return { success: false, error: "A lista contém uma pessoa que não está elegível nesta liga." };
  }

  try {
    const [{ data: overalls, error: overallsError }, balanceTags] = await Promise.all([
      account.client.rpc("get_latest_player_card_overalls_for_league", {
        p_league_id: activeLeague.id,
      }),
      getPrivateBalanceTagsForDraw(playerIds, account.client),
    ]);
    if (overallsError) return { success: false, error: `Não foi possível ler os OVRs: ${overallsError.message}` };

  const speedByPlayer = new Map<string, 1 | 2 | 3 | null>((members || []).map((row: any) => [
    row.player_id,
    [1, 2, 3].includes(row.speed_rating) ? row.speed_rating : null,
  ]));
  const overallByPlayer = new Map<string, number>((overalls || [])
    .filter((row: any) => playerIds.includes(row.player_id) && Number.isFinite(Number(row.overall)))
    .map((row: any) => [row.player_id, Number(row.overall)]));

  const makePlayers = (ids: string[]) => ids.map((id) => ({
    id,
    overall: overallByPlayer.get(id) ?? null,
    speedRating: speedByPlayer.get(id) ?? null,
    playerProfile: profileByPlayer.get(id) ?? null,
    balanceTag: balanceTags.get(id) ?? null,
  }));

    const requestedOrder = [...new Set(input.attendanceOrder || [])].filter((id) => eligibleIds.has(id));
    if (requestedOrder.length) {
      const minimumPresent = Math.min(playerIds.length, playersPerTeam * 2);
      const fullOrder = requestedOrder.length < minimumPresent
        ? [...requestedOrder, ...playerIds.filter((id) => !requestedOrder.includes(id))]
        : requestedOrder;
      const starterIds = fullOrder.slice(0, minimumPresent);
      const starterResult = drawTeamsAdaptive({ players: makePlayers(starterIds), teamCount: 2, playersPerTeam });
      const starterSet = new Set(starterIds);
      const waitingIds = [
        ...fullOrder.slice(minimumPresent),
        ...playerIds.filter((id) => !starterSet.has(id) && !fullOrder.includes(id)),
      ];
      const waitingTeams = Array.from({ length: Math.max(0, teamCount - 2) }, (_, index) =>
        waitingIds.slice(index * playersPerTeam, (index + 1) * playersPerTeam));
      return {
        success: true,
        teams: [...starterResult.teams, ...waitingTeams],
        teamSummaries: starterResult.teamSummaries,
        missingOverallCount: starterResult.missingOverallCount,
        missingSpeedCount: starterResult.missingSpeedCount,
        balanceScore: starterResult.balanceScore,
        attendanceOrder: fullOrder,
      };
    }

    const result = drawTeamsAdaptive({ players: makePlayers(playerIds), teamCount, playersPerTeam });
    return { success: true, ...result, attendanceOrder: [] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Não foi possível executar o equilíbrio completo." };
  }
}
