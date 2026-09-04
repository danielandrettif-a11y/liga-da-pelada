"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import { getActiveLeague } from "./rounds";
import { BQ_SCORING_V5, type BQBaseScoringSnapshot, rankingRulesToSnapshot } from "../bq-scoring";

export async function getBQScoringRules(): Promise<BQBaseScoringSnapshot> {
  const account = await getCurrentAccount();
  const league = await getActiveLeague();

  const { data, error } = await account.client
    .from("ranking_rules")
    .select("event_type, points")
    .eq("league_id", league.id);

  if (error || !data || data.length === 0) {
    return BQ_SCORING_V5;
  }

  return rankingRulesToSnapshot(data, 5);
}

export async function saveBQScoringRules(
  snapshot: BQBaseScoringSnapshot,
): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) {
    return { success: false, error: "Apenas administradores podem alterar as regras de pontuação." };
  }

  const league = await getActiveLeague();
  const { error } = await account.client.rpc("save_bq_scoring_rules", {
    p_league_id: league.id,
    p_snapshot: snapshot,
  });
  if (error) {
    console.error("Erro ao salvar regras BQ de forma atômica:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/pontuacao");
  revalidatePath("/ranking");
  revalidatePath("/cartola");

  return { success: true };
}
