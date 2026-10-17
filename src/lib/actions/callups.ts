"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient, getCurrentAccount } from "../auth";
import type { Callup, CallupEntry, Player } from "../types";
import { scheduleCartolaRoundReminders } from "../cartola-reminder-scheduler";
import { getActiveLeague } from "./rounds";
import { parseOpenCallupRequest } from "@/modules/callups/domain/open-callup";
import { openCallupWithPrelist } from "@/modules/callups/application/open-callup";
import { supabaseCallupOpeningGateway } from "@/modules/callups/infrastructure/supabase-callup-opening-gateway";
import { prepareCallupPrelist } from "@/modules/callups/application/prepare-callup-prelist";
import { supabaseCallupPrelistGateway } from "@/modules/callups/infrastructure/supabase-callup-prelist-gateway";
import { parseEditCallupRequest } from "@/modules/callups/domain/edit-callup";
import { editCallup } from "@/modules/callups/application/edit-callup";
import { supabaseCallupEditingGateway } from "@/modules/callups/infrastructure/supabase-callup-editing-gateway";
import { changeCallupVisibility, closeSelectedCallup, lockSelectedCallup } from "@/modules/callups/application/manage-callup";
import { supabaseCallupManagementGateway } from "@/modules/callups/infrastructure/supabase-callup-management-gateway";
import { joinSelectedCallup, leaveSelectedCallup } from "@/modules/callups/application/participate-in-callup";
import { supabaseCallupParticipationGateway } from "@/modules/callups/infrastructure/supabase-callup-participation-gateway";
import { addOtherCallupPlayer, removeOtherCallupPlayerAsAdmin } from "@/modules/callups/application/manage-callup-players";
import { supabaseCallupPlayersGateway } from "@/modules/callups/infrastructure/supabase-callup-players-gateway";
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

export async function openCallup(formData: FormData) {
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Somente administradores podem abrir convocacoes." };
  const request = parseOpenCallupRequest({
    date: String(formData.get("date") || ""),
    startTime: formData.get("start_time") ? String(formData.get("start_time")) : null,
    stadiumId: formData.get("stadium_id") ? String(formData.get("stadium_id")) : null,
    roundType: formData.get("round_type") ? String(formData.get("round_type")) : null,
    playersPerTeam: formData.get("players_per_team") ? String(formData.get("players_per_team")) : null,
    teamsPerRound: formData.get("teams_per_round") ? String(formData.get("teams_per_round")) : null,
  });
  if (!request) return { success: false as const, error: "Informe uma data valida." };
  const league = await getActiveLeague();
  const result = await openCallupWithPrelist(
    request,
    league.id,
    supabaseCallupOpeningGateway(client),
    (callupId) => prepareSelectedCallupPrelist(callupId, client),
  );
  if (result.success) refreshCallups();
  return result;
}

export async function joinActiveCallup(callupId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para participar." };
  if (!(await selectedCallup(callupId, account.client))) return { success: false, error: "Convocação fora da pelada selecionada." };
  const result = await joinSelectedCallup(callupId, supabaseCallupParticipationGateway(account.client));
  if (result.success) refreshCallups();
  return result;
}

export async function leaveActiveCallup(callupId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para sair." };
  const callup = await selectedCallup(callupId, account.client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };
  const result = await leaveSelectedCallup(
    callupId, callup.league_id, account.user.id, supabaseCallupParticipationGateway(account.client),
  );
  if (!result.success) return result;
  refreshCallups();
  revalidatePath("/rodadas");
  if (result.roundId) {
    revalidatePath(`/rodadas/${result.roundId}`);
    revalidatePath(`/rodadas/${result.roundId}/nova-partida`);
  }
  return { success: true };
}

