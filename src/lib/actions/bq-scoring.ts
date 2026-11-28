"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "../auth";
import { getActiveLeague } from "./rounds";
import { BQ_SCORING_V5, DEFAULT_POSITION_SCORING, type BQBaseScoringSnapshot, type PositionScoringRules, rankingRulesToSnapshot } from "../bq-scoring";
import { DEFAULT_FANTASY_SETTINGS, normalizeFantasySettingsRow, type FantasySettings } from "../fantasy/config";
import { statisticsApiFor } from "@/modules/statistics/infrastructure/statistics-api-session";
import { DEFAULT_COLUMN_C_SCORING, type ColumnCScoringSettings } from "../column-c-scoring";

export type { ColumnCScoringSettings };

export type DualPositionScoringSettings = {
  positionRules: PositionScoringRules;
  primaryWeight: number;
  secondaryWeight: number;
  lineCleanSheetMinShare: number;
  goalkeeperAppearance: number;
  goalkeeperGoal: number;
  goalkeeperAssist: number;
  goalkeeperGoalConceded: number;
  goalkeeperCleanSheet: number;
  goalkeeperOneGoal: number;
  goalkeeperOwnGoal: number;
};

export type PositionBalanceScoutRow = {
  roundId: string;
  roundNumber: number;
  roundDate: string;
  playerId: string;
  games: number;
  goals: number;
  assists: number;
  ownGoals: number;
  lineGoalsConceded: number;
  lineCleanSheets: number;
  primaryPosition: keyof PositionScoringRules | null;
  secondaryPosition: keyof PositionScoringRules | null;
};

const DEFAULT_DUAL_POSITION_SCORING: DualPositionScoringSettings = {
  positionRules: DEFAULT_POSITION_SCORING,
  primaryWeight: 0.7,
  secondaryWeight: 0.3,
  lineCleanSheetMinShare: 0.5,
  goalkeeperAppearance: 1,
  goalkeeperGoal: 5,
  goalkeeperAssist: 3,
  goalkeeperGoalConceded: -0.5,
  goalkeeperCleanSheet: 4,
  goalkeeperOneGoal: 2,
  goalkeeperOwnGoal: -3,
};

