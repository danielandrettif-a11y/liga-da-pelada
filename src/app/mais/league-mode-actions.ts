"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentAccount } from "@/lib/auth";
import { ACTIVE_LEAGUE_COOKIE, getSelectedLeague } from "@/lib/league-context";
import { leagueApiFor } from "@/modules/leagues/infrastructure/league-api-session";

export async function upgradeCurrentLeague(formData: FormData) {
  const [account, league] = await Promise.all([getCurrentAccount(), getSelectedLeague()]);
  if (!account.isAdmin || !league || league.role !== "admin") redirect("/lobby");
  if (formData.get("confirm") !== "upgrade") redirect("/mais?upgrade_error=confirm");
  if (league.featureTier !== "basic") redirect("/mais");
  try {
    const api = await leagueApiFor(account.client);
    if (api) {
      await api.upgrade(league.id);
    } else {
      const { error } = await account.client.rpc("upgrade_league_to_complete", { p_league_id: league.id });
      if (error) throw new Error(error.message);
    }
  } catch {
    redirect("/mais?upgrade_error=save");
  }
  revalidateTag("league", "max");
  revalidatePath("/", "layout");
  redirect("/mais?upgraded=1");
}

export async function deleteCurrentLeague(confirmName: string): Promise<{ success: false; error: string }> {
  const [account, league] = await Promise.all([getCurrentAccount(), getSelectedLeague()]);
  if (!account.user || !account.isAdmin || !league || league.role !== "admin") {
    return { success: false, error: "Somente um ADM desta pelada pode excluí-la." };
  }
  if (confirmName !== league.name) {
    return { success: false, error: "Digite o nome exato da pelada para confirmar." };
  }

  try {
    const api = await leagueApiFor(account.client);
    if (api) {
      await api.deleteLeague(league.id, confirmName);
    } else {
      const { data, error } = await account.client.rpc("delete_league_permanently", {
        p_league_id: league.id,
        p_confirm_name: confirmName,
      });
      if (error || data !== true) throw new Error(error?.message || "delete_failed");
    }
  } catch (error) {
    console.error("Erro ao excluir pelada:", error);
    if (error instanceof Error && /ultima pelada ativa|última pelada ativa/i.test(error.message)) {
      return { success: false, error: "A última pelada ativa só poderá ser excluída depois que a criação de novas peladas estiver liberada." };
    }
    return { success: false, error: "Não foi possível excluir a pelada. Verifique se a migration de exclusão foi aplicada." };
  }

  (await cookies()).delete(ACTIVE_LEAGUE_COOKIE);
  revalidateTag("league", "max");
  revalidatePath("/", "layout");
  redirect("/lobby?deleted=1");
}
