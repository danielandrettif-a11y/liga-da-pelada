"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import type { Player, PlayerRegistrationEvent, RosterUnreadState } from "@/lib/types";

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

  const { data: profiles, error: profileError } = await account.client
    .from("account_profiles")
    .select("player_id")
    .not("player_id", "is", null);
  if (profileError) {
    console.error("Erro ao buscar contas vinculadas:", profileError);
    return [];
  }

  const ids = profiles.map((profile) => profile.player_id).filter((id): id is string => Boolean(id && id !== guestId));
  if (ids.length === 0) return [];
  const { data, error } = await account.client
    .from("players")
    .select("*")
    .in("id", ids)
    .eq("member_category", "player")
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
  const { data, error } = await account.client.rpc("merge_player_profiles", {
    p_guest_id: guestId,
    p_registered_id: registeredId,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/jogadores");
  revalidatePath("/ranking");
  revalidatePath("/admin/jogadores");
  revalidatePath(`/jogadores/${guestId}`);
  return { success: true, playerId: String(data || guestId) };
}