function pickColumnCSettings(settings: FantasySettings): ColumnCScoringSettings {
  return {
    attackerGoalPoints: settings.attackerGoalPoints,
    attackerAssistPoints: settings.attackerAssistPoints,
    lineGoalConcededPoints: settings.lineGoalConcededPoints,
    defenderGoalPoints: settings.defenderGoalPoints,
    defenderAssistPoints: settings.defenderAssistPoints,
    defenderCleanSheetPoints: settings.defenderCleanSheetPoints,
    defenderOneGoalPoints: settings.defenderOneGoalPoints,
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

  const api = await statisticsApiFor(account.client);
  if (api) {
    return api.getBQScoringRules(league.id);
  }

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

  const api = await statisticsApiFor(account.client);
  if (api) {
    return api.getColumnCScoringRules(league.id);
  }

  const { data, error } = await account.client
    .from("fantasy_settings")
    .select("*")
    .eq("league_id", league.id)
    .maybeSingle();

  if (error || !data) return pickColumnCSettings(DEFAULT_FANTASY_SETTINGS);
  return pickColumnCSettings(normalizeFantasySettingsRow(data));
}

export async function getDualPositionScoringRules(): Promise<DualPositionScoringSettings> {
  const account = await getCurrentAccount();
  const league = await getActiveLeague();
  const { data, error } = await account.client
    .from("fantasy_settings")
    .select("position_scoring_rules, primary_position_weight, secondary_position_weight, line_clean_sheet_min_share, goalkeeper_slot_appearance_points, goalkeeper_goal_points, goalkeeper_assist_points, goalkeeper_slot_goal_conceded_points, goalkeeper_slot_clean_sheet_points, goalkeeper_slot_one_goal_points, goalkeeper_own_goal_points")
    .eq("league_id", league.id)
    .maybeSingle();
  if (error || !data) return DEFAULT_DUAL_POSITION_SCORING;
  return {
    positionRules: (data.position_scoring_rules || DEFAULT_POSITION_SCORING) as PositionScoringRules,
    primaryWeight: Number(data.primary_position_weight ?? 0.7),
    secondaryWeight: Number(data.secondary_position_weight ?? 0.3),
    lineCleanSheetMinShare: Number(data.line_clean_sheet_min_share ?? 0.5),
    goalkeeperAppearance: Number(data.goalkeeper_slot_appearance_points ?? 1),
    goalkeeperGoal: Number(data.goalkeeper_goal_points ?? 5),
    goalkeeperAssist: Number(data.goalkeeper_assist_points ?? 3),
    goalkeeperGoalConceded: Number(data.goalkeeper_slot_goal_conceded_points ?? -0.5),
    goalkeeperCleanSheet: Number(data.goalkeeper_slot_clean_sheet_points ?? 4),
    goalkeeperOneGoal: Number(data.goalkeeper_slot_one_goal_points ?? 2),
    goalkeeperOwnGoal: Number(data.goalkeeper_own_goal_points ?? -3),
  };
}

export async function getPositionBalanceScoutRows(): Promise<PositionBalanceScoutRow[]> {
  const account = await getCurrentAccount();
  const league = await getActiveLeague();
  const { data: rounds } = await account.client
    .from("rounds")
    .select("id, number, date, scoring_version")
    .eq("league_id", league.id)
    .eq("round_type", "official")
    .eq("status", "finished")
    .order("number", { ascending: false })
    .limit(30);
  if (!rounds?.length) return [];
  const roundById = new Map(rounds.map((round) => [round.id, round]));
  const { data } = await account.client
    .from("player_round_stats")
    .select("round_id, player_id, games, goals, assists, own_goals, goalkeeper_games, goalkeeper_goals, goalkeeper_assists, goalkeeper_own_goals, goals_conceded, team_goals_conceded, ranking_defensive_clean_games, primary_position_locked, secondary_position_locked")
    .in("round_id", rounds.map((round) => round.id))
    .gt("games", 0);
  return (data || []).flatMap((row) => {
    const round = roundById.get(row.round_id);
    if (!round) return [];
    const lineGames = Math.max(0, Number(row.games || 0) - Number(row.goalkeeper_games || 0));
    if (lineGames <= 0) return [];
    const v15 = Number(round.scoring_version || 0) >= 15;
    return [{
      roundId: row.round_id,
      roundNumber: Number(round.number),
      roundDate: round.date,
      playerId: row.player_id,
      games: lineGames,
      goals: Math.max(0, Number(row.goals || 0) - Number(row.goalkeeper_goals || 0)),
      assists: Math.max(0, Number(row.assists || 0) - Number(row.goalkeeper_assists || 0)),
      ownGoals: Math.max(0, Number(row.own_goals || 0) - Number(row.goalkeeper_own_goals || 0)),
      lineGoalsConceded: v15
        ? Math.max(0, Number(row.team_goals_conceded || 0))
        : Math.max(0, Number(row.team_goals_conceded || 0) - Number(row.goals_conceded || 0)),
      lineCleanSheets: Number(row.ranking_defensive_clean_games || 0),
      primaryPosition: row.primary_position_locked as keyof PositionScoringRules | null,
      secondaryPosition: row.secondary_position_locked as keyof PositionScoringRules | null,
    }];
  });
}

export async function saveDualPositionScoringRules(
  values: DualPositionScoringSettings,
): Promise<{ success: boolean; error?: string; draftRoundsUpdated?: number }> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Apenas administradores podem alterar as regras de pontuação." };
  const league = await getActiveLeague();
  const { data, error } = await account.client.rpc("save_dual_position_scoring_settings", {
    p_league_id: league.id,
    p_position_rules: values.positionRules,
    p_primary_weight: values.primaryWeight,
    p_secondary_weight: values.secondaryWeight,
    p_line_clean_sheet_min_share: values.lineCleanSheetMinShare,
    p_goalkeeper_appearance_points: values.goalkeeperAppearance,
    p_goalkeeper_goal_points: values.goalkeeperGoal,
    p_goalkeeper_assist_points: values.goalkeeperAssist,
    p_goalkeeper_goal_conceded_points: values.goalkeeperGoalConceded,
    p_goalkeeper_clean_sheet_points: values.goalkeeperCleanSheet,
    p_goalkeeper_one_goal_points: values.goalkeeperOneGoal,
    p_goalkeeper_own_goal_points: values.goalkeeperOwnGoal,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/pontuacao");
  revalidatePath("/ranking");
  revalidatePath("/cartola");
  return { success: true, draftRoundsUpdated: Number(data?.draft_rounds_updated || 0) };
}

export async function saveBQScoringRules(
  snapshot: BQBaseScoringSnapshot,
): Promise<{ success: boolean; error?: string }> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) {
    return { success: false, error: "Apenas administradores podem alterar as regras de pontuação." };
  }

  const league = await getActiveLeague();

  const api = await statisticsApiFor(account.client);
  if (api) {
    try {
      const result = await api.saveBQScoringRules(league.id, snapshot);
      revalidatePath("/admin/pontuacao");
      revalidatePath("/ranking");
      revalidatePath("/cartola");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar regras BQ via API.";
      return { success: false, error: message };
    }
  }

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
  options: { reprocessRanked?: boolean } = {},
): Promise<{ success: boolean; error?: string; roundsReprocessed?: number; playerRoundsReprocessed?: number }> {
  const account = await getCurrentAccount();
  if (!account.isAdmin) {
    return { success: false, error: "Apenas administradores podem alterar as regras de pontuação." };
  }

  const league = await getActiveLeague();

  const api = await statisticsApiFor(account.client);
  if (api) {
    try {
      const result = await api.saveColumnCScoringRules(league.id, values, options);
      revalidatePath("/admin/pontuacao");
      revalidatePath("/ranking");
      revalidatePath("/cartola");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar regras posicionais via API.";
      return { success: false, error: message };
    }
  }

  const { data, error } = await account.client.rpc("save_column_c_scoring_settings", {
    p_league_id: league.id,
    p_attacker_goal_points: values.attackerGoalPoints,
    p_attacker_assist_points: values.attackerAssistPoints,
    p_line_goal_conceded_points: values.lineGoalConcededPoints,
    p_defender_goal_points: values.defenderGoalPoints,
    p_defender_assist_points: values.defenderAssistPoints,
    p_defender_clean_sheet_points: values.defenderCleanSheetPoints,
    p_defender_one_goal_points: values.defenderOneGoalPoints,
    p_defender_one_goal_conceded_points: values.defenderOneGoalConcededPoints,
    p_defender_two_goals_conceded_points: values.defenderTwoGoalsConcededPoints,
    p_goalkeeper_appearance_points: values.goalkeeperSlotAppearancePoints,
    p_goalkeeper_goal_conceded_points: values.goalkeeperSlotGoalConcededPoints,
    p_goalkeeper_clean_sheet_points: values.goalkeeperSlotCleanSheetPoints,
    p_goalkeeper_one_goal_points: values.goalkeeperSlotOneGoalPoints,
    p_reprocess_ranked: Boolean(options.reprocessRanked),
  });
  if (error) {
    console.error("Erro ao salvar regras posicionais:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/pontuacao");
  revalidatePath("/ranking");
  revalidatePath("/cartola");
  return {
    success: true,
    roundsReprocessed: Number(data?.rounds_reprocessed || 0),
    playerRoundsReprocessed: Number(data?.player_rounds_reprocessed || 0),
  };
}