export async function adminAddCallupPlayer(callupId: string, playerId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Somente administradores podem alterar a lista." };
  if (!(await selectedCallup(callupId, client)) || !(await selectedRosterPlayer(playerId, client))) {
    return { success: false as const, error: "Convocação ou jogador fora da pelada selecionada." };
  }
  const result = await addOtherCallupPlayer(callupId, playerId, "admin", supabaseCallupPlayersGateway(client));
  if (result.success) refreshCallups();
  return result;
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

  const result = await addOtherCallupPlayer(callupId, playerId, "member", supabaseCallupPlayersGateway(account.client));
  if (result.success) refreshCallups();
  return result;
}

export async function adminRemoveCallupPlayer(callupId: string, playerId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem alterar a lista." };
  if (!(await selectedCallup(callupId, client))) return { success: false, error: "Convocação fora da pelada selecionada." };
  const result = await removeOtherCallupPlayerAsAdmin(callupId, playerId, supabaseCallupPlayersGateway(client));
  if (result.success) refreshCallups();
  return result;
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
    const result = await removeOtherCallupPlayerAsAdmin(callupId, playerId, supabaseCallupPlayersGateway(client));
    if (!result.success) return result;
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

type PublicPrelistResult =
  | { success: true; roundId: string; error?: undefined }
  | { success: false; error: string; roundId?: undefined };

export async function createCallupPrelist(callupId: string): Promise<PublicPrelistResult> {
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Somente administradores podem criar a pre-lista." };
  return prepareSelectedCallupPrelist(callupId, client);
}

async function prepareSelectedCallupPrelist(
  callupId: string,
  client: Awaited<ReturnType<typeof getCurrentAccount>>["client"],
): Promise<PublicPrelistResult> {
  if (!(await selectedCallup(callupId, client))) return { success: false as const, error: "Convocação fora da pelada selecionada." };
  const selectedLeague = await getSelectedLeague();
  if (!selectedLeague) return { success: false as const, error: "Selecione uma pelada antes de criar a pré-lista." };
  const result = await prepareCallupPrelist(
    callupId,
    selectedLeague,
    supabaseCallupPrelistGateway(client),
    (input) => scheduleCartolaRoundReminders({ ...input, includeOpening: true }),
  );
  if (!result.success) return result;
  if (result.created) {
    refreshCallups();
    revalidatePath("/cartola");
  }
  return { success: true as const, roundId: result.roundId };
}

export async function closeCallup(callupId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem fechar convocacoes." };
  const callup = await selectedCallup(callupId, client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };
  const result = await closeSelectedCallup(callupId, callup.league_id, supabaseCallupManagementGateway(client));
  if (result.success) refreshCallups();
  return result;
}

export async function setCallupVisibility(callupId: string, isPublic: boolean) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem alterar a visibilidade da convocação." };
  const callup = await selectedCallup(callupId, client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };
  const result = await changeCallupVisibility(callupId, callup.league_id, isPublic, supabaseCallupManagementGateway(client));
  if (result.success) refreshCallups();
  return result;
}

export async function lockCallupForRound(callupId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem montar a rodada." };
  const callup = await selectedCallup(callupId, client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };
  const result = await lockSelectedCallup(callupId, callup.league_id, supabaseCallupManagementGateway(client));
  if (result.success) refreshCallups();
  return result;
}

export async function updateCallup(formData: FormData) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem editar convocações." };
  const callupId = String(formData.get("callup_id") || "");
  if (!(await selectedCallup(callupId, client))) return { success: false, error: "Convocação fora da pelada selecionada." };
  const request = parseEditCallupRequest({
    callupId,
    date: String(formData.get("date") || ""),
    startTime: formData.get("start_time") ? String(formData.get("start_time")) : null,
    stadiumId: formData.get("stadium_id") ? String(formData.get("stadium_id")) : null,
    roundType: formData.get("round_type") ? String(formData.get("round_type")) : null,
  });
  if (!request) return { success: false, error: "Informe uma data válida." };
  const league = await getActiveLeague();
  const result = await editCallup(request, league.id, supabaseCallupEditingGateway(client));
  if (result.success) refreshCallups();
  return result;
}

