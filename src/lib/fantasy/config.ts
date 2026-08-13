export type FantasySettings = {
  currencyName: string;
  initialBudget: number;
  initialPlayerPrice: number;
  minPlayerPrice: number;
  maxPlayerPrice: number;
  goalPoints: number;
  assistPoints: number;
  winPoints: number;
  captainMultiplier: number;
  topScorerPredictionPoints: number;
  topAssistPredictionPoints: number;
  topTeamPredictionPoints: number;
  recentWeight: number;
  winRateWeight: number;
  historicalWeight: number;
  consistencyWeight: number;
  smoothingGames: number;
  maxPriceIncrease: number;
  maxPriceDecrease: number;
};

export const DEFAULT_FANTASY_SETTINGS: FantasySettings = {
  currencyName: "C$",
  initialBudget: 55,
  initialPlayerPrice: 10,
  minPlayerPrice: 5,
  maxPlayerPrice: 25,
  goalPoints: 5,
  assistPoints: 3,
  winPoints: 2,
  captainMultiplier: 2,
  topScorerPredictionPoints: 8,
  topAssistPredictionPoints: 6,
  topTeamPredictionPoints: 5,
  recentWeight: 0.4,
  winRateWeight: 0.35,
  historicalWeight: 0.15,
  consistencyWeight: 0.1,
  smoothingGames: 5,
  maxPriceIncrease: 0.12,
  maxPriceDecrease: 0.1,
};

export function formatFantasyMoney(value: number, currencyName = "C$") {
  return `${currencyName} ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

