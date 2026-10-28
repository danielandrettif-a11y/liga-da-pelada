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
import { inviteCallupGuest, inviteCallupGuestList, removeCallupEntryForAccount } from "@/modules/callups/application/manage-callup-guests";
import { supabaseCallupGuestsGateway } from "@/modules/callups/infrastructure/supabase-callup-guests-gateway";
import {
  MAX_CALLUP_GUEST_LIST_SIZE,
  normalizeCallupGuestName,
  parseWhatsAppGuestList,
} from "@/modules/callups/domain/callup-guest-list";
import { hasCallupClosingMatch } from "../callup-lifecycle";
import { getSelectedLeague } from "../league-context";
import { createServiceClient } from "../supabase/service";
import { resolveCallupInvite } from "../callup-invite-server";
import { callupApiFor } from "@/modules/callups/infrastructure/callup-api-session";

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
  if (!data) return false;
  if (league.featureTier !== "quick") return true;
  const { data: player } = await client.from("players").select("member_category")
    .eq("id", playerId).maybeSingle();
  return player?.member_category === "guest";
}

export async function getActiveCallups(invite?: { callupId?: string; inviteToken?: string }): Promise<CallupWithEntries[]> {
  const account = await getCurrentAccount();
  const client = account.client;
  let readClient = client;
  let invitedCallupId: string | null = null;

  // A rota curta resolve o ID antes de chegar aqui e reutiliza a RPC antiga,
  // permitindo que o convite funcione mesmo antes da migration 312 ser
  // aplicada. O fluxo apenas por token permanece como fallback compatível.
  if (invite?.inviteToken) {
    if (account.user) {
      const { data, error } = invite.callupId
        ? await client.rpc("claim_callup_invite", {
          p_callup_id: invite.callupId,
          p_invite_token: invite.inviteToken,
        })
        : await client.rpc("claim_callup_invite_by_token", {
          p_invite_token: invite.inviteToken,
        });
      if (error || !data) return [];
      invitedCallupId = invite.callupId || String(data);
    } else {
      const target = await resolveCallupInvite(invite.inviteToken);
      if (!target || (invite.callupId && target.id !== invite.callupId)) return [];
      const service = createServiceClient();
      if (!service) return [];
      invitedCallupId = target.id;
      readClient = service;
    }
  }

  const league = await getSelectedLeague();
  if (!league && !invitedCallupId) return [];

  try {
    const api = await callupApiFor(client);
    if (api && (league || invitedCallupId)) {
      return await api.listActive(league?.id || "", invitedCallupId || undefined);
    }
  } catch (error) {
    console.error("Erro ao buscar convocação via API:", error);
  }

  let query = readClient
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

  const { data: joiners, error: joinersError } = await readClient.rpc("get_callup_entry_joiners", {
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

  try {
    const api = await callupApiFor(client);
    if (api) {
      return await api.listAgenda(league.id);
    }
  } catch (error) {
    console.error("Erro ao buscar convocações da agenda via API:", error);
  }

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
  const parsedRequest = parseOpenCallupRequest({
    date: String(formData.get("date") || ""),
    startTime: formData.get("start_time") ? String(formData.get("start_time")) : null,
    stadiumId: formData.get("stadium_id") ? String(formData.get("stadium_id")) : null,
    roundType: formData.get("round_type") ? String(formData.get("round_type")) : null,
    playersPerTeam: formData.get("players_per_team") ? String(formData.get("players_per_team")) : null,
    teamsPerRound: formData.get("teams_per_round") ? String(formData.get("teams_per_round")) : null,
  });
  if (!parsedRequest) return { success: false as const, error: "Informe uma data valida." };
  const league = await getActiveLeague();
  const request = league.feature_tier === "quick"
    ? { ...parsedRequest, roundType: "friendly" as const }
    : parsedRequest;

  try {
    const api = await callupApiFor(client);
    if (api) {
      const res = await api.openCallup(league.id, {
        date: request.date,
        startTime: request.startTime,
        stadiumId: request.stadiumId,
        roundType: request.roundType,
        playersPerTeam: request.requestedPlayersPerTeam ? Number(request.requestedPlayersPerTeam) : null,
        teamsPerRound: request.requestedTeamsPerRound ? Number(request.requestedTeamsPerRound) : null,
      });
      refreshCallups();
      return { success: true as const, id: res.callupId, callupId: res.callupId, roundId: undefined };
    }
  } catch (error: any) {
    console.error("Erro ao abrir convocação via API:", error);
    return { success: false as const, error: error?.message || "Não foi possível abrir a convocação." };
  }

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
  const callup = await selectedCallup(callupId, account.client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };

  try {
    const api = await callupApiFor(account.client);
    if (api) {
      const res = await api.joinCallup(callup.league_id, callupId);
      refreshCallups();
      const status: "confirmed" | "waitlist" = res.status === "confirmed" ? "confirmed" : "waitlist";
      return { success: true, status };
    }
  } catch (error: any) {
    console.error("Erro ao entrar na convocação via API:", error);
    return { success: false, error: error?.message || "Não foi possível entrar na convocação." };
  }

  const result = await joinSelectedCallup(callupId, supabaseCallupParticipationGateway(account.client));
  if (result.success) refreshCallups();
  return result;
}

export async function leaveActiveCallup(callupId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para sair." };
  const callup = await selectedCallup(callupId, account.client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };

  try {
    const api = await callupApiFor(account.client);
    if (api) {
      const res = await api.leaveCallup(callup.league_id, callupId);
      refreshCallups();
      revalidatePath("/rodadas");
      if (res.roundId) {
        revalidatePath(`/rodadas/${res.roundId}`);
        revalidatePath(`/rodadas/${res.roundId}/nova-partida`);
      }
      return { success: true };
    }
  } catch (error: any) {
    console.error("Erro ao sair da convocação via API:", error);
    return { success: false, error: error?.message || "Não foi possível sair da convocação." };
  }

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
  const callup = await selectedCallup(callupId, client);
  if (!callup || !(await selectedRosterPlayer(playerId, client))) {
    return { success: false as const, error: "Convocação ou jogador fora da pelada selecionada." };
  }

  try {
    const api = await callupApiFor(client);
    if (api) {
      const res = await api.addPlayer(callup.league_id, callupId, playerId, true);
      refreshCallups();
      return { success: true as const, status: res.status };
    }
  } catch (error: any) {
    console.error("Erro ao adicionar jogador via API:", error);
    return { success: false as const, error: error?.message || "Não foi possível adicionar o jogador." };
  }

  const result = await addOtherCallupPlayer(callupId, playerId, "admin", supabaseCallupPlayersGateway(client));
  if (result.success) refreshCallups();
  return result;
}

export async function repairMyPlayerAccount() {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para concluir o cadastro." };

  try {
    const api = await callupApiFor(account.client);
    if (api) {
      const res = await api.repairMyPlayer();
      refreshCallups();
      return { success: true, playerId: res.playerId };
    }
  } catch (error: any) {
    console.error("Erro ao reparar conta via API:", error);
  }

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
  const callup = await selectedCallup(callupId, account.client);
  if (!callup || !(await selectedRosterPlayer(playerId, account.client))) {
    return { success: false, error: "Convocação ou jogador fora da pelada selecionada." };
  }

  try {
    const api = await callupApiFor(account.client);
    if (api) {
      const res = await api.addPlayer(callup.league_id, callupId, playerId, false);
      refreshCallups();
      return { success: true, status: res.status };
    }
  } catch (error: any) {
    console.error("Erro ao adicionar jogador do elenco via API:", error);
    return { success: false, error: error?.message || "Não foi possível adicionar o jogador." };
  }

  const result = await addOtherCallupPlayer(callupId, playerId, "member", supabaseCallupPlayersGateway(account.client));
  if (result.success) refreshCallups();
  return result;
}

/**
 * Adiciona vários atletas com uma única ida do navegador ao servidor. Os RPCs
 * continuam decidindo atomicamente quem entra como confirmado ou na fila,
 * evitando que a capacidade seja calculada somente no cliente.
 */
export async function addRosterPlayersToCallup(callupId: string, playerIds: string[]) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false as const, error: "Entre na sua conta para alterar a lista." };
  const callup = await selectedCallup(callupId, account.client);
  const league = await getSelectedLeague();
  if (!callup || !league) return { success: false as const, error: "Convocação fora da pelada selecionada." };

  const normalizedIds = [...new Set(playerIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 50);
  if (!normalizedIds.length) return { success: false as const, error: "Selecione pelo menos um jogador." };

  const { data: memberships, error: membershipError } = await account.client
    .from("league_members")
    .select("player_id")
    .eq("league_id", league.id)
    .eq("is_active", true)
    .in("player_id", normalizedIds);
  if (membershipError) return { success: false as const, error: membershipError.message };

  let allowedIds = (memberships || []).map((item) => item.player_id as string);
  if (league.featureTier === "quick" && allowedIds.length) {
    const { data: guests, error: guestError } = await account.client
      .from("players")
      .select("id")
      .in("id", allowedIds)
      .eq("member_category", "guest");
    if (guestError) return { success: false as const, error: guestError.message };
    allowedIds = (guests || []).map((item) => item.id as string);
  }
  if (allowedIds.length !== normalizedIds.length) {
    return { success: false as const, error: "Um ou mais jogadores não pertencem ao elenco desta pelada." };
  }

  try {
    const api = await callupApiFor(account.client);
    if (api) {
      const results = await Promise.all(allowedIds.map(async (playerId): Promise<{ success: true; error?: undefined } | { success: false; error: string }> => {
        try {
          await api.addPlayer(callup.league_id, callupId, playerId, false);
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err?.message || "Erro ao adicionar jogador." };
        }
      }));
      const failed = results.filter((r): r is { success: false; error: string } => !r.success);
      if (failed.length === results.length) {
        return { success: false as const, error: failed[0]?.error || "Não foi possível adicionar os jogadores." };
      }
      refreshCallups();
      return {
        success: true as const,
        added: results.length - failed.length,
        failed: failed.length,
        error: failed.length ? `${failed.length} jogador(es) não puderam ser adicionados.` : undefined,
      };
    }
  } catch (error: any) {
    console.error("Erro ao adicionar jogadores em lote via API:", error);
  }

  const gateway = supabaseCallupPlayersGateway(account.client);
  const results = await Promise.all(allowedIds.map((playerId) =>
    addOtherCallupPlayer(callupId, playerId, "member", gateway),
  ));
  const failed = results.filter((result) => !result.success);
  if (failed.length === results.length) {
    return { success: false as const, error: failed[0]?.error || "Não foi possível adicionar os jogadores." };
  }
  refreshCallups();
  return {
    success: true as const,
    added: results.length - failed.length,
    failed: failed.length,
    error: failed.length ? `${failed.length} jogador(es) não puderam ser adicionados.` : undefined,
  };
}

