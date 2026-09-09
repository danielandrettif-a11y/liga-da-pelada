import { BQ_SCORING_V5 } from "../bq-scoring";

export type FantasySettings = {
  /** Versão do motor de mercado congelada no snapshot da rodada. */
  marketVersion?: number;
  /** Rodada 2 em diante ativa o sistema de vagas, rodízio e mercado 65/35. */
  roleScoringActive?: boolean;
  /** Exceção pontual por rodada: mantém scouts brutos e punição, mas zera recompensas de goleiro. */
  suppressGoalkeeperRewards?: boolean;
  currencyName: string;
  initialBudget: number;
  initialPlayerPrice: number;
  minPlayerPrice: number;
  maxPlayerPrice: number;
  goalPoints: number;
  assistPoints: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  goalConcededPoints: number;
  goalkeeperAppearancePoints: number;
  ownGoalPoints: number;
  captainMultiplier: number;
  topScorerPredictionPoints: number;
  topAssistPredictionPoints: number;
  topTeamPredictionPoints: number;
  kingOfWinsPoints: number;
  mvpPredictionPoints: number;
  betOfRoundPoints: number;
  betRequiredRanks: [number, number, number, number];
  scoreGoalRewards: [number, number, number, number];
  recentWeight: number;
  winRateWeight: number;
  historicalWeight: number;
  consistencyWeight: number;
  smoothingGames: number;
  maxPriceIncrease: number;
  maxPriceDecrease: number;
  marketUpShare: number;
  marketStableShare: number;
  marketMinIncrease: number;
  marketMinDecrease: number;
  /** Piso e teto de equilíbrio da curva de preço do Mercado V10. */
  competitivePriceFloor?: number;
  competitivePriceCeiling?: number;
  /** Expoente que mantém o atleta mediano perto do preço inicial. */
  competitivePriceCurve?: number;
  /** Peso da rodada atual; o restante vem da média da temporada. */
  marketRoundWeight?: number;
  /** Legado do Mercado V9; mantido para ler snapshots antigos. */
  marketAttendanceWeight?: number;
  /** Parcela da distância até o preço-alvo percorrida a cada rodada. */
  marketRepriceStrength?: number;
  /** Limites iniciais e passo de maturação da variação por rodada. */
  marketInitialUpCap?: number;
  marketInitialDownCap?: number;
  marketCapStep?: number;
  /** Mercado V11: dificuldade global baseada na capacidade real de compra da liga. */
  marketDifficultyMultiplier?: number;
  marketDifficultyMin?: number;
  marketDifficultyMax?: number;
  marketDifficultyStep?: number;
  marketTargetEliteAffordability?: number;
  marketTargetMedianEliteRatio?: number;
  marketRecoveryBonusStrength?: number;
  marketExpensiveRiskStrength?: number;
  marketBreakoutRepriceStrength?: number;
  marketCheapPercentile?: number;
  marketElitePercentile?: number;
  marketBreakoutRoundPercentile?: number;
  marketBadRoundPercentile?: number;
  /** Freio de inflação do patrimônio ao longo da temporada. */
  budgetSoftCapMultiplier?: number;
  budgetHardCapMultiplier?: number;
  budgetExcessRetention?: number;
  minSampleForRadar?: number;
  // Campos legados preservados para compatibilidade com snapshots antigos
  attackerGoalPoints?: number;
  goalkeeperLossPoints?: number;
  teamGoalConcededPoints?: number;
  goalkeeperSlotCleanSheetPoints?: number;
};

