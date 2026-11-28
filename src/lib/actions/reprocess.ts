"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import { getActiveLeague } from "./rounds";
import { getStatisticsApiSession } from "@/modules/statistics/infrastructure/statistics-api-session";

export type ReprocessPreviewResult = {
  can_reprocess: boolean;
  reason?: string;
  scoring_version?: number;
  missing_positions_count?: number;
  missing_positions?: Array<{
    player_id: string;
    name: string;
    primary_position: string | null;
    secondary_position: string | null;
  }>;
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
  historical_limitations?: {
    untimed_goal_rounds_count: number;
    legacy_goalkeeper_matches_count: number;
    legacy_fantasy_rounds_count: number;
    no_slot_fantasy_rounds_count: number;
  };
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
  const session = await getStatisticsApiSession(account.client);
  if (session) {
    try {
      return await session.gateway.previewReprocessSeason(league.id);
    } catch (error) {
      return { can_reprocess: false, reason: error instanceof Error ? error.message : "Erro ao gerar prévia de reprocessamento." };
    }
  }
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
  const session = await getStatisticsApiSession(account.client);
  if (session) {
    try {
      const result = await session.gateway.executeReprocessSeason(league.id);
      revalidatePath("/admin");
      revalidatePath("/cartola");
      revalidatePath("/ranking");
      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Erro ao executar reprocessamento." };
    }
  }
  return {
    success: false,
    error: "O reprocessamento v15 exige o backend de estatísticas ativo para reconstruir a linha do tempo das partidas.",
  };
}
