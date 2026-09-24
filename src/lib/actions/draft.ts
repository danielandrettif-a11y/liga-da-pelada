"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient, getCurrentAccount } from "../auth";
import type { PlayerProfile } from "../types";
import { calculateDraftBalanceScore, findBestDraftSwap, summarizeDraftTeams, type DraftBalancePlayer } from "../draft-balance";
import { TEAM_PRESETS } from "../teamPresets";

export type DraftPlayer = {
  id: string;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  profile: PlayerProfile | null;
  overall: number | null;
  stars: number | null;
  teamSlot: number | null;
  isCaptain: boolean;
  pickNumber: number | null;
  active: boolean;
};

export type DraftCaptain = {
  teamSlot: number;
  selectionOrder: number | null;
  winRate: number;
  officialRounds: number;
  player: DraftPlayer;
};

export type DraftWorkspace = {
  id: string;
  callupId: string;
  roundId: string;
  status: "setup" | "active" | "paused" | "completed" | "confirmed" | "cancelled";
  currentPick: number;
  pauseReason: string | null;
  isAdmin: boolean;
  currentPlayerId: string | null;
  captains: DraftCaptain[];
  players: DraftPlayer[];
  summaries: ReturnType<typeof summarizeDraftTeams>;
  balanceScore: number;
  suggestion: (ReturnType<typeof findBestDraftSwap> & { playerAName: string; playerBName: string }) | null;
};

function refreshDraft(roundId?: string) {
  revalidatePath("/convocacao");
  revalidatePath("/coletiva");
  revalidatePath("/", "layout");
  revalidatePath("/admin/rodada");
  if (roundId) revalidatePath(`/rodadas/${roundId}`);
}

export async function createTeamDraft(input: { callupId: string; roundId: string }) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem iniciar o Draft." };
  const { data: round } = await client.from("rounds").select("season_id").eq("id", input.roundId).maybeSingle();
  if (!round) return { success: false, error: "Pré-rodada não encontrada." };
  const { data: entries, error: entriesError } = await client
    .from("callup_entries")
    .select("player_id, players!inner(id, member_category, is_selectable)")
    .eq("callup_id", input.callupId)
    .eq("status", "confirmed");
  if (entriesError) return { success: false, error: entriesError.message };
  const confirmedIds = (entries || []).map((entry: any) => entry.player_id);
  const { data: stats, error: statsError } = await client
    .from("player_season_stats")
    .select("player_id, rounds_count")
    .eq("season_id", round.season_id)
    .eq("round_type", "official")
    .gte("rounds_count", 3)
    .in("player_id", confirmedIds);
  if (statsError) return { success: false, error: statsError.message };
  const eligible = (stats || []).filter((stat: any) => {
    const entry: any = entries?.find((item: any) => item.player_id === stat.player_id);
    const player = Array.isArray(entry?.players) ? entry.players[0] : entry?.players;
    return player?.member_category === "player" && player?.is_selectable;
  }).map((stat: any) => stat.player_id);
  if (eligible.length < 3) return { success: false, error: "São necessários três jogadores oficiais com pelo menos três rodadas oficiais nesta temporada." };
  const captainIds = [...eligible].sort(() => Math.random() - 0.5).slice(0, 3);
  const { data: draftId, error } = await client.rpc("create_team_draft", {
    p_callup_id: input.callupId,
    p_round_id: input.roundId,
    p_captain_ids: captainIds,
  });
  if (error) return { success: false, error: error.message };
  refreshDraft(input.roundId);
  return { success: true, draftId: String(draftId) };
}