export const DEFAULT_FANTASY_SETTINGS: FantasySettings = {
  marketVersion: 11,
  roleScoringActive: true,
  suppressGoalkeeperRewards: false,
  currencyName: "C$",
  initialBudget: 55,
  initialPlayerPrice: 10,
  minPlayerPrice: 5,
  maxPlayerPrice: 20,
  // Scouts básicos BQ v5 — sincronizados com bq-scoring.ts
  goalPoints: BQ_SCORING_V5.goal,
  assistPoints: BQ_SCORING_V5.assist,
  winPoints: BQ_SCORING_V5.win,
  drawPoints: BQ_SCORING_V5.draw,
  lossPoints: BQ_SCORING_V5.loss,
  goalConcededPoints: BQ_SCORING_V5.goalkeeperGoalConceded,
  goalkeeperAppearancePoints: BQ_SCORING_V5.goalkeeperAppearance,
  ownGoalPoints: BQ_SCORING_V5.ownGoal,
  captainMultiplier: 1.5,
  topScorerPredictionPoints: 8,
  topAssistPredictionPoints: 6,
  topTeamPredictionPoints: 5,
  kingOfWinsPoints: 6,
  mvpPredictionPoints: 8,
  betOfRoundPoints: 8,
  betRequiredRanks: [5, 4, 3, 2],
  scoreGoalRewards: [7, 6, 4, 3],
  recentWeight: 0.40,
  winRateWeight: 0.35,
  historicalWeight: 0.15,
  consistencyWeight: 0.10,
  smoothingGames: 5,
  maxPriceIncrease: 0.15,
  maxPriceDecrease: 0.12,
  marketUpShare: 0.35,
  marketStableShare: 0.30,
  marketMinIncrease: 0.05,
  marketMinDecrease: 0.02,
  competitivePriceFloor: 6,
  competitivePriceCeiling: 18,
  competitivePriceCurve: 1.9,
  marketRoundWeight: 0.70,
  marketAttendanceWeight: 0,
  marketRepriceStrength: 0.26,
  marketInitialUpCap: 0.08,
  marketInitialDownCap: 0.06,
  marketCapStep: 0.02,
  marketDifficultyMultiplier: 1,
  marketDifficultyMin: 0.94,
  marketDifficultyMax: 1.18,
  marketDifficultyStep: 0.03,
  marketTargetEliteAffordability: 0.20,
  marketTargetMedianEliteRatio: 0.86,
  marketRecoveryBonusStrength: 2.40,
  marketExpensiveRiskStrength: 1.20,
  marketBreakoutRepriceStrength: 0.40,
  marketCheapPercentile: 0.35,
  marketElitePercentile: 0.80,
  marketBreakoutRoundPercentile: 0.70,
  marketBadRoundPercentile: 0.35,
  budgetSoftCapMultiplier: 1.20,
  budgetHardCapMultiplier: 1.40,
  budgetExcessRetention: 0.25,
  minSampleForRadar: 3,
  // Campos legados — preservados para snapshots antigos
  attackerGoalPoints: BQ_SCORING_V5.goal,
  goalkeeperLossPoints: BQ_SCORING_V5.loss,
  teamGoalConcededPoints: 0,
  goalkeeperSlotCleanSheetPoints: 4,
};

export const FANTASY_RECENT_ROUND_WEIGHTS = [0.40, 0.25, 0.15, 0.12, 0.08] as const;

