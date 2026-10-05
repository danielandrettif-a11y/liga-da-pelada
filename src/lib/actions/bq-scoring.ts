"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import { getActiveLeague } from "./rounds";
import { BQ_SCORING_V5, type BQBaseScoringSnapshot, rankingRulesToSnapshot } from "../bq-scoring";
import { DEFAULT_FANTASY_SETTINGS, normalizeFantasySettingsRow, type FantasySettings } from "../fantasy/config";

export type ColumnCScoringSettings = Pick<
  FantasySettings,
  | "attackerGoalPoints"
  | "attackerAssistPoints"
  | "lineGoalConcededPoints"
  | "defenderGoalPoints"
  | "defenderAssistPoints"
  | "defenderCleanSheetPoints"
  | "defenderOneGoalConcededPoints"
  | "defenderTwoGoalsConcededPoints"
  | "goalkeeperSlotAppearancePoints"
  | "goalkeeperSlotGoalConcededPoints"
  | "goalkeeperSlotCleanSheetPoints"
  | "goalkeeperSlotOneGoalPoints"
>;

function pickColumnCSettings(settings: FantasySettings): ColumnCScoringSettings {
  return {
    attackerGoalPoints: settings.attackerGoalPoints,
    attackerAssistPoints: settings.attackerAssistPoints,
    lineGoalConcededPoints: settings.lineGoalConcededPoints,
    defenderGoalPoints: settings.defenderGoalPoints,
    defenderAssistPoints: settings.defenderAssistPoints,
    defenderCleanSheetPoints: settings.defenderCleanSheetPoints,
    defenderOneGoalConcededPoints: settings.defenderOneGoalConcededPoints,
    defenderTwoGoalsConcededPoints: settings.defenderTwoGoalsConcededPoints,
    goalkeeperSlotAppearancePoints: settings.goalkeeperSlotAppearancePoints,
    goalkeeperSlotGoalConcededPoints: settings.goalkeeperSlotGoalConcededPoints,
    goalkeeperSlotCleanSheetPoints: settings.goalkeeperSlotCleanSheetPoints,
    goalkeeperSlotOneGoalPoints: settings.goalkeeperSlotOneGoalPoints,
  };
}

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

/** Regras posicionais da Coluna C, configuráveis separadamente dos scouts BQ. */
export async function getColumnCScoringRules(): Promise<ColumnCScoringSettings> {
  const account = await getCurrentAccount();
  const league = await getActiveLeague();
  const { data, error } = await account.client
    .from("fantasy_settings")
    .select("*")
    .eq("league_id", league.id)
    .maybeSingle();

  if (error || !data) return pickColumnCSettings(DEFAULT_FANTASY_SETTINGS);
  return pickColumnCSettings(normalizeFantasySettingsRow(data));
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

export async function saveColumnCScoringRules(
  values: ColumnCScoringSettings,
): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) {
    return { success: false, error: "Apenas administradores podem alterar as regras de pontuação." };
  }

  const league = await getActiveLeague();
  const { error } = await account.client.rpc("update_column_c_scoring_settings", {
    p_league_id: league.id,
    p_attacker_goal_points: values.attackerGoalPoints,
    p_attacker_assist_points: values.attackerAssistPoints,
    p_line_goal_conceded_points: values.lineGoalConcededPoints,
    p_defender_goal_points: values.defenderGoalPoints,
    p_defender_assist_points: values.defenderAssistPoints,
    p_defender_clean_sheet_points: values.defenderCleanSheetPoints,
    p_defender_one_goal_conceded_points: values.defenderOneGoalConcededPoints,
    p_defender_two_goals_conceded_points: values.defenderTwoGoalsConcededPoints,
    p_goalkeeper_appearance_points: values.goalkeeperSlotAppearancePoints,
    p_goalkeeper_goal_conceded_points: values.goalkeeperSlotGoalConcededPoints,
    p_goalkeeper_clean_sheet_points: values.goalkeeperSlotCleanSheetPoints,
    p_goalkeeper_one_goal_points: values.goalkeeperSlotOneGoalPoints,
  });
  if (error) {
    console.error("Erro ao salvar regras posicionais:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/pontuacao");
  revalidatePath("/ranking");
  revalidatePath("/cartola");
  return { success: true };
}
