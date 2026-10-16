"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient, getCurrentAccount } from "../auth";
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
import { hasCallupClosingMatch } from "../callup-lifecycle";
import { getSelectedLeague } from "../league-context";
import { notifyCartolaLineupsAboutWithdrawal } from "../cartola-withdrawal-notifications";

export type CallupEntryWithPlayer = CallupEntry & {
  player: Player;
  joined_by_name?: string | null;
};
type CallupRoundTeam = {
  id: string;
  name: string;
  position?: number | null;
  color: string;
  crest_url?: string | null;
  team_players: Array<{ player_id: string }>;
};

export type CallupWithEntries = Callup & {
  entries: CallupEntryWithPlayer[];
  round?: {
    id: string;
    status: string;
    matches?: Array<{ id: string; status: string; started_at: string | null }>;
    teams?: CallupRoundTeam[];
  } | null;
};

function normalizeCallup(data: any): CallupWithEntries | null {
  const linkedRound = data?.round;
  if (linkedRound) {
    // Sorteio concluído não encerra a convocação. Ela continua acessível para
    // desistências e reposições até o primeiro jogo realmente começar.
    const hasStartedMatches = hasCallupClosingMatch(linkedRound.matches);
    if (hasStartedMatches) return null;
  }

  const rawEntries = (data?.callup_entries || []) as Array<CallupEntryWithPlayer & { player: Player | null }>;
  // Uma relação invisível por RLS não pode derrubar a convocação inteira.
  // A política correta está na migration 306; este filtro protege também
  // dados antigos inconsistentes até que sejam reparados no banco.
  const entries = rawEntries.filter((entry): entry is CallupEntryWithPlayer => Boolean(entry.player)).sort((a, b) => {
    if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
    return a.position - b.position;
  });
  return { ...(data as Callup), entries };
}

function refreshCallups() {
  revalidatePath("/", "layout");
  revalidatePath("/convocacao");
  revalidatePath("/mais");
  revalidatePath("/admin/rodada");
  revalidatePath("/admin/prelistas");
}

async function selectedCallup(callupId: string, client: Awaited<ReturnType<typeof getCurrentAccount>>["client"]) {
  const league = await getSelectedLeague();
  if (!league) return null;
  const { data } = await client.from("callups").select("id, league_id")
    .eq("id", callupId).eq("league_id", league.id).maybeSingle();
  return data;
}

async function selectedRosterPlayer(playerId: string, client: Awaited<ReturnType<typeof getCurrentAccount>>["client"]) {
  const league = await getSelectedLeague();
  if (!league) return false;
  const { data } = await client.from("league_members").select("player_id")
    .eq("league_id", league.id).eq("player_id", playerId).eq("is_active", true).maybeSingle();
  return Boolean(data);
}

export async function getActiveCallups(invite?: { callupId?: string; inviteToken?: string }): Promise<CallupWithEntries[]> {
  const account = await getCurrentAccount();
  const client = account.client;
  const league = await getSelectedLeague();
  if (!league) return [];

  if (invite?.callupId && invite.inviteToken && account.user && await selectedCallup(invite.callupId, client)) {
    await client.rpc("claim_callup_invite", {
      p_callup_id: invite.callupId,
      p_invite_token: invite.inviteToken,
    });
  }

  const { data, error } = await client
    .from("callups")
    .select(`
      *,
      callup_entries (
        *,
        player:player_id (*)
      ),
      round:round_id (
        id,
        status,
        matches (id, status, started_at),
        teams (id, name, position, color, crest_url, team_players (player_id))
      )
    `)
    .eq("league_id", league.id)
    .in("status", ["open", "locked", "converted"])
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (error) console.error("Erro ao buscar convocacao:", error);
    return [];
  }

  const callups = (data || []).map(normalizeCallup).filter((callup): callup is CallupWithEntries => Boolean(callup));
  if (callups.length === 0) return callups;

  const { data: joiners, error: joinersError } = await client.rpc("get_callup_entry_joiners", {
    p_callup_ids: callups.map((callup) => callup.id),
  });
  if (joinersError) {
    console.error("Erro ao buscar responsáveis pelas entradas da convocação:", joinersError);
    return callups;
  }

  const joinerRows = (joiners || []) as Array<{ callup_entry_id: string; joined_by_name: string | null }>;
  const joinerNameByEntryId = new Map<string, string | null>(
    joinerRows.map((joiner) => [
      joiner.callup_entry_id,
      joiner.joined_by_name,
    ]),
  );

  return callups.map((callup) => ({
    ...callup,
    entries: callup.entries.map((entry) => ({
      ...entry,
      joined_by_name: joinerNameByEntryId.get(entry.id) || null,
    })),
  }));
}