const FANTASY_SETTING_COLUMNS = {
  initialBudget: "initial_budget", initialPlayerPrice: "initial_player_price", minPlayerPrice: "min_player_price", maxPlayerPrice: "max_player_price",
  goalPoints: "goal_points", attackerGoalPoints: "attacker_goal_points", assistPoints: "assist_points", winPoints: "win_points", drawPoints: "draw_points", lossPoints: "loss_points",
  goalkeeperLossPoints: "goalkeeper_loss_points", goalkeeperAppearancePoints: "goalkeeper_appearance_points", goalConcededPoints: "goal_conceded_points", teamGoalConcededPoints: "team_goal_conceded_points", ownGoalPoints: "own_goal_points",
  captainMultiplier: "captain_multiplier", topScorerPredictionPoints: "top_scorer_prediction_points", topAssistPredictionPoints: "top_assist_prediction_points", topTeamPredictionPoints: "top_team_prediction_points",
  recentWeight: "recent_weight", kingOfWinsPoints: "king_of_wins_points", mvpPredictionPoints: "mvp_prediction_points", betOfRoundPoints: "bet_of_round_points",
  winRateWeight: "win_rate_weight", historicalWeight: "historical_weight", consistencyWeight: "consistency_weight", smoothingGames: "smoothing_games", maxPriceIncrease: "max_price_increase", maxPriceDecrease: "max_price_decrease",
  marketUpShare: "market_up_share", marketStableShare: "market_stable_share", marketMinIncrease: "market_min_increase", marketMinDecrease: "market_min_decrease",
  competitivePriceFloor: "competitive_price_floor", competitivePriceCeiling: "competitive_price_ceiling", competitivePriceCurve: "competitive_price_curve", marketRoundWeight: "market_round_weight", marketAttendanceWeight: "market_attendance_weight", marketRepriceStrength: "market_reprice_strength",
  marketInitialUpCap: "market_initial_up_cap", marketInitialDownCap: "market_initial_down_cap", marketCapStep: "market_cap_step", marketVersion: "market_version",
  marketDifficultyMultiplier: "market_difficulty_multiplier", marketDifficultyMin: "market_difficulty_min", marketDifficultyMax: "market_difficulty_max", marketDifficultyStep: "market_difficulty_step",
  marketTargetEliteAffordability: "market_target_elite_affordability", marketTargetMedianEliteRatio: "market_target_median_elite_ratio", marketRecoveryBonusStrength: "market_recovery_bonus_strength", marketExpensiveRiskStrength: "market_expensive_risk_strength", marketBreakoutRepriceStrength: "market_breakout_reprice_strength",
  marketCheapPercentile: "market_cheap_percentile", marketElitePercentile: "market_elite_percentile", marketBreakoutRoundPercentile: "market_breakout_round_percentile", marketBadRoundPercentile: "market_bad_round_percentile",
  budgetSoftCapMultiplier: "budget_soft_cap_multiplier", budgetHardCapMultiplier: "budget_hard_cap_multiplier", budgetExcessRetention: "budget_excess_retention", minSampleForRadar: "min_sample_for_radar",
} as const;

const LEGACY_FANTASY_SETTING_FALLBACKS: Partial<Record<keyof FantasySettings, number>> = {
  attackerGoalPoints: 5,
  drawPoints: 1,
  lossPoints: -1,
  goalkeeperAppearancePoints: 3,
  goalConcededPoints: -1,
  teamGoalConcededPoints: -1,
  ownGoalPoints: -3,
  marketVersion: 10,
};

/** Único adaptador entre a linha snake_case do banco e o motor do Cartola. */
export function normalizeFantasySettingsRow(row: Record<string, unknown> | null): FantasySettings {
  if (!row) return DEFAULT_FANTASY_SETTINGS;
  const normalized: Record<string, unknown> = {
    ...DEFAULT_FANTASY_SETTINGS,
    roleScoringActive: true,
    currencyName: row.currency_name || DEFAULT_FANTASY_SETTINGS.currencyName,
  };
  for (const [property, column] of Object.entries(FANTASY_SETTING_COLUMNS)) {
    const key = property as keyof FantasySettings;
    const fallback = LEGACY_FANTASY_SETTING_FALLBACKS[key] ?? DEFAULT_FANTASY_SETTINGS[key];
    normalized[property] = Number(row[column] ?? fallback);
  }
  normalized.goalkeeperLossPoints = Number(row.goalkeeper_loss_points ?? row.loss_points ?? -1);
  normalized.betRequiredRanks = [1, 2, 3, 4].map((band) => Number(row[`bet_rank_band_${band}`] ?? 6 - band));
  normalized.scoreGoalRewards = [1, 2, 3, 4].map((band) => Number(row[`score_goal_reward_band_${band}`] ?? [7, 6, 4, 3][band - 1]));
  return normalized as FantasySettings;
}

/** O orçamento inicial acompanha a quantidade de vagas, mantendo C$ 11 por atleta. */
export function getFantasyInitialBudget(playersPerTeam: number) {
  return Math.max(1, Math.floor(playersPerTeam || 5)) * 11;
}

export function formatFantasyMoney(value: number, currencyName = "C$") {
  return `${currencyName} ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}