export async function getDraftWorkspace(callupId: string): Promise<DraftWorkspace | null> {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const { data: draft } = await account.client.from("team_drafts").select("*").eq("callup_id", callupId).maybeSingle();
  if (!draft) return null;
  const [{ data: captainRows }, { data: pickRows }, { data: poolRows }] = await Promise.all([
    account.client.from("team_draft_captains").select("*").eq("draft_id", draft.id).order("team_slot"),
    account.client.from("team_draft_picks").select("*").eq("draft_id", draft.id).order("pick_number"),
    account.client.from("team_draft_players").select("*").eq("draft_id", draft.id),
  ]);
  const rosterIds = [...new Set([
    ...(poolRows || []).map((row: any) => row.player_id),
    ...(captainRows || []).map((row: any) => row.captain_player_id),
    ...(pickRows || []).map((row: any) => row.player_id),
  ])];
  const { data: playerRows } = rosterIds.length
    ? await account.client.from("players").select("id, name, nickname, avatar_url, player_profile").in("id", rosterIds)
    : { data: [] as any[] };
  const captainsByPlayer = new Map((captainRows || []).map((row: any) => [row.captain_player_id, row]));
  const picksByPlayer = new Map((pickRows || []).map((row: any) => [row.player_id, row]));
  const poolByPlayer = new Map((poolRows || []).map((row: any) => [row.player_id, row]));
  const players: DraftPlayer[] = (playerRows || []).map((player: any) => {
    const captain: any = captainsByPlayer.get(player.id);
    const pick: any = picksByPlayer.get(player.id);
    const snapshot: any = poolByPlayer.get(player.id);
    return {
      id: player.id,
      name: player?.name || "Jogador",
      nickname: player?.nickname || null,
      avatarUrl: player?.avatar_url || null,
      profile: (snapshot?.profile_snapshot || player.player_profile || null) as PlayerProfile | null,
      overall: Number.isFinite(Number(snapshot?.overall_snapshot)) ? Number(snapshot.overall_snapshot) : null,
      stars: Number.isFinite(Number(snapshot?.speed_rating_snapshot)) ? Number(snapshot.speed_rating_snapshot) : null,
      teamSlot: captain?.team_slot || pick?.team_slot || null,
      isCaptain: Boolean(captain),
      pickNumber: pick?.pick_number || null,
      active: Boolean(snapshot),
    };
  });
  const captains: DraftCaptain[] = (captainRows || []).map((row: any) => ({
    teamSlot: row.team_slot,
    selectionOrder: row.selection_order,
    winRate: Number(row.win_rate_snapshot || 0),
    officialRounds: Number(row.official_rounds_snapshot || 0),
    player: players.find((player) => player.id === row.captain_player_id)!,
  })).filter((captain) => captain.player);
  const balancePlayers: DraftBalancePlayer[] = players.filter((player) => player.active && player.teamSlot).map((player) => ({
    id: player.id,
    teamSlot: player.teamSlot!,
    overall: player.overall,
    speedRating: player.stars,
    profile: player.profile,
    isCaptain: player.isCaptain,
  }));
  const suggestion = balancePlayers.length > 3 ? findBestDraftSwap(balancePlayers) : null;
  const playerById = new Map(players.map((player) => [player.id, player]));
  return {
    id: draft.id,
    callupId: draft.callup_id,
    roundId: draft.round_id,
    status: draft.status,
    currentPick: draft.current_pick,
    pauseReason: draft.pause_reason,
    isAdmin: account.isAdmin,
    currentPlayerId: account.profile?.player_id || null,
    captains,
    players,
    summaries: summarizeDraftTeams(balancePlayers),
    balanceScore: calculateDraftBalanceScore(balancePlayers),
    suggestion: suggestion ? { ...suggestion, playerAName: playerById.get(suggestion.playerAId)?.name || "Jogador", playerBName: playerById.get(suggestion.playerBId)?.name || "Jogador" } : null,
  };
}

export async function startTeamDraft(draftId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem iniciar o Draft." };
  const { error } = await client.rpc("start_team_draft", { p_draft_id: draftId });
  if (error) return { success: false, error: error.message };
  refreshDraft();
  return { success: true };
}

export async function replaceTeamDraftCaptain(draftId: string, teamSlot: number, playerId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem trocar capitães." };
  const { error } = await client.rpc("replace_team_draft_captain", { p_draft_id: draftId, p_team_slot: teamSlot, p_player_id: playerId });
  if (error) return { success: false, error: error.message };
  refreshDraft();
  return { success: true };
}

export async function makeTeamDraftPick(draftId: string, playerId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre para escolher." };
  const { error } = await account.client.rpc("make_team_draft_pick", { p_draft_id: draftId, p_player_id: playerId });
  if (error) return { success: false, error: error.message };
  refreshDraft();
  return { success: true };
}

export async function restartTeamDraft(draftId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem reiniciar o Draft." };
  const { error } = await client.rpc("restart_team_draft", { p_draft_id: draftId });
  if (error) return { success: false, error: error.message };
  refreshDraft();
  return { success: true };
}

export async function applyDraftSwap(draftId: string, playerAId: string, playerBId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem aplicar a sugestão." };
  const { error } = await client.rpc("swap_team_draft_picks", { p_draft_id: draftId, p_player_a: playerAId, p_player_b: playerBId });
  if (error) return { success: false, error: error.message };
  refreshDraft();
  return { success: true };
}

export async function finalizeTeamDraft(draftId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem confirmar o Draft." };
  const { data: roundId, error } = await client.rpc("finalize_team_draft", { p_draft_id: draftId });
  if (error) return { success: false, error: error.message };
  const { data: teams } = await client.from("teams").select("id, position").eq("round_id", roundId).order("position");
  await Promise.all((teams || []).map((team: any, index: number) => client.from("teams").update({
    name: TEAM_PRESETS[index]?.name || `Time ${index + 1}`,
    color: TEAM_PRESETS[index]?.color || "#22c55e",
    crest_url: TEAM_PRESETS[index]?.crestUrl || null,
  }).eq("id", team.id)));
  const { data: players } = await client.from("round_players").select("player_id").eq("round_id", roundId);
  await client.rpc("set_round_attendance_bulk", { p_round_id: roundId, p_present_player_ids: (players || []).map((row: any) => row.player_id) });
  refreshDraft(String(roundId));
  return { success: true, roundId: String(roundId) };
}
