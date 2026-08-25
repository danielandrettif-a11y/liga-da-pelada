export type FantasySettings = {
  /** Rodada 2 em diante ativa o sistema de vagas, rodízio e mercado 65/35. */
  roleScoringActive?: boolean;
  currencyName: string;
  initialBudget: number;
  initialPlayerPrice: number;
  minPlayerPrice: number;
  maxPlayerPrice: number;
  goalPoints: number;
  attackerGoalPoints: number;
  assistPoints: number;
  winPoints: number;
  lossPoints: number;
  goalkeeperLossPoints: number;
  goalkeeperAppearancePoints: number;
  goalConcededPoints: number;
  teamGoalConcededPoints: number;
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
  minSampleForRadar?: number;
};

export const DEFAULT_FANTASY_SETTINGS: FantasySettings = {
  roleScoringActive: true,
  currencyName: "C$",
  initialBudget: 55,
  initialPlayerPrice: 10,
  minPlayerPrice: 5,
  maxPlayerPrice: 25,
  goalPoints: 5,
  attackerGoalPoints: 5,
  assistPoints: 3,
  winPoints: 4,
  lossPoints: -2,
  // Campos legados preservados para snapshots antigos; a regra atual usa lossPoints.
  goalkeeperLossPoints: -2,
  goalkeeperAppearancePoints: 3,
  goalConcededPoints: -1,
  teamGoalConcededPoints: 0,
  ownGoalPoints: -3,
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
  maxPriceIncrease: 0.12,
  maxPriceDecrease: 0.10,
  minSampleForRadar: 3,
};

export const FANTASY_RECENT_ROUND_WEIGHTS = [0.40, 0.25, 0.15, 0.12, 0.08] as const;

export function formatFantasyMoney(value: number, currencyName = "C$") {
  return `${currencyName} ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

