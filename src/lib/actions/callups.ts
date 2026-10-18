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
import { inviteCallupGuest, removeCallupEntryForAccount } from "@/modules/callups/application/manage-callup-guests";
import { supabaseCallupGuestsGateway } from "@/modules/callups/infrastructure/supabase-callup-guests-gateway";
import { hasCallupClosingMatch } from "../callup-lifecycle";
import { getSelectedLeague } from "../league-context";

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
  let invitedCallupId: string | null = null;

  // O convite atual leva somente o token. Mantemos o parâmetro callupId na
  // assinatura para que links antigos continuem abrindo, mas a fonte
  // autoritativa sempre é o token validado pelo RPC.
  if (invite?.inviteToken && account.user) {
    const { data, error } = await client.rpc("claim_callup_invite_by_token", {
      p_invite_token: invite.inviteToken,
    });
    if (error || !data) return [];
    invitedCallupId = data;
  }

  const league = await getSelectedLeague();
  if (!league && !invitedCallupId) return [];

  let query = client
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
    .in("status", ["open", "locked", "converted"])
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .order("created_at", { ascending: true });
  query = invitedCallupId
    ? query.eq("id", invitedCallupId)
    : query.eq("league_id", league!.id);
  const { data, error } = await query;

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
  const result = await inviteCallupGuest(
    { callupId, name, playerProfile, isGoalkeeper },
    supabaseCallupGuestsGateway(account.client),
  );
  if (result.success) refreshCallups();
  return result;
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
  const callup = await selectedCallup(callupId, client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };
  const result = await removeCallupEntryForAccount(
    { callupId, playerId, leagueId: callup.league_id, isAdmin: account.isAdmin },
    supabaseCallupGuestsGateway(client),
    supabaseCallupPlayersGateway(client),
  );
  if (!result.success) return result;
  refreshCallups();
  if (result.revalidateRoundId) {
    revalidatePath(`/rodadas/${result.revalidateRoundId}`);
    revalidatePath(`/rodadas/${result.revalidateRoundId}/nova-partida`);
  }
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

