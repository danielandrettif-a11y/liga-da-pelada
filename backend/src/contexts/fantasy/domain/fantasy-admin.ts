export type FantasyRankingScope = "general" | "season" | "month" | "round";

export type FantasyRankingEntry = {
  rank: number;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  totalPoints: number;
  patrimony: number;
  lastRoundPoints: number | null;
  lineupsCount: number;
};

export type FantasyUserRoundHistoryDetail = {
  userId: string;
  roundId: string;
  roundNumber: number;
  score: number;
  captainPlayerId: string;
  captainMultiplier: number;
  slots: Array<{
    slotRole: "GOL" | "DEF" | "MEI" | "ATA";
    playerId: string;
    playerName: string;
    score: number;
    isCaptain: boolean;
  }>;
};

export type SeasonPassDashboardData = {
  authenticated: boolean;
  available: boolean;
  progress: number;
  maxProgress: 40;
  mode: "athlete" | "community";
  participations: number;
  activeWeeks: number;
  validLineups: number;
  shopCycleRemainder: number;
  shopBonusPoints: number;
  nextMilestone: number | null;
  playerName: string | null;
  playerAvatarUrl: string | null;
  events: Array<{
    id: string;
    eventType: "valid_lineup";
    houses: number;
    roundId: string | null;
    roundNumber: number | null;
    roundDate: string | null;
    createdAt: string;
  }>;
};

export type FantasyAdminConfigData = {
  settings: Record<string, unknown>;
  rounds: unknown[];
  testSession: unknown | null;
  friendlyRounds: unknown[];
  marketStatus: unknown | null;
};

const CANONICAL_SCOUT_KEYS = new Set([
  "goalPoints", "assistPoints", "winPoints", "drawPoints", "lossPoints", "ownGoalPoints",
  "goalkeeperAppearancePoints", "goalConcededPoints",
]);
const LEGACY_SETTING_KEYS = new Set([
  "attackerGoalPoints", "ownGoalPoints", "lossPoints", "goalkeeperLossPoints",
  "goalkeeperAppearancePoints", "goalConcededPoints", "teamGoalConcededPoints",
  "defenderOneGoalConcededPoints", "defenderTwoGoalsConcededPoints",
]);
const SETTING_COLUMNS: Record<string, string> = {
  initialBudget: "initial_budget", initialPlayerPrice: "initial_player_price",
  minPlayerPrice: "min_player_price", maxPlayerPrice: "max_player_price",
  captainMultiplier: "captain_multiplier", topScorerPredictionPoints: "top_scorer_prediction_points",
  topAssistPredictionPoints: "top_assist_prediction_points", kingOfWinsPoints: "king_of_wins_points",
  mvpPredictionPoints: "mvp_prediction_points", betOfRoundPoints: "bet_of_round_points",
  smoothingGames: "smoothing_games", recentWeight: "recent_weight", winRateWeight: "win_rate_weight",
  historicalWeight: "historical_weight", consistencyWeight: "consistency_weight",
  maxPriceIncrease: "max_price_increase", maxPriceDecrease: "max_price_decrease",
  competitivePriceFloor: "competitive_price_floor", competitivePriceCeiling: "competitive_price_ceiling",
  competitivePriceCurve: "competitive_price_curve", marketRoundWeight: "market_round_weight",
  marketRepriceStrength: "market_reprice_strength", marketInitialUpCap: "market_initial_up_cap",
  marketInitialDownCap: "market_initial_down_cap", marketCapStep: "market_cap_step",
  marketDifficultyMin: "market_difficulty_min", marketDifficultyMax: "market_difficulty_max",
  marketDifficultyStep: "market_difficulty_step", marketTargetEliteAffordability: "market_target_elite_affordability",
  marketTargetMedianEliteRatio: "market_target_median_elite_ratio",
  marketRecoveryBonusStrength: "market_recovery_bonus_strength",
  marketExpensiveRiskStrength: "market_expensive_risk_strength",
  marketBreakoutRepriceStrength: "market_breakout_reprice_strength",
  marketCheapPercentile: "market_cheap_percentile", marketElitePercentile: "market_elite_percentile",
  marketBreakoutRoundPercentile: "market_breakout_round_percentile",
  marketBadRoundPercentile: "market_bad_round_percentile",
};

export function buildFantasySettingsPayload(values: Record<string, unknown>) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return { valid: false as const, error: "Configurações inválidas." };
  }
  if ([...CANONICAL_SCOUT_KEYS].some((key) => values[key] !== undefined)) {
    return { valid: false as const,
      error: "Edite os oito scouts juntos na tela Pontuação BQ para manter Ranked e Cartola sincronizados." };
  }
  const payload: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || LEGACY_SETTING_KEYS.has(key)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { valid: false as const, error: `Valor inválido para ${key}.` };
    }
    payload[SETTING_COLUMNS[key] || key] = value;
  }
  if (values.defenderOneGoalConcededPoints !== undefined) {
    payload.defender_one_goal_conceded_points = Number(values.defenderOneGoalConcededPoints);
  }
  if (values.defenderTwoGoalsConcededPoints !== undefined) {
    payload.defender_two_goals_conceded_points = Number(values.defenderTwoGoalsConcededPoints);
  }
  if (!Object.keys(payload).length) return { valid: false as const, error: "Informe ao menos uma configuração." };
  return { valid: true as const, payload };
}

export function sortFantasyRankingEntries(
  entries: Array<{ userId: string; userName: string; userAvatarUrl: string | null; totalPoints: number; patrimony: number; lastRoundPoints: number | null; lineupsCount: number }>
): FantasyRankingEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.patrimony !== a.patrimony) return b.patrimony - a.patrimony;
    return a.userName.localeCompare(b.userName);
  });

  return sorted.map((entry, index) => ({
    rank: index + 1,
    ...entry,
    totalPoints: Math.round(entry.totalPoints * 100) / 100,
    patrimony: Math.round(entry.patrimony * 100) / 100,
  }));
}

