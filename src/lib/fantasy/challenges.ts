import type { FantasySettings } from "./config";

export const FANTASY_CHALLENGE_TYPES = [
  "REI_DAS_VITORIAS",
  "MITO_DA_RODADA",
  "APOSTA_DA_RODADA",
  "VAI_GUARDAR",
] as const;

export type FantasyChallengeType = (typeof FANTASY_CHALLENGE_TYPES)[number];
export type FantasyPriceBand = 1 | 2 | 3 | 4;

export const CHALLENGE_LABELS: Record<FantasyChallengeType, string> = {
  REI_DAS_VITORIAS: "Rei das Vitórias",
  MITO_DA_RODADA: "Mito da Rodada",
  APOSTA_DA_RODADA: "Aposta da Rodada",
  VAI_GUARDAR: "Vai guardar?",
};

export function fantasyPriceBand(playerPrice: number, marketPrices: number[]): FantasyPriceBand {
  if (marketPrices.length <= 1) return 1;
  const cheaper = marketPrices.filter((price) => price < playerPrice).length;
  const percentile = cheaper / Math.max(1, marketPrices.length - 1);
  if (percentile < 0.25) return 1;
  if (percentile < 0.5) return 2;
  if (percentile < 0.75) return 3;
  return 4;
}

export function fantasyChallengeOffer(
  type: FantasyChallengeType,
  playerPrice: number,
  marketPrices: number[],
  settings: FantasySettings,
) {
  const band = fantasyPriceBand(playerPrice, marketPrices);
  if (type === "REI_DAS_VITORIAS") {
    return { band, reward: settings.kingOfWinsPoints, requiredRank: null, description: "Terminar com mais vitórias individuais" };
  }
  if (type === "MITO_DA_RODADA") {
    return { band, reward: settings.mvpPredictionPoints, requiredRank: null, description: "Ser o maior pontuador base da rodada" };
  }
  if (type === "APOSTA_DA_RODADA") {
    const requiredRank = settings.betRequiredRanks[band - 1];
    return { band, reward: settings.betOfRoundPoints, requiredRank, description: `Terminar no TOP ${requiredRank}` };
  }
  return { band, reward: settings.scoreGoalRewards[band - 1], requiredRank: null, description: "Marcar pelo menos 1 gol" };
}

export function isFantasyChallengeType(value: unknown): value is FantasyChallengeType {
  return typeof value === "string" && FANTASY_CHALLENGE_TYPES.includes(value as FantasyChallengeType);
}

export function fantasyChallengeIsCorrect(input: {
  type: FantasyChallengeType;
  selectedId: string;
  requiredRank?: number | null;
  performances: Array<{ playerId: string; goals: number; wins: number; basePoints: number }>;
}) {
  const selected = input.performances.find((item) => item.playerId === input.selectedId);
  if (!selected) return false;
  if (input.type === "VAI_GUARDAR") return selected.goals >= 1;
  if (input.type === "REI_DAS_VITORIAS") {
    const leader = Math.max(0, ...input.performances.map((item) => item.wins));
    return leader > 0 && selected.wins === leader;
  }
  if (input.type === "MITO_DA_RODADA") {
    const leader = Math.max(0, ...input.performances.map((item) => item.basePoints));
    return leader > 0 && selected.basePoints === leader;
  }
  const rank = 1 + input.performances.filter((item) => item.basePoints > selected.basePoints).length;
  return selected.basePoints > 0 && rank <= (input.requiredRank || 0);
}