export async function adminRemoveCallupPlayer(callupId: string, playerId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem alterar a lista." };
  const callup = await selectedCallup(callupId, client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };

  try {
    const api = await callupApiFor(client);
    if (api) {
      await api.removePlayer(callup.league_id, callupId, playerId, true);
      refreshCallups();
      return { success: true };
    }
  } catch (error: any) {
    console.error("Erro ao remover jogador via API:", error);
    return { success: false, error: error?.message || "Não foi possível remover o jogador." };
  }

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
  const callup = await selectedCallup(callupId, account.client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };

  try {
    const api = await callupApiFor(account.client);
    if (api) {
      const res = await api.inviteGuest(callup.league_id, callupId, { name, playerProfile, isGoalkeeper });
      refreshCallups();
      return { success: true, playerId: res.playerId, status: res.status };
    }
  } catch (error: any) {
    console.error("Erro ao convidar amigo via API:", error);
    return { success: false, error: error?.message || "Não foi possível convidar o amigo." };
  }

  const result = await inviteCallupGuest(
    { callupId, name, playerProfile, isGoalkeeper },
    supabaseCallupGuestsGateway(account.client),
  );
  if (result.success) refreshCallups();
  return result;
}

/**
 * Cola uma lista do WhatsApp e cria os novos nomes como convidados na ordem
 * recebida. A ação em lote é administrativa para evitar criação abusiva de
 * perfis; cada item reutiliza o RPC transacional do fluxo individual.
 */
