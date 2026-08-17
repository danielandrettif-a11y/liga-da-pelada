"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import { supabase } from "../supabase";
import type { PlayerRoundFitness, RoundType } from "../types";
import { getActiveSeason } from "./seasons";

export type FitnessRoundEntry = {
  roundId: string;
  number: number;
  date: string;
  roundType: RoundType;
  fitness: PlayerRoundFitness | null;
};

export type FitnessSummary = {
  distanceKm: number;
  averageSpeedKmh: number;
  metersPerMinute: number;
  entries: number;
};

export async function getMyFitnessRounds(playerId: string): Promise<FitnessRoundEntry[]> {
  const account = await getCurrentAccount();
  if (!account.user || account.profile?.player_id !== playerId) return [];
  const season = await getActiveSeason();
  if (!season) return [];
  const { data, error } = await account.client
    .from("round_players")
    .select(`
      round_id,
      round:round_id!inner (id, number, date, round_type, status, season_id)
    `)
    .eq("player_id", playerId)
    .eq("round.status", "finished")
    .eq("round.season_id", season.id);
  if (error) {
    console.error("Erro ao buscar dados fisicos:", error);
    return [];
  }
  const roundIds = (data || []).map((item) => item.round_id);
  const { data: fitnessRows, error: fitnessError } = roundIds.length
    ? await account.client.from("player_round_fitness").select("*").eq("player_id", playerId).in("round_id", roundIds)
    : { data: [], error: null };
  if (fitnessError) {
    console.error("Erro ao buscar registros fisicos:", fitnessError);
    return [];
  }
  const fitnessByRound = new Map((fitnessRows || []).map((entry) => [entry.round_id, entry as PlayerRoundFitness]));
  return (data || []).flatMap((item: any) => {
    const round = item.round;
    if (!round) return [];
    const fitness = fitnessByRound.get(round.id) || null;
    return [{ roundId: round.id, number: round.number, date: round.date, roundType: round.round_type as RoundType, fitness }];
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveMyFitness(roundId: string, distance: number, paceInput: number) {
  const account = await getCurrentAccount();
  const playerId = account.profile?.player_id;
  if (!account.user || !playerId) return { success: false, error: "Conta sem jogador vinculado." };
  const distanceKm = Number(distance);
  const rawPace = Number(paceInput);
  if (!Number.isFinite(distanceKm) || distanceKm < 0.01 || distanceKm > 100) {
    return { success: false, error: "A distância deve ficar entre 0,01 e 100 km." };
  }
  if (!Number.isFinite(rawPace) || rawPace < 0.1 || rawPace > 1000) {
    return { success: false, error: "O ritmo deve ficar entre 1 e 1000 m/min." };
  }

  // Se o valor fornecido for no formato m/min (ex: > 35), converte para km/h no banco
  // Ex: 100 m/min = 6 km/h. Se < 35 (ex: 6.5), assume km/h
  const speedKmh = rawPace > 35 ? (rawPace * 60) / 1000 : rawPace;

  const { error } = await account.client.from("player_round_fitness").upsert({
    player_id: playerId,
    round_id: roundId,
    distance_km: Math.round(distanceKm * 100) / 100,
    average_speed_kmh: Math.round(speedKmh * 100) / 100,
    updated_at: new Date().toISOString(),
  }, { onConflict: "player_id,round_id" });
  if (error) return { success: false, error: error.message };
  revalidatePath("/meu-perfil");
  revalidatePath(`/jogadores/${playerId}`);
  revalidatePath("/ranking");
  return { success: true };
}

export async function setFitnessVisibility(visible: boolean) {
  const account = await getCurrentAccount();
  const playerId = account.profile?.player_id;
  if (!account.user || !playerId) return { success: false, error: "Conta sem jogador vinculado." };
  const { error } = await account.client.from("players").update({ show_fitness_stats: Boolean(visible) }).eq("id", playerId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/meu-perfil");
  revalidatePath(`/jogadores/${playerId}`);
  revalidatePath("/ranking");
  return { success: true };
}

export async function getPlayerFitnessSummaries(playerId: string): Promise<{ official: FitnessSummary; friendly: FitnessSummary } | null> {
  const [playerResult, account] = await Promise.all([
    supabase.from("players").select("show_fitness_stats").eq("id", playerId).maybeSingle(),
    getCurrentAccount(),
  ]);
  const owns = account.profile?.player_id === playerId;
  if (!playerResult.data?.show_fitness_stats && !owns) return null;
  const season = await getActiveSeason();
  if (!season) return null;
  const client = account.user ? account.client : supabase;
  const { data, error } = await client.from("player_round_fitness").select(`
    distance_km, average_speed_kmh,
    round:round_id!inner (round_type, season_id)
  `).eq("player_id", playerId).eq("round.season_id", season.id);
  if (error) return null;
  function summarize(type: RoundType): FitnessSummary {
    const entries = (data || []).filter((item: any) => item.round?.round_type === type);
    const avgSpeed = entries.length ? Math.round((entries.reduce((sum: number, item: any) => sum + Number(item.average_speed_kmh), 0) / entries.length) * 100) / 100 : 0;
    return {
      distanceKm: Math.round(entries.reduce((sum: number, item: any) => sum + Number(item.distance_km), 0) * 100) / 100,
      averageSpeedKmh: avgSpeed,
      metersPerMinute: Math.round((avgSpeed * 1000) / 60),
      entries: entries.length,
    };
  }
  return { official: summarize("official"), friendly: summarize("friendly") };
}
