"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import type { Player, PlayerRegistrationEvent, RosterUnreadState } from "@/lib/types";
import { calculateRoundStats } from "./stats";

export async function getRegistrationHistory(): Promise<PlayerRegistrationEvent[]> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return [];

  const { data, error } = await account.client
    .from("player_registration_events")
    .select("id, player_id, player_name, avatar_url, member_category, source, created_by_user_id, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Erro ao buscar historico de cadastros:", error);
    return [];
  }
  const events = data as PlayerRegistrationEvent[];
  const playerIds = events.map((event) => event.player_id).filter((id): id is string => Boolean(id));
  if (playerIds.length === 0) return events;
  const { data: currentPlayers } = await account.client
    .from("players")
    .select("id, name, avatar_url, member_category")
    .in("id", playerIds);
  const currentById = new Map((currentPlayers || []).map((player) => [player.id, player]));
  return events.map((event) => {
    const current = event.player_id ? currentById.get(event.player_id) : null;
    return current ? {
      ...event,
      player_name: current.name,
      avatar_url: current.avatar_url || event.avatar_url,
      member_category: current.member_category,
    } : event;
  }) as PlayerRegistrationEvent[];
}

export async function getRosterUnreadState(): Promise<RosterUnreadState> {
  const account = await getCurrentAccount();
  if (!account.isAdmin || !account.user) return { count: 0, lastSeenAt: null };

  const { data: readState } = await account.client
    .from("admin_roster_reads")
    .select("last_seen_at")
    .eq("user_id", account.user.id)
    .maybeSingle();

  if (!readState?.last_seen_at) return { count: 0, lastSeenAt: null };

  const { count, error } = await account.client
    .from("player_registration_events")
    .select("id", { count: "exact", head: true })
    .gt("created_at", readState.last_seen_at);

  if (error) {
    console.error("Erro ao contar novos cadastros:", error);
    return { count: 0, lastSeenAt: readState.last_seen_at };
  }
  return { count: count || 0, lastSeenAt: readState.last_seen_at };
}

export async function getUnreadRosterPlayers(): Promise<{ playerIds: string[]; seenThrough: string | null }> {
  const account = await getCurrentAccount();
  if (!account.isAdmin || !account.user) return { playerIds: [], seenThrough: null };

  const { data: readState } = await account.client
    .from("admin_roster_reads")
    .select("last_seen_at")
    .eq("user_id", account.user.id)
    .maybeSingle();
  if (!readState?.last_seen_at) return { playerIds: [], seenThrough: null };

  const { data, error } = await account.client
    .from("player_registration_events")
    .select("player_id, created_at")
    .gt("created_at", readState.last_seen_at)
    .not("player_id", "is", null)
    .order("created_at", { ascending: true });
  if (error || !data) {
    if (error) console.error("Erro ao buscar cadastros não vistos:", error);
    return { playerIds: [], seenThrough: null };
  }

  return {
    playerIds: [...new Set(data.map((event) => event.player_id).filter((id): id is string => Boolean(id)))],
    seenThrough: data.at(-1)?.created_at || null,
  };
}

export async function markRosterActivitySeenThrough(seenThrough: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin || !account.user) return { success: false, error: "Somente administradores podem atualizar esta leitura." };

  const parsed = new Date(seenThrough);
  if (Number.isNaN(parsed.getTime())) return { success: false, error: "Data de leitura inválida." };
  const safeSeenThrough = new Date(Math.min(parsed.getTime(), Date.now())).toISOString();

  const { data: current } = await account.client
    .from("admin_roster_reads")
    .select("last_seen_at")
    .eq("user_id", account.user.id)
    .maybeSingle();
  if (current?.last_seen_at && new Date(current.last_seen_at).getTime() >= new Date(safeSeenThrough).getTime()) {
    return { success: true };
  }

  const { error } = await account.client
    .from("admin_roster_reads")
    .upsert({ user_id: account.user.id, last_seen_at: safeSeenThrough }, { onConflict: "user_id" });
  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/jogadores");
  return { success: true };
}

export async function markRosterActivitySeen() {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores podem atualizar esta leitura." };
  const { error } = await account.client.rpc("mark_roster_activity_seen");
  if (error) return { success: false, error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}

export async function getRegisteredMergeCandidates(guestId: string): Promise<Player[]> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return [];

  const { data, error } = await account.client
    .from("players")
    .select("*")
    .neq("id", guestId)
    .eq("is_selectable", true)
    .in("member_category", ["player", "guest"])
    .order("name");
  if (error) {
    console.error("Erro ao buscar candidatos para uniao:", error);
    return [];
  }
  return data as Player[];
}

export async function mergeGuestWithRegistered(guestId: string, registeredId: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores podem unir perfis." };
  const { data, error } = await account.client.rpc("merge_selectable_player_profiles", {
    p_target_id: guestId,
    p_source_id: registeredId,
  });
  if (error) return { success: false, error: error.message };

  const affectedRoundIds = Array.isArray(data) ? data.map(String) : [];
  for (const roundId of affectedRoundIds) {
    const result = await calculateRoundStats(roundId);
    if (!result.success) return { success: false, error: `Perfis unidos, mas a rodada precisa ser recalculada: ${result.error}` };
  }
  if (affectedRoundIds.length) {
    const { data: rounds } = await account.client.from("rounds").select("id, date, number, status, round_type").in("id", affectedRoundIds).order("date").order("number");
    const firstOfficial = (rounds || []).find((round) => round.status === "finished" && round.round_type === "official");
    if (firstOfficial) {
      const { data: fantasyRound } = await account.client.from("fantasy_rounds").select("id").eq("round_id", firstOfficial.id).maybeSingle();
      if (fantasyRound) {
        const { error: fantasyError } = await account.client.rpc("reprocess_fantasy_from_round", { p_round_id: firstOfficial.id });
        if (fantasyError) return { success: false, error: `Perfis unidos, mas o Cartola precisa ser reprocessado: ${fantasyError.message}` };
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/jogadores");
  revalidatePath("/ranking");
  revalidatePath("/admin/jogadores");
  revalidatePath(`/jogadores/${guestId}`);
  return { success: true, playerId: guestId };
}
