"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/auth";
import { getSelectedLeague } from "@/lib/league-context";

export async function importGuestRoster(formData: FormData) {
  const [account, league] = await Promise.all([getCurrentAccount(), getSelectedLeague()]);
  if (!account.isAdmin || !league || league.role !== "admin") redirect("/lobby");
  const names = String(formData.get("names") || "")
    .split(/\r?\n/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter((name) => name.length >= 2);
  if (!names.length || names.length > 100) redirect("/admin/importar-lista?error=count");
  const { data, error } = await account.client.rpc("import_league_guest_roster", {
    p_league_id: league.id,
    p_names: names,
  });
  if (error) redirect("/admin/importar-lista?error=save");
  revalidatePath("/admin/jogadores");
  revalidatePath("/convocacao");
  redirect(`/admin/importar-lista?created=${data?.length || 0}`);
}
