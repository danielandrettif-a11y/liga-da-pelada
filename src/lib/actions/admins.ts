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

  const managedResult = await account.client.rpc("list_manageable_accounts");
  if (!managedResult.error) {
    return (managedResult.data || []).map((profile: any) => ({
      userId: profile.user_id,
      role: profile.role === "admin" ? "admin" : "player",
      createdAt: profile.created_at,
      player: profile.player_id ? {
        id: profile.player_id,
        name: profile.player_name,
        nickname: profile.player_nickname,
        avatarUrl: profile.player_avatar_url,
      } : null,
    } satisfies ManagedAccount)).sort(sortManagedAccounts);
  }

  // Compatibilidade enquanto a migration mais recente ainda não foi aplicada.
  const { data, error } = await account.client.from("account_profiles").select(`
    user_id, role, created_at,
    player:players!account_profiles_player_id_fkey (id, name, nickname, avatar_url)
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
  }).sort(sortManagedAccounts);
}

function sortManagedAccounts(a: ManagedAccount, b: ManagedAccount) {
  if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
  return (a.player?.name || a.userId).localeCompare(b.player?.name || b.userId, "pt-BR");
}

export async function setAccountAdminRole(targetUserId: string, makeAdmin: boolean) {
  try {
    const account = await getCurrentAccount();
    if (!account.isAdmin || !account.user) {
      return { success: false, error: "Somente administradores podem alterar acessos." };
    }
    if (!targetUserId) return { success: false, error: "Escolha uma conta cadastrada." };

    const { data, error } = await account.client.rpc("manage_account_admin_role", {
      p_target_user_id: targetUserId,
      p_make_admin: makeAdmin,
    });

    if (error) {
      const migrationMissing = error.message.includes("manage_account_admin_role") || error.code === "PGRST202";
      const legacyAuditConstraint = error.message.includes("admin_role_audit_previous_role_check");
      return {
        success: false,
        error: migrationMissing
          ? "Execute as migrations pendentes no Supabase para liberar a gestão de ADMs."
          : legacyAuditConstraint
            ? "A correção de contas antigas ainda não foi aplicada no Supabase. Execute a migration 036."
            : error.message,
      };
    }

    revalidatePath("/admin/administradores");
    revalidatePath("/admin/jogadores");
    revalidatePath("/mais");
    revalidatePath("/", "layout");
    return { success: true, role: String(data) as "admin" | "player" };
  } catch (error) {
    console.error("Erro inesperado ao alterar função da conta:", error);
    return { success: false, error: "Não foi possível alterar o acesso agora. Atualize a página e tente novamente." };
  }
}
