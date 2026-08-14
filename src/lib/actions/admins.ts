"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";

export type ManagedAccount = {
  userId: string;
  role: "admin" | "player";
  createdAt: string;
  player: {
    id: string;
    name: string;
    nickname: string | null;
    avatarUrl: string | null;
  } | null;
};

export async function getManagedAccounts(): Promise<ManagedAccount[]> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return [];

  const { data, error } = await account.client
    .from("account_profiles")
    .select(`
      user_id,
      role,
      created_at,
      player:players!account_profiles_player_id_fkey (
        id,
        name,
        nickname,
        avatar_url
      )
    `);

  if (error) {
    console.error("Erro ao buscar contas administrativas:", error);
    return [];
  }

  return (data || []).map((profile: any) => {
    const player = Array.isArray(profile.player) ? profile.player[0] : profile.player;
    return {
      userId: profile.user_id,
      role: profile.role === "admin" ? "admin" : "player",
      createdAt: profile.created_at,
      player: player ? {
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        avatarUrl: player.avatar_url,
      } : null,
    } satisfies ManagedAccount;
  }).sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return (a.player?.name || a.userId).localeCompare(b.player?.name || b.userId, "pt-BR");
  });
}

export async function setAccountAdminRole(targetUserId: string, makeAdmin: boolean) {
  const account = await getCurrentAccount();
  if (!account.isAdmin || !account.user) {
    return { success: false, error: "Somente administradores podem alterar acessos." };
  }
  if (!targetUserId) return { success: false, error: "Escolha uma conta cadastrada." };

  const { data, error } = await account.client.rpc("manage_account_admin_role", {
    p_target_user_id: targetUserId,
    p_make_admin: makeAdmin,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/administradores");
  revalidatePath("/admin/jogadores");
  revalidatePath("/mais");
  revalidatePath("/", "layout");
  return { success: true, role: String(data) as "admin" | "player" };
}
