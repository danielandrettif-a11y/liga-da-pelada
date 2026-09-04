"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import { getActiveLeague } from "./rounds";
import { BQ_SCORING_V5, type BQBaseScoringSnapshot, rankingRulesToSnapshot, snapshotToRankingRules } from "../bq-scoring";

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
  const rules = snapshotToRankingRules(snapshot);

  // 1. Atualizar ranking_rules
  for (const rule of rules) {
    const { error: ruleError } = await account.client
      .from("ranking_rules")
      .upsert(
        {
          league_id: league.id,
          event_type: rule.event_type,
          points: rule.points,
        },
        { onConflict: "league_id,event_type" },
      );

    if (ruleError) {
      console.error("Erro ao atualizar ranking_rules:", ruleError);
      return { success: false, error: ruleError.message };
    }
  }

  // 2. Atualizar fantasy_settings
  const { error: fantasyError } = await account.client
    .from("fantasy_settings")
    .update({
      goal_points: snapshot.goal,
      assist_points: snapshot.assist,
      win_points: snapshot.win,
      draw_points: snapshot.draw,
      loss_points: snapshot.loss,
      own_goal_points: snapshot.ownGoal,
      goalkeeper_appearance_points: snapshot.goalkeeperAppearance,
      goal_conceded_points: snapshot.goalkeeperGoalConceded,
    })
    .eq("league_id", league.id);

  if (fantasyError) {
    console.warn("Aviso: fantasy_settings não atualizado (pode não existir registro para a liga):", fantasyError);
  }

  revalidatePath("/admin/pontuacao");
  revalidatePath("/ranking");
  revalidatePath("/cartola");

  return { success: true };
}
