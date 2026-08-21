import type { FantasyCardDefinition } from "./catalog";

export type PricedFantasyPlayer = {
  id: string;
  price: number;
};

function sortedPrices(players: PricedFantasyPlayer[]) {
  return players
    .map((player) => Number(player.price))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

export function getFantasyMedianPrice(players: PricedFantasyPlayer[]) {
  const prices = sortedPrices(players);
  if (prices.length === 0) return null;
  const middle = Math.floor(prices.length / 2);
  return prices.length % 2 === 0
    ? (prices[middle - 1] + prices[middle]) / 2
    : prices[middle];
}

export function isFantasyPriceEligible(
  card: Pick<FantasyCardDefinition, "targetFilter">,
  player: PricedFantasyPlayer,
  marketPlayers: PricedFantasyPlayer[],
) {
  if (!card.targetFilter || card.targetFilter === "ANY_IN_LINEUP" || card.targetFilter === "ANY_IN_MARKET") return true;
  const prices = sortedPrices(marketPlayers);
  if (prices.length === 0) return false;

  const allPricesEqual = prices[0] === prices[prices.length - 1];
  if (card.targetFilter === "BELOW_MEDIAN_PRICE") {
    const median = getFantasyMedianPrice(marketPlayers);
    if (median === null) return false;
    // Na primeira rodada todos começam no mesmo preço. Nesse empate total,
    // qualquer atleta escalado pode cumprir a proposta da carta.
    return allPricesEqual ? player.price === median : player.price < median;
  }

  if (card.targetFilter === "CHEAPEST_50_PERCENT") {
    const cutoffIndex = Math.max(0, Math.ceil(prices.length * 0.5) - 1);
    return player.price <= prices[cutoffIndex];
  }

  return true;
}

export function filterFantasyCardTargets<T extends PricedFantasyPlayer>(
  card: Pick<FantasyCardDefinition, "targetFilter">,
  lineupPlayers: T[],
  marketPlayers: PricedFantasyPlayer[],
) {
  return lineupPlayers.filter((player) => isFantasyPriceEligible(card, player, marketPlayers));
}