export async function inviteGuestListToCallup({
  callupId,
  text,
  playerProfile = "midfield",
}: {
  callupId: string;
  text: string;
  playerProfile?: "offensive" | "midfield" | "defensive";
}) {
  const client = await getAdminClient();
  if (!client) {
    return {
      success: false,
      created: 0,
      confirmed: 0,
      waitlisted: 0,
      ignoredExisting: [] as string[],
      failed: [] as Array<{ name: string; error: string }>,
      error: "Somente administradores podem importar uma lista completa.",
    };
  }

  const callup = await selectedCallup(callupId, client);
  if (!callup) {
    return {
      success: false,
      created: 0,
      confirmed: 0,
      waitlisted: 0,
      ignoredExisting: [] as string[],
      failed: [] as Array<{ name: string; error: string }>,
      error: "Convocação fora da pelada selecionada.",
    };
  }

  const parsed = parseWhatsAppGuestList(text);
  if (parsed.length > MAX_CALLUP_GUEST_LIST_SIZE) {
    return {
      success: false,
      created: 0,
      confirmed: 0,
      waitlisted: 0,
      ignoredExisting: [] as string[],
      failed: [] as Array<{ name: string; error: string }>,
      error: `Importe no máximo ${MAX_CALLUP_GUEST_LIST_SIZE} nomes por vez.`,
    };
  }

  const { data: memberRows, error: membersError } = await client
    .from("league_members")
    .select("players(name)")
    .eq("league_id", callup.league_id)
    .eq("is_active", true);
  if (membersError) {
    return {
      success: false,
      created: 0,
      confirmed: 0,
      waitlisted: 0,
      ignoredExisting: [] as string[],
      failed: [] as Array<{ name: string; error: string }>,
      error: "Não foi possível conferir os nomes que já existem no elenco.",
    };
  }

  const existingNames = new Set((memberRows || []).flatMap((row) => {
    const relation = (row as unknown as { players?: { name?: string | null } | Array<{ name?: string | null }> | null }).players;
    const players = Array.isArray(relation) ? relation : relation ? [relation] : [];
    return players.flatMap((player) => player.name ? [normalizeCallupGuestName(player.name)] : []);
  }));
  const ignoredExisting = parsed.filter((guest) => existingNames.has(normalizeCallupGuestName(guest.name))).map((guest) => guest.name);
  const guests = parsed.filter((guest) => !existingNames.has(normalizeCallupGuestName(guest.name)));

  try {
    const api = await callupApiFor(client);
    if (api) {
      const res = await api.inviteGuestList(callup.league_id, callupId, guests, playerProfile);
      if (res.created > 0) refreshCallups();
      return { success: true, ...res, ignoredExisting };
    }
  } catch (error: any) {
    console.error("Erro ao importar lista de convidados via API:", error);
  }

  const result = await inviteCallupGuestList(
    { callupId, guests, playerProfile },
    supabaseCallupGuestsGateway(client),
  );
  if (result.created > 0) refreshCallups();
  return { ...result, ignoredExisting };
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

  try {
    const api = await callupApiFor(client);
    if (api) {
      const res = await api.removePlayer(callup.league_id, callupId, playerId, account.isAdmin);
      refreshCallups();
      if (res.revalidateRoundId) {
        revalidatePath(`/rodadas/${res.revalidateRoundId}`);
        revalidatePath(`/rodadas/${res.revalidateRoundId}/nova-partida`);
      }
      return { success: true };
    }
  } catch (error: any) {
    console.error("Erro ao remover entrada via API:", error);
  }

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
  const callup = await selectedCallup(callupId, client);
  if (!callup) return { success: false as const, error: "Convocação fora da pelada selecionada." };
  const selectedLeague = await getSelectedLeague();
  if (!selectedLeague) return { success: false as const, error: "Selecione uma pelada antes de criar a pré-lista." };

  try {
    const api = await callupApiFor(client);
    if (api) {
      const res = await api.createPrelist(selectedLeague.id, callupId);
      refreshCallups();
      revalidatePath("/cartola");
      return { success: true as const, roundId: res.roundId };
    }
  } catch (error: any) {
    console.error("Erro ao criar pré-lista via API:", error);
  }

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

  try {
    const api = await callupApiFor(client);
    if (api) {
      await api.closeCallup(callup.league_id, callupId);
      refreshCallups();
      return { success: true };
    }
  } catch (error: any) {
    console.error("Erro ao fechar convocação via API:", error);
    return { success: false, error: error?.message || "Não foi possível fechar a convocação." };
  }

  const result = await closeSelectedCallup(callupId, callup.league_id, supabaseCallupManagementGateway(client));
  if (result.success) refreshCallups();
  return result;
}

