"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "../auth";
import { supabase } from "../supabase";
import { getActiveLeague } from "./rounds";
import type { Stadium } from "../types";

export async function getStadiums(): Promise<Stadium[]> {
  try {
    const league = await getActiveLeague();
    if (!league) return [];

    const { data, error } = await supabase
      .from("stadiums")
      .select("*")
      .eq("league_id", league.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erro ao buscar estadios:", error);
      return [];
    }

    return (data || []) as Stadium[];
  } catch (err) {
    console.error("Erro inesperado em getStadiums:", err);
    return [];
  }
}

export async function saveStadium(formData: FormData) {
  const client = await getAdminClient();
  if (!client) {
    return { success: false, error: "Somente administradores podem gerenciar estádios." };
  }

  const league = await getActiveLeague();
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const name = String(formData.get("name") || "").trim();
  const address = String(formData.get("address") || "").trim() || null;
  let googleMapsUrl = String(formData.get("google_maps_url") || "").trim();

  if (!name) {
    return { success: false, error: "Informe o nome do estádio/campo." };
  }

  if (!googleMapsUrl) {
    return { success: false, error: "Informe o link do Google Maps para localização." };
  }

  if (!googleMapsUrl.startsWith("http://") && !googleMapsUrl.startsWith("https://")) {
    googleMapsUrl = `https://${googleMapsUrl}`;
  }

  try {
    if (id) {
      const { error } = await client
        .from("stadiums")
        .update({
          name,
          address,
          google_maps_url: googleMapsUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("league_id", league.id);

      if (error) throw error;
    } else {
      // Obter proxima ordem
      const { data: lastStadium } = await client
        .from("stadiums")
        .select("display_order")
        .eq("league_id", league.id)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = (lastStadium?.display_order || 0) + 1;

      const { error } = await client.from("stadiums").insert({
        league_id: league.id,
        name,
        address,
        google_maps_url: googleMapsUrl,
        display_order: nextOrder,
        is_active: true,
      });

      if (error) throw error;
    }

    revalidatePath("/mais");
    revalidatePath("/mais/estadios");
    revalidatePath("/convocacao");
    revalidatePath("/admin/rodada");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao salvar estádio:", err);
    return { success: false, error: err.message || "Erro ao salvar estádio." };
  }
}

export async function deleteStadium(stadiumId: string) {
  const client = await getAdminClient();
  if (!client) {
    return { success: false, error: "Somente administradores podem excluir estádios." };
  }

  try {
    const { error } = await client
      .from("stadiums")
      .delete()
      .eq("id", stadiumId);

    if (error) throw error;

    revalidatePath("/mais");
    revalidatePath("/mais/estadios");
    revalidatePath("/convocacao");
    revalidatePath("/admin/rodada");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao excluir estádio:", err);
    return { success: false, error: err.message || "Erro ao excluir estádio." };
  }
}

export async function reorderStadiums(stadiumIds: string[]) {
  const client = await getAdminClient();
  if (!client) {
    return { success: false, error: "Somente administradores podem reordenar estádios." };
  }

  try {
    const updates = stadiumIds.map((id, index) =>
      client
        .from("stadiums")
        .update({ display_order: index + 1, updated_at: new Date().toISOString() })
        .eq("id", id)
    );

    await Promise.all(updates);

    revalidatePath("/mais");
    revalidatePath("/mais/estadios");
    revalidatePath("/convocacao");
    revalidatePath("/admin/rodada");
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao reordenar estádios:", err);
    return { success: false, error: err.message || "Erro ao reordenar estádios." };
  }
}
