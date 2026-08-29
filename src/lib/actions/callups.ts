"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient, getCurrentAccount } from "../auth";
import { supabase } from "../supabase";
import type { Callup, CallupEntry, Player, RoundType } from "../types";
import { scheduleCartolaRoundReminders } from "../cartola-reminder-scheduler";
import { getActiveLeague } from "./rounds";
import {
  DEFAULT_PLAYERS_PER_TEAM,
  MAX_PLAYERS_PER_TEAM,
  MAX_TEAMS_PER_ROUND,
  MIN_TEAMS_PER_ROUND,
  TEAMS_PER_ROUND,
} from "../constants";

export type CallupEntryWithPlayer = CallupEntry & { player: Player };
export type CallupWithEntries = Callup & { entries: CallupEntryWithPlayer[] };

function refreshCallups() {
  revalidatePath("/", "layout");
  revalidatePath("/convocacao");
  revalidatePath("/mais");
  revalidatePath("/admin/rodada");
  revalidatePath("/admin/prelistas");
}

export async function getActiveCallup(): Promise<CallupWithEntries | null> {
  const { data, error } = await supabase
    .from("callups")
    .select(`
      *,
      league:league_id!inner (is_active),
      callup_entries (
        *,
        player:player_id (*)
      ),
      round:round_id (
        id,
        status,
        matches (id, status)
      )
    `)
    .eq("league.is_active", true)
    .in("status", ["open", "locked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("Erro ao buscar convocacao:", error);
    return null;
  }

  // Se a rodada vinculada ja iniciou ou finalizou, a convocacao nao deve mais aparecer
  const linkedRound = (data as any).round;
  if (linkedRound) {
    const isRoundStarted = linkedRound.status === "in_progress" || linkedRound.status === "finished";
    const hasStartedMatches = (linkedRound.matches || []).some(
      (m: any) => m.status === "in_progress" || m.status === "finished"
    );
    if (isRoundStarted || hasStartedMatches) {
      return null;
    }
  }

  const rawEntries = (data.callup_entries || []) as unknown as CallupEntryWithPlayer[];
  const entries = [...rawEntries].sort((a, b) => {
    if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
    return a.position - b.position;
  });
  return { ...(data as unknown as Callup), entries };
}

export async function openCallup(formData: FormData) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem abrir convocacoes." };
  const date = String(formData.get("date") || "");
  const startTime = String(formData.get("start_time") || "08:00").slice(0, 5) || "08:00";
  const stadiumId = formData.get("stadium_id") ? String(formData.get("stadium_id")) : null;
  const roundType: RoundType = formData.get("round_type") === "friendly" ? "friendly" : "official";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: "Informe uma data valida." };

  const league = await getActiveLeague();
  const { data: leagueConfig, error: configError } = await client
    .from("leagues")
    .select("players_per_team, teams_per_round, stadium_name, stadium_map_url")
    .eq("id", league.id)
    .single();
  if (configError) return { success: false, error: configError.message };

  let stadiumName: string | null = leagueConfig?.stadium_name || null;
  let stadiumMapUrl: string | null = leagueConfig?.stadium_map_url || null;

  if (stadiumId) {
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

  const playersPerTeam = Math.min(
    MAX_PLAYERS_PER_TEAM,
    Math.max(1, leagueConfig?.players_per_team || DEFAULT_PLAYERS_PER_TEAM),
  );
  const teamsPerRound = Math.min(
    MAX_TEAMS_PER_ROUND,
    Math.max(MIN_TEAMS_PER_ROUND, leagueConfig?.teams_per_round || TEAMS_PER_ROUND),
  );
  const capacity = playersPerTeam * teamsPerRound;
  const { data, error } = await client
    .from("callups")
    .insert({
      league_id: league.id,
      date,
      start_time: startTime,
      stadium_id: stadiumId,
      stadium_name: stadiumName,
      stadium_map_url: stadiumMapUrl,
      round_type: roundType,
      status: "open",
      capacity,
    })
    .select("id")
    .single();
  if (error) {
    const message = error.code === "23505" ? "Ja existe uma convocacao aberta nesta liga." : error.message;
    return { success: false, error: message };
  }
  refreshCallups();
  return { success: true, id: data.id };
}

export async function joinActiveCallup(callupId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para participar." };
  const { error } = await account.client.rpc("join_callup", { p_callup_id: callupId });
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true };
}

export async function leaveActiveCallup(callupId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para sair." };
  const { error } = await account.client.rpc("leave_callup", { p_callup_id: callupId });
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true };
}

