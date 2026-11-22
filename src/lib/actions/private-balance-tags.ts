"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import type { PrivateBalanceTag } from "@/lib/types";
import { rosterApiFor } from "@/modules/roster/infrastructure/roster-api-session";

const VALID_TAGS = new Set<PrivateBalanceTag>(["bagre_1", "bagre_2", "craque_1", "craque_2"]);

async function canManagePrivateBalanceTags() {
  const account = await getCurrentAccount();
  if (!account.user) return { account, allowed: false };
  const { data, error } = await account.client.rpc("can_manage_private_balance_tags");
  return { account, allowed: !error && data === true };
}

export async function getPlayerPrivateBalanceTag(playerId: string): Promise<{
  allowed: boolean;
  tag: PrivateBalanceTag | null;
}> {
  const currentAccount = await getCurrentAccount();
  if (!currentAccount.user || !playerId) return { allowed: false, tag: null };
  const api = await rosterApiFor(currentAccount.client);
  if (api) {
    try {
      return await api.getPlayerPrivateBalanceTag(playerId);
    } catch {
      return { allowed: false, tag: null };
    }
  }
  const { account, allowed } = await canManagePrivateBalanceTags();
  if (!allowed || !playerId) return { allowed: false, tag: null };

  const { data, error } = await account.client
    .from("player_private_balance_tags")
    .select("balance_tag")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) return { allowed: true, tag: null };
  return { allowed: true, tag: (data?.balance_tag as PrivateBalanceTag | undefined) || null };
}

export async function setPlayerPrivateBalanceTag(
  playerId: string,
  tag: PrivateBalanceTag | null,
): Promise<{ success: boolean; error?: string }> {
  if (!playerId || (tag !== null && !VALID_TAGS.has(tag))) return { success: false, error: "Classificação de equilíbrio inválida." };
  const currentAccount = await getCurrentAccount();
  if (!currentAccount.user) return { success: false, error: "Somente Daniel Andretti pode alterar esta classificação." };
  const api = await rosterApiFor(currentAccount.client);
  if (api) {
    try {
      await api.setPlayerPrivateBalanceTag(playerId, tag);
      revalidatePath(`/admin/jogadores/${playerId}/editar`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Não foi possível alterar a classificação." };
    }
  }
  const { account, allowed } = await canManagePrivateBalanceTags();
  if (!allowed || !account.user) return { success: false, error: "Somente Daniel Andretti pode alterar esta classificação." };

  const query = tag === null
    ? account.client.from("player_private_balance_tags").delete().eq("player_id", playerId)
    : account.client.from("player_private_balance_tags").upsert({
        player_id: playerId,
        balance_tag: tag,
        updated_by: account.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "player_id" });
  const { error } = await query;
  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/jogadores/${playerId}/editar`);
  return { success: true };
}