export async function getActiveCallup(): Promise<CallupWithEntries | null> {
  return (await getActiveCallups())[0] || null;
}

export async function hasActiveCallup(): Promise<boolean> {
  return (await getActiveCallups()).length > 0;
}

export async function getActiveCallupById(callupId: string): Promise<CallupWithEntries | null> {
  const callups = await getActiveCallups();
  return callups.find((callup) => callup.id === callupId) || null;
}

export async function getAgendaCallups() {
  const { client, user } = await getCurrentAccount();
  const league = await getSelectedLeague();
  if (!user || !league) return [];
  const { data, error } = await client.from("callups")
    .select("id, league_id, date, start_time, round_type, status, round_id, created_at, callup_entries(count)")
    .eq("league_id", league.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) {
    console.error("Erro ao buscar convocações da agenda:", error);
    return [];
  }
  return (data || []).map((callup) => ({
    ...callup,
    playersCount: callup.callup_entries?.[0]?.count || 0,
  }));
}

async function hasCallupOnDate(
  client: Awaited<ReturnType<typeof getCurrentAccount>>["client"],
  leagueId: string,
  date: string,
  excludeId?: string,
) {
  let query = client.from("callups").select("id")
    .eq("league_id", leagueId).eq("date", date)
    .in("status", ["open", "locked", "converted"]);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

const DUPLICATE_CALLUP_DATE_ERROR = "Já existe uma convocação nesta pelada para essa data. Escolha outro dia.";

export async function openCallup(formData: FormData) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem abrir convocacoes." };
  const date = String(formData.get("date") || "");
  const startTime = String(formData.get("start_time") || "08:00").slice(0, 5) || "08:00";
  const stadiumId = formData.get("stadium_id") ? String(formData.get("stadium_id")) : null;
  const roundType: RoundType = formData.get("round_type") === "friendly" ? "friendly" : "official";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: "Informe uma data valida." };

  const league = await getActiveLeague();
  try {
    if (await hasCallupOnDate(client, league.id, date)) {
      return { success: false, error: DUPLICATE_CALLUP_DATE_ERROR };
    }
  } catch (checkError) {
    return { success: false, error: checkError instanceof Error ? checkError.message : "Não foi possível verificar a data." };
  }
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
      .eq("league_id", league.id)
      .maybeSingle();
    if (!stadiumData) return { success: false, error: "Estádio fora da pelada selecionada." };
    stadiumName = stadiumData.name;
    stadiumMapUrl = stadiumData.google_maps_url;
  }

  const defaultPlayersPerTeam = Math.min(
    MAX_PLAYERS_PER_TEAM,
    Math.max(1, leagueConfig?.players_per_team || DEFAULT_PLAYERS_PER_TEAM),
  );
  const defaultTeamsPerRound = Math.min(
    MAX_TEAMS_PER_ROUND,
    Math.max(MIN_TEAMS_PER_ROUND, leagueConfig?.teams_per_round || TEAMS_PER_ROUND),
  );
  const playersPerTeam = Number(formData.get("players_per_team") || defaultPlayersPerTeam);
  const teamsPerRound = Number(formData.get("teams_per_round") || defaultTeamsPerRound);
  if (!Number.isInteger(playersPerTeam) || playersPerTeam < 5 || playersPerTeam > 7) {
    return { success: false, error: "Escolha 5, 6 ou 7 jogadores por time." };
  }
  if (!Number.isInteger(teamsPerRound) || teamsPerRound < MIN_TEAMS_PER_ROUND || teamsPerRound > MAX_TEAMS_PER_ROUND) {
    return { success: false, error: "Escolha de 2 a 6 times." };
  }
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
      players_per_team: playersPerTeam,
      teams_per_round: teamsPerRound,
    })
    .select("id")
    .single();
  if (error) {
    return { success: false, error: error.code === "23505" ? DUPLICATE_CALLUP_DATE_ERROR : error.message };
  }

  // A convocação já nasce com uma pré-lista vazia. As confirmações entram
  // nela pelo trigger de sincronização, sem exigir uma segunda ação do ADM.
  let prelist: Awaited<ReturnType<typeof createCallupPrelist>>;
  try {
    prelist = await createCallupPrelist(data.id);
  } catch (prelistError) {
    prelist = {
      success: false,
      error: prelistError instanceof Error ? prelistError.message : "Erro ao preparar a pré-lista.",
    };
  }
  if (!prelist.success) {
    const { error: rollbackError } = await client.from("callups")
      .delete().eq("id", data.id).eq("league_id", league.id);
    if (rollbackError) {
      return {
        success: false,
        error: `A convocação foi aberta, mas a pré-lista falhou: ${prelist.error || "erro desconhecido"}. Feche a convocação antes de tentar novamente.`,
      };
    }
    return { success: false, error: prelist.error || "Não foi possível preparar a pré-lista." };
  }

  refreshCallups();
  return { success: true, id: data.id, roundId: prelist.roundId };
}

