import { BQ_SCORING_V5 } from "../bq-scoring";

export type FantasySettings = {
  /** Rodada 2 em diante ativa o sistema de vagas, rodízio e mercado 65/35. */
  roleScoringActive?: boolean;
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
  minSampleForRadar?: number;
  // Campos legados preservados para compatibilidade com snapshots antigos
  attackerGoalPoints?: number;
  goalkeeperLossPoints?: number;
  teamGoalConcededPoints?: number;
};

export const DEFAULT_FANTASY_SETTINGS: FantasySettings = {
  roleScoringActive: true,
  currencyName: "C$",
  initialBudget: 55,
  initialPlayerPrice: 10,
  minPlayerPrice: 5,
  maxPlayerPrice: 25,
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
  maxPriceIncrease: 0.12,
  maxPriceDecrease: 0.10,
  minSampleForRadar: 3,
  // Campos legados — preservados para snapshots antigos
  attackerGoalPoints: BQ_SCORING_V5.goal,
  goalkeeperLossPoints: BQ_SCORING_V5.loss,
  teamGoalConcededPoints: 0,
};

export const FANTASY_RECENT_ROUND_WEIGHTS = [0.40, 0.25, 0.15, 0.12, 0.08] as const;

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
