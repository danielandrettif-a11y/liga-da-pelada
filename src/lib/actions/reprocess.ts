"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import { getActiveLeague } from "./rounds";

export type ReprocessPreviewResult = {
  can_reprocess: boolean;
  reason?: string;
  season_id?: string;
  rounds_count?: number;
  lineups_count?: number;
  rounds?: Array<{
    round_id: string;
    number: number;
    date: string;
    market_status: string;
    lineups_count: number;
  }>;
  accounts?: Array<{
    user_id: string;
    current_budget: number;
    total_points: number;
    rounds_played: number;
  }>;
};

export type ReprocessExecutionResult = {
  success: boolean;
  error?: string;
  season_id?: string;
  rounds_reprocessed?: number;
  lineups_reprocessed?: number;
};

export async function previewReprocessSeason(): Promise<ReprocessPreviewResult> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) {
    return { can_reprocess: false, reason: "Acesso negado. Apenas administradores." };
  }

  const league = await getActiveLeague();
  const { data, error } = await account.client.rpc("preview_reprocess_season", {
    p_league_id: league.id,
  });

  if (error) {
    console.error("Erro ao gerar prévia de reprocessamento:", error);
    return { can_reprocess: false, reason: error.message };
  }

  return data as ReprocessPreviewResult;
}

export async function executeReprocessSeason(): Promise<ReprocessExecutionResult> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) {
    return { success: false, error: "Acesso negado. Apenas administradores." };
  }

  const league = await getActiveLeague();
  const { data, error } = await account.client.rpc("reprocess_active_season_v5", {
    p_league_id: league.id,
  });

  if (error) {
    console.error("Erro ao executar reprocessamento:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/cartola");
  revalidatePath("/ranking");

  return data as ReprocessExecutionResult;
}