export async function joinActiveCallup(callupId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para participar." };
  if (!(await selectedCallup(callupId, account.client))) return { success: false, error: "Convocação fora da pelada selecionada." };
  const { error: profileError } = await account.client.rpc("ensure_my_player_account");
  if (profileError) return { success: false, error: profileError.message };
  const { data, error } = await account.client.rpc("join_callup", { p_callup_id: callupId });
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true, status: (data as { status?: "confirmed" | "waitlist" } | null)?.status };
}

export async function leaveActiveCallup(callupId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para sair." };
  if (!(await selectedCallup(callupId, account.client))) return { success: false, error: "Convocação fora da pelada selecionada." };
  const { data: callup } = await account.client
    .from("callups")
    .select("round_id")
    .eq("id", callupId)
    .maybeSingle();
  const { error } = await account.client.rpc("leave_callup", { p_callup_id: callupId });
  if (error) return { success: false, error: error.message };
  const { data: profile } = await account.client.from("account_profiles").select("player_id").eq("user_id", account.user.id).maybeSingle();
  if (profile?.player_id) await notifyCartolaLineupsAboutWithdrawal(account.client, callupId, profile.player_id);
  refreshCallups();
  revalidatePath("/rodadas");
  if (callup?.round_id) {
    revalidatePath(`/rodadas/${callup.round_id}`);
    revalidatePath(`/rodadas/${callup.round_id}/nova-partida`);
  }
  return { success: true };
}

export async function adminAddCallupPlayer(callupId: string, playerId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem alterar a lista." };
  if (!(await selectedCallup(callupId, client)) || !(await selectedRosterPlayer(playerId, client))) {
    return { success: false, error: "Convocação ou jogador fora da pelada selecionada." };
  }
  const { data, error } = await client.rpc("admin_add_callup_player", {
    p_callup_id: callupId,
    p_player_id: playerId,
  });
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true, status: data?.status as "confirmed" | "waitlist" | undefined };
}

export async function repairMyPlayerAccount() {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para concluir o cadastro." };
  const { data, error } = await account.client.rpc("ensure_my_player_account");
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true, playerId: data?.player_id as string | undefined };
}

/**
 * A convocação é colaborativa: qualquer pessoa autenticada pode adicionar um
 * perfil jogável do elenco. WAGs e Torcida continuam fora da lista porque não
 * podem participar de partidas.
 */
