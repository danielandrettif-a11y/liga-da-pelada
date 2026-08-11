"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient, getCurrentAccount } from "../auth";
import { supabase } from "../supabase";
import type { Callup, CallupEntry, Player, RoundType } from "../types";
import { getActiveLeague } from "./rounds";

export type CallupEntryWithPlayer = CallupEntry & { player: Player };
export type CallupWithEntries = Callup & { entries: CallupEntryWithPlayer[] };

function refreshCallups() {
  revalidatePath("/", "layout");
  revalidatePath("/convocacao");
  revalidatePath("/mais");
  revalidatePath("/admin/rodada");
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
  const roundType: RoundType = formData.get("round_type") === "friendly" ? "friendly" : "official";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: "Informe uma data valida." };

  const league = await getActiveLeague();
  const { data, error } = await client
    .from("callups")
    .insert({ league_id: league.id, date, round_type: roundType, status: "open" })
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
  const { data: entries, error: entriesError } = await client
    .from("callup_entries")
    .select("id")
    .eq("callup_id", callupId)
    .eq("status", "confirmed");
  if (entriesError) return { success: false, error: entriesError.message };
  if ((entries?.length || 0) !== 15) return { success: false, error: "A lista precisa ter 15 confirmados para montar a rodada." };
  const { error } = await client.from("callups").update({ status: "locked", updated_at: new Date().toISOString() }).eq("id", callupId).eq("status", "open");
  if (error) return { success: false, error: error.message };
  refreshCallups();
  return { success: true };
}