export async function setCallupVisibility(callupId: string, isPublic: boolean) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem alterar a visibilidade da convocação." };
  const callup = await selectedCallup(callupId, client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };

  try {
    const api = await callupApiFor(client);
    if (api) {
      await api.setVisibility(callup.league_id, callupId, isPublic);
      refreshCallups();
      return { success: true };
    }
  } catch (error: any) {
    console.error("Erro ao alterar visibilidade via API:", error);
    return { success: false, error: error?.message || "Não foi possível alterar a visibilidade." };
  }

  const result = await changeCallupVisibility(callupId, callup.league_id, isPublic, supabaseCallupManagementGateway(client));
  if (result.success) refreshCallups();
  return result;
}

export async function lockCallupForRound(callupId: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem montar a rodada." };
  const callup = await selectedCallup(callupId, client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };

  try {
    const api = await callupApiFor(client);
    if (api) {
      await api.lockCallup(callup.league_id, callupId);
      refreshCallups();
      return { success: true };
    }
  } catch (error: any) {
    console.error("Erro ao trancar convocação via API:", error);
    return { success: false, error: error?.message || "Não foi possível trancar a convocação." };
  }

  const result = await lockSelectedCallup(callupId, callup.league_id, supabaseCallupManagementGateway(client));
  if (result.success) refreshCallups();
  return result;
}

