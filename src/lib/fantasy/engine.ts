import type { FantasySettings } from "./config";

export type FantasyPerformance = {
  playerId: string;
  games: number;
  wins: number;
  draws: number;
  goals: number;
  assists: number;
  recentPoints: number[];
  seasonPoints: number[];
  currentPrice: number;
};

export type FantasyPriceResult = FantasyPerformance & {
  roundPoints: number;
  score: number;
  variationRate: number;
  nextPrice: number;
};

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateFantasyPlayerPoints(
  stats: Pick<FantasyPerformance, "goals" | "assists" | "wins">,
  settings: FantasySettings,
) {
  return stats.goals * settings.goalPoints
    + stats.assists * settings.assistPoints
    + stats.wins * settings.winPoints;
}

export function predictionIsCorrect<T>(choice: T | null | undefined, leaders: T[], leaderValue: number) {
  return leaderValue > 0 && choice != null && leaders.includes(choice);
}

export function validateFantasyDraft(input: {
  playerIds: string[];
  captainPlayerId?: string | null;
  prices: Map<string, number>;
  budget: number;
}) {
  const uniqueIds = [...new Set(input.playerIds)];
  if (uniqueIds.length !== input.playerIds.length) return { valid: false, error: "Jogador repetido na escalação." };
  if (uniqueIds.length > 5) return { valid: false, error: "A escalação aceita no máximo 5 jogadores." };
  if (input.captainPlayerId && !uniqueIds.includes(input.captainPlayerId)) {
    return { valid: false, error: "O capitão precisa estar entre os jogadores escalados." };
  }
  const cost = roundMoney(uniqueIds.reduce((total, id) => total + (input.prices.get(id) ?? Number.POSITIVE_INFINITY), 0));
  if (!Number.isFinite(cost)) return { valid: false, error: "Preço de jogador inválido." };
  if (cost > input.budget) return { valid: false, error: "A escalação ultrapassa o patrimônio disponível." };
  return { valid: true, cost, complete: uniqueIds.length === 5 && Boolean(input.captainPlayerId) };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function percentiles(values: Array<{ playerId: string; value: number }>) {
  const sorted = [...values].sort((a, b) => a.value - b.value || a.playerId.localeCompare(b.playerId));
  const result = new Map<string, number>();
  if (sorted.length <= 1) {
    sorted.forEach((item) => result.set(item.playerId, 0.5));
    return result;
  }
  sorted.forEach((item, index) => result.set(item.playerId, index / (sorted.length - 1)));
  return result;
}

export function calculateFantasyPrices(players: FantasyPerformance[], settings: FantasySettings): FantasyPriceResult[] {
  const participants = players.filter((player) => player.games > 0);
  if (!participants.length) return players.map((player) => ({ ...player, roundPoints: 0, score: 0.5, variationRate: 0, nextPrice: player.currentPrice }));

  const roundPoints = new Map(participants.map((player) => [player.playerId, calculateFantasyPlayerPoints(player, settings)]));
  const leagueWinRate = average(participants.map((player) => (player.wins * 3 + player.draws) / Math.max(1, player.games * 3)));
  const recentValues = participants.map((player) => ({
    playerId: player.playerId,
    value: 0.6 * (roundPoints.get(player.playerId) || 0) + 0.4 * average(player.recentPoints.slice(-3)),
  }));
  const winRateValues = participants.map((player) => ({
    playerId: player.playerId,
    value: ((player.wins * 3 + player.draws) + leagueWinRate * 3 * settings.smoothingGames)
      / Math.max(1, player.games * 3 + settings.smoothingGames * 3),
  }));
  const historicalValues = participants.map((player) => ({ playerId: player.playerId, value: average(player.seasonPoints) }));
  const consistencyValues = participants.map((player) => ({
    playerId: player.playerId,
    value: player.recentPoints.length < 2 ? 0 : -standardDeviation(player.recentPoints.slice(-5)),
  }));
  const recentPercentile = percentiles(recentValues);
  const winRatePercentile = percentiles(winRateValues);
  const historicalPercentile = percentiles(historicalValues);
  const consistencyPercentile = percentiles(consistencyValues);

  const scored = participants.map((player) => {
    const score = (recentPercentile.get(player.playerId) || 0) * settings.recentWeight
      + (winRatePercentile.get(player.playerId) || 0) * settings.winRateWeight
      + (historicalPercentile.get(player.playerId) || 0) * settings.historicalWeight
      + (consistencyPercentile.get(player.playerId) || 0) * settings.consistencyWeight;
    const rawRate = score >= 0.5
      ? ((score - 0.5) / 0.5) * settings.maxPriceIncrease
      : -((0.5 - score) / 0.5) * settings.maxPriceDecrease;
    return { player, score, rawRate };
  });
  const meanRate = average(scored.map((item) => item.rawRate));
  const byId = new Map(scored.map(({ player, score, rawRate }) => {
    const variationRate = Math.max(-settings.maxPriceDecrease, Math.min(settings.maxPriceIncrease, rawRate - meanRate));
    const nextPrice = roundMoney(Math.max(settings.minPlayerPrice, Math.min(settings.maxPlayerPrice, player.currentPrice * (1 + variationRate))));
    return [player.playerId, { ...player, roundPoints: roundPoints.get(player.playerId) || 0, score, variationRate, nextPrice }];
  }));
  return players.map((player) => byId.get(player.playerId) || ({ ...player, roundPoints: 0, score: 0.5, variationRate: 0, nextPrice: player.currentPrice }));
}

