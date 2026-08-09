"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getAdminClient } from "../auth";

export async function getLeagueConfig() {
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) {
    const { data: fallback } = await supabase
      .from("leagues")
      .select("*")
      .limit(1)
      .single();
    
    return fallback;
  }

  return data;
}

export async function updateLeagueConfig(id: string, matchDuration: number) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem alterar a liga." };

    const { error } = await client
      .from("leagues")
      .update({ match_duration: matchDuration })
      .eq("id", id);

    if (error) throw new Error(error.message);

    revalidatePath("/admin/liga");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao atualizar liga:", err);
    return { success: false, error: err.message };
  }
}