export async function adminAddCallupPlayer(callupId: string, playerId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem alterar a lista." };
  const { error } = await client.rpc("admin_add_callup_player", {
    p_callup_id: callupId,
    p_player_id: playerId,
  });
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true };
}

/**
 * A convocação é colaborativa: qualquer pessoa autenticada pode adicionar um
 * perfil jogável do elenco. WAGs e Torcida continuam fora da lista porque não
 * podem participar de partidas.
 */
export async function addRosterPlayerToCallup(callupId: string, playerId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para alterar a lista." };

  const { error } = await account.client.rpc("add_player_to_callup", {
    p_callup_id: callupId,
    p_player_id: playerId,
    p_admin_only: false,
  });
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true };
}

export async function adminRemoveCallupPlayer(callupId: string, playerId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem alterar a lista." };
  const { error } = await client.rpc("admin_remove_callup_player", {
    p_callup_id: callupId,
    p_player_id: playerId,
  });
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true };
}

/**
 * Contrata um amigo (cria perfil de convidado e adiciona na convocação/fila).
 * Disponível para qualquer usuário autenticado.
 */
export async function inviteGuestToCallup({
  callupId,
  name,
  playerProfile = "midfield",
  isGoalkeeper = false,
}: {
  callupId: string;
  name: string;
  playerProfile?: "offensive" | "midfield" | "defensive";
  isGoalkeeper?: boolean;
}) {
  const account = await getCurrentAccount();
  if (!account.user) {
    return { success: false, error: "Entre na sua conta para contratar um amigo." };
  }

  const cleanName = name.trim();
  if (cleanName.length < 2) {
    return { success: false, error: "Informe o nome do seu amigo (pelo menos 2 letras)." };
  }

  // A criação do convidado, seu vínculo com a liga e a reserva na fila
  // acontecem em uma única transação no banco. Assim não há convidado órfão
  // nem duas pessoas ocupando a última vaga ao mesmo tempo.
  const { data: createdEntry, error: entryError } = await (account.client as any).rpc(
    "create_callup_guest",
    {
      p_callup_id: callupId,
      p_name: cleanName,
      p_player_profile: playerProfile,
      p_is_goalkeeper: isGoalkeeper,
    },
  );

  if (entryError) {
    return { success: false, error: entryError.message };
  }

  refreshCallups();
  const entry = Array.isArray(createdEntry) ? createdEntry[0] : createdEntry;
  return { success: true, isConfirmed: entry?.status === "confirmed", playerId: entry?.player_id };
}

/**
 * Remove uma entrada da convocação (feita pelo próprio criador do convidado ou por administrador).
 */
