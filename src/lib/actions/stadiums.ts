"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import { getSelectedLeague } from "../league-context";
import { createClient as createServerClient } from "../supabase/server";
import type { Stadium } from "../types";
import { LeagueApiError } from "@/modules/leagues/infrastructure/http-league-gateway";
import { leagueApiFor } from "@/modules/leagues/infrastructure/league-api-session";

function revalidateStadiumViews() {
  revalidatePath("/mais");
  revalidatePath("/mais/estadios");
  revalidatePath("/convocacao");
  revalidatePath("/admin/rodada");
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof LeagueApiError || error instanceof Error) return error.message;
  return fallback;
}

export async function getStadiums(): Promise<Stadium[]> {
  try {
    const league = await getSelectedLeague();
    if (!league) return [];

    const client = await createServerClient();
    const api = await leagueApiFor(client);
    if (api) return await api.getStadiums(league.id);
    const { data, error } = await client
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

export async function saveStadium(formData: FormData): Promise<
  { success: true; stadium: Stadium } | { success: false; error: string }
> {
  const account = await getCurrentAccount();
  const league = await getSelectedLeague();
  if (!account.user || !account.isAdmin || league?.role !== "admin") {
    return { success: false, error: "Somente administradores podem gerenciar estádios." };
  }

  const id = formData.get("id") ? String(formData.get("id")) : null;
  const name = String(formData.get("name") || "").trim();
  const address = String(formData.get("address") || "").trim() || null;
  let googleMapsUrl = String(formData.get("google_maps_url") || "").trim();
  const latitudeText = String(formData.get("latitude") || "").trim();
  const longitudeText = String(formData.get("longitude") || "").trim();
  const latitude = latitudeText ? Number(latitudeText) : null;
  const longitude = longitudeText ? Number(longitudeText) : null;

  if (!name) return { success: false, error: "Informe o nome do estádio/campo." };
  if (!googleMapsUrl) {
    return { success: false, error: "Informe o link do Google Maps para localização." };
  }

  if ((latitude === null) !== (longitude === null)) {
    return { success: false, error: "Informe latitude e longitude juntas para ativar a previsão do tempo." };
  }

  if (
    latitude !== null && longitude !== null
    && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)
  ) {
    return { success: false, error: "Latitude ou longitude inválida." };
  }

  if (!googleMapsUrl.startsWith("http://") && !googleMapsUrl.startsWith("https://")) {
    googleMapsUrl = `https://${googleMapsUrl}`;
  }

  try {
    const api = await leagueApiFor(account.client);
    if (api) {
      const stadium = await api.saveStadium(league.id, {
        id, name, address, google_maps_url: googleMapsUrl, latitude, longitude,
      });
      revalidateStadiumViews();
      return { success: true, stadium };
    }

    let savedStadium: Stadium;
    if (id) {
      const { data, error } = await account.client
        .from("stadiums")
        .update({
          name,
          address,
          google_maps_url: googleMapsUrl,
          latitude,
          longitude,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("league_id", league.id)
        .select("*")
        .single();

      if (error) throw error;
      savedStadium = data as Stadium;
    } else {
      const { data: lastStadium, error: orderError } = await account.client
        .from("stadiums")
        .select("display_order")
        .eq("league_id", league.id)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (orderError) throw orderError;

      const { data, error } = await account.client
        .from("stadiums")
        .insert({
          league_id: league.id,
          name,
          address,
          google_maps_url: googleMapsUrl,
          latitude,
          longitude,
          display_order: (lastStadium?.display_order || 0) + 1,
          is_active: true,
        })
        .select("*")
        .single();

      if (error) throw error;
      savedStadium = data as Stadium;
    }

    revalidateStadiumViews();
    return { success: true, stadium: savedStadium };
  } catch (error) {
    console.error("Erro ao salvar estádio:", error);
    return { success: false, error: errorMessage(error, "Erro ao salvar estádio.") };
  }
}

export async function deleteStadium(stadiumId: string) {
  const account = await getCurrentAccount();
  const league = await getSelectedLeague();
  if (!account.user || !account.isAdmin || league?.role !== "admin") {
    return { success: false, error: "Somente administradores podem excluir estádios." };
  }

  try {
    const api = await leagueApiFor(account.client);
    if (api) {
      await api.deleteStadium(league.id, stadiumId);
    } else {
      const { error } = await account.client
        .from("stadiums")
        .delete()
        .eq("id", stadiumId)
        .eq("league_id", league.id);
      if (error) throw error;
    }
    revalidateStadiumViews();
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir estádio:", error);
    return { success: false, error: errorMessage(error, "Erro ao excluir estádio.") };
  }
}

export async function reorderStadiums(stadiumIds: string[]) {
  const account = await getCurrentAccount();
  const league = await getSelectedLeague();
  if (!account.user || !account.isAdmin || league?.role !== "admin") {
    return { success: false, error: "Somente administradores podem reordenar estádios." };
  }

  try {
    const api = await leagueApiFor(account.client);
    if (api) {
      await api.reorderStadiums(league.id, stadiumIds);
    } else {
      const results = await Promise.all(stadiumIds.map((id, index) => account.client
        .from("stadiums")
        .update({ display_order: index + 1, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("league_id", league.id)));
      const failure = results.find((result) => result.error)?.error;
      if (failure) throw failure;
    }
    revalidateStadiumViews();
    return { success: true };
  } catch (error) {
    console.error("Erro ao reordenar estádios:", error);
    return { success: false, error: errorMessage(error, "Erro ao reordenar estádios.") };
  }
}