export async function addRosterPlayerToCallup(callupId: string, playerId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para alterar a lista." };
  if (!(await selectedCallup(callupId, account.client)) || !(await selectedRosterPlayer(playerId, account.client))) {
    return { success: false, error: "Convocação ou jogador fora da pelada selecionada." };
  }

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
  if (!(await selectedCallup(callupId, client))) return { success: false, error: "Convocação fora da pelada selecionada." };
  const { error } = await client.rpc("admin_remove_callup_player", {
    p_callup_id: callupId,
    p_player_id: playerId,
  });
  if (error) return { success: false, error: error.message };
  await notifyCartolaLineupsAboutWithdrawal(client, callupId, playerId);
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
  if (!(await selectedCallup(callupId, account.client))) return { success: false, error: "Convocação fora da pelada selecionada." };

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

  const client = account.client;
  if (!(await selectedCallup(callupId, client))) return { success: false, error: "Convocação fora da pelada selecionada." };

  const { data: callup, error: callupError } = await client
    .from("callups")
    .select("status, round_id")
    .eq("id", callupId)
    .maybeSingle();
  if (callupError || !callup) {
    return { success: false, error: callupError?.message || "Convocação não encontrada." };
  }

  // O administrador pode retirar qualquer pessoa até o primeiro jogo, inclusive
  // depois do sorteio. A RPC preserva o time da vaga e promove a fila quando
  // houver alguém esperando.
  if (account.isAdmin) {
    const { error } = await client.rpc("admin_remove_callup_player", {
      p_callup_id: callupId,
      p_player_id: playerId,
    });
    if (error) return { success: false, error: error.message };
    await notifyCartolaLineupsAboutWithdrawal(client, callupId, playerId);
    refreshCallups();
    if (callup.round_id) {
      revalidatePath(`/rodadas/${callup.round_id}`);
      revalidatePath(`/rodadas/${callup.round_id}/nova-partida`);
    }
    return { success: true };
  }

  if (callup.status !== "open") {
    return { success: false, error: "Depois do sorteio, somente o administrador pode retirar outro jogador." };
  }

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
  await notifyCartolaLineupsAboutWithdrawal(client, callupId, playerId);

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
  if (!(await selectedCallup(callupId, client))) return { success: false, error: "Convocação fora da pelada selecionada." };
  const selectedLeague = await getSelectedLeague();
  if (!selectedLeague) return { success: false, error: "Selecione uma pelada antes de criar a pré-lista." };

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
    p_league_id: selectedLeague.id,
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

  if (callup.round_type !== "friendly" && selectedLeague?.featureTier === "complete") {
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
  if (!(await selectedCallup(callupId, client))) return { success: false, error: "Convocação fora da pelada selecionada." };
  const { error } = await client.from("callups").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", callupId);
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true };
}

export async function setCallupVisibility(callupId: string, isPublic: boolean) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem alterar a visibilidade da convocação." };
  if (!(await selectedCallup(callupId, client))) return { success: false, error: "Convocação fora da pelada selecionada." };

  const { error } = await client
    .from("callups")
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq("id", callupId);
  if (error) return { success: false, error: error.message };

  refreshCallups();
  return { success: true };
}

export async function lockCallupForRound(callupId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem montar a rodada." };
  if (!(await selectedCallup(callupId, client))) return { success: false, error: "Convocação fora da pelada selecionada." };
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
  if (!(await selectedCallup(callupId, client))) return { success: false, error: "Convocação fora da pelada selecionada." };
  const date = String(formData.get("date") || "");
  const startTime = String(formData.get("start_time") || "08:00").slice(0, 5) || "08:00";
  const stadiumId = formData.get("stadium_id") ? String(formData.get("stadium_id")) : null;
  const roundType: RoundType = formData.get("round_type") === "friendly" ? "friendly" : "official";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: "Informe uma data válida." };

  const league = await getActiveLeague();
  try {
    if (await hasCallupOnDate(client, league.id, date, callupId)) {
      return { success: false, error: DUPLICATE_CALLUP_DATE_ERROR };
    }
  } catch (checkError) {
    return { success: false, error: checkError instanceof Error ? checkError.message : "Não foi possível verificar a data." };
  }
  let stadiumName: string | null = null;
  let stadiumMapUrl: string | null = null;

  if (stadiumId) {
    const { data: stadiumData } = await client
      .from("stadiums")
      .select("name, google_maps_url")
      .eq("id", stadiumId)
      .eq("league_id", league.id)
      .maybeSingle();
    if (!stadiumData) return { success: false, error: "Estádio fora da pelada selecionada." };
    stadiumName = stadiumData.name;
    stadiumMapUrl = stadiumData.google_maps_url;
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

  if (error) return { success: false, error: error.code === "23505" ? DUPLICATE_CALLUP_DATE_ERROR : error.message };

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