export async function removeCallupEntry(callupId: string, playerId: string) {
  const account = await getCurrentAccount();
  if (!account.user) {
    return { success: false, error: "Entre na sua conta para alterar a lista." };
  }

  const adminClient = await getAdminClient();
  const client = adminClient || account.client;

  // 1. Buscar a entrada
  const { data: entry, error: entryError } = await client
    .from("callup_entries")
    .select("id, joined_by, player_id, player:players(created_by_user_id)")
    .eq("callup_id", callupId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (entryError || !entry) {
    return { success: false, error: "Jogador não encontrado na convocação." };
  }

  // 2. Verificar permissão: Admin ou usuário que cadastrou
  const isCreator = entry.joined_by === account.user.id || (entry.player as any)?.created_by_user_id === account.user.id;
  if (!account.isAdmin && !isCreator) {
    return { success: false, error: "Você só pode remover convidados cadastrados por você." };
  }

  // 3. Remover a entrada
  const { error: deleteError } = await client
    .from("callup_entries")
    .delete()
    .eq("callup_id", callupId)
    .eq("player_id", playerId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // 4. Normalizar posições e promover da fila se necessário
  try {
    await client.rpc("normalize_callup_positions", { p_callup_id: callupId });
  } catch {
    // Ignora se não existir ou se a RPC falhar
  }

  refreshCallups();
  return { success: true };
}

export async function createCallupPrelist(callupId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem criar a pre-lista." };

  const { data: callup, error: callupError } = await client
    .from("callups")
    .select("id, date, start_time, stadium_id, stadium_name, stadium_map_url, round_type, status, round_id, callup_entries(player_id, status)")
    .eq("id", callupId)
    .maybeSingle();

  if (callupError || !callup) {
    return { success: false, error: callupError?.message || "Convocacao nao encontrada." };
  }

  if (callup.round_id) {
    const { data: linkedRound, error: linkedRoundError } = await client
      .from("rounds")
      .select("id, status, preparation_stage")
      .eq("id", callup.round_id)
      .maybeSingle();

    if (linkedRoundError) return { success: false, error: linkedRoundError.message };
    if (linkedRound?.status === "draft" && linkedRound.preparation_stage === "prelist") {
      return { success: true, roundId: linkedRound.id };
    }
    return { success: false, error: "Esta convocacao ja foi convertida em rodada." };
  }

  if (callup.status !== "open") {
    return { success: false, error: "A convocacao precisa estar aberta para criar a pre-lista." };
  }

  const confirmedPlayerIds = (callup.callup_entries || [])
    .filter((entry) => entry.status === "confirmed")
    .map((entry) => entry.player_id);

  const { data: roundId, error } = await client.rpc("save_round_prelist", {
    p_round_id: null,
    p_date: callup.date,
    p_start_time: callup.start_time || "08:00",
    p_round_type: callup.round_type === "friendly" ? "friendly" : "official",
    p_player_ids: confirmedPlayerIds,
    p_callup_id: callup.id,
    p_stadium_id: callup.stadium_id || null,
    p_stadium_name: callup.stadium_name || null,
    p_stadium_map_url: callup.stadium_map_url || null,
  });

  if (error) return { success: false, error: error.message };

  if (callup.round_type !== "friendly") {
    try {
      await scheduleCartolaRoundReminders({ roundId: String(roundId), date: callup.date, startTime: callup.start_time || "08:00", includeOpening: true });
    } catch (scheduleError) {
      console.error("Pré-lista criada, mas os lembretes do Cartola não foram agendados:", scheduleError);
    }
  }

  refreshCallups();
  revalidatePath("/cartola");
  return { success: true, roundId: String(roundId) };
}

export async function closeCallup(callupId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem fechar convocacoes." };
  const { error } = await client.from("callups").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", callupId);
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true };
}

export async function lockCallupForRound(callupId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem montar a rodada." };
  const { data: callup, error: callupError } = await client
    .from("callups")
    .select("capacity")
    .eq("id", callupId)
    .single();
  if (callupError || !callup) return { success: false, error: callupError?.message || "Convocacao nao encontrada." };
  const { data: entries, error: entriesError } = await client
    .from("callup_entries")
    .select("id")
    .eq("callup_id", callupId)
    .eq("status", "confirmed");
  if (entriesError) return { success: false, error: entriesError.message };
  if ((entries?.length || 0) !== callup.capacity) {
    return { success: false, error: `A lista precisa ter ${callup.capacity} confirmados para montar a rodada.` };
  }
  const { error } = await client.from("callups").update({ status: "locked", updated_at: new Date().toISOString() }).eq("id", callupId).eq("status", "open");
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true };
}

export async function updateCallup(formData: FormData) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem editar convocações." };
  const callupId = String(formData.get("callup_id") || "");
  const date = String(formData.get("date") || "");
  const startTime = String(formData.get("start_time") || "08:00").slice(0, 5) || "08:00";
  const stadiumId = formData.get("stadium_id") ? String(formData.get("stadium_id")) : null;
  const roundType: RoundType = formData.get("round_type") === "friendly" ? "friendly" : "official";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: "Informe uma data válida." };

  const league = await getActiveLeague();
  let stadiumName: string | null = null;
  let stadiumMapUrl: string | null = null;

  if (stadiumId) {
    const { data: stadiumData } = await client
      .from("stadiums")
      .select("name, google_maps_url")
      .eq("id", stadiumId)
      .maybeSingle();

    if (stadiumData) {
      stadiumName = stadiumData.name;
      stadiumMapUrl = stadiumData.google_maps_url;
    }
  } else {
    const { data: leagueConfig } = await client
      .from("leagues")
      .select("stadium_name, stadium_map_url")
      .eq("id", league.id)
      .single();
    stadiumName = leagueConfig?.stadium_name || null;
    stadiumMapUrl = leagueConfig?.stadium_map_url || null;
  }

  const { error } = await client
    .from("callups")
    .update({
      date,
      start_time: startTime,
      stadium_id: stadiumId,
      stadium_name: stadiumName,
      stadium_map_url: stadiumMapUrl,
      round_type: roundType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", callupId);

  if (error) return { success: false, error: error.message };

  const { data: callup } = await client
    .from("callups")
    .select("round_id")
    .eq("id", callupId)
    .maybeSingle();

  if (callup?.round_id) {
    await client
      .from("rounds")
      .update({
        date,
        start_time: startTime,
        stadium_id: stadiumId,
        stadium_name: stadiumName,
        stadium_map_url: stadiumMapUrl,
        round_type: roundType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", callup.round_id)
      .eq("status", "draft");
  }

  refreshCallups();
  return { success: true };
}