export async function updateCallup(formData: FormData) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem editar convocações." };
  const callupId = String(formData.get("callup_id") || "");
  const callup = await selectedCallup(callupId, client);
  if (!callup) return { success: false, error: "Convocação fora da pelada selecionada." };
  const parsedRequest = parseEditCallupRequest({
    callupId,
    date: String(formData.get("date") || ""),
    startTime: formData.get("start_time") ? String(formData.get("start_time")) : null,
    stadiumId: formData.get("stadium_id") ? String(formData.get("stadium_id")) : null,
    roundType: formData.get("round_type") ? String(formData.get("round_type")) : null,
  });
  if (!parsedRequest) return { success: false, error: "Informe uma data válida." };
  const league = await getActiveLeague();
  const request = league.feature_tier === "quick"
    ? { ...parsedRequest, roundType: "friendly" as const }
    : parsedRequest;

  try {
    const api = await callupApiFor(client);
    if (api) {
      await api.updateCallup(league.id, callupId, {
        date: request.date,
        startTime: request.startTime,
        stadiumId: request.stadiumId,
        roundType: request.roundType,
      });
      refreshCallups();
      return { success: true };
    }
  } catch (error: any) {
    console.error("Erro ao editar convocação via API:", error);
    return { success: false, error: error?.message || "Não foi possível editar a convocação." };
  }

  const result = await editCallup(request, league.id, supabaseCallupEditingGateway(client));
  if (result.success) refreshCallups();
  return result;
}

