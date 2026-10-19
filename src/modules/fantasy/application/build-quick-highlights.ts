export type FantasyQuickHighlightPriceRow = {
  current_price?: number | null;
  last_round_points?: number | null;
  last_price_change?: number | null;
  variation_rate?: number | null;
  players?: { name?: string | null; avatar_url?: string | null } | Array<{ name?: string | null; avatar_url?: string | null }> | null;
};

export function buildFantasyQuickHighlights(prices: FantasyQuickHighlightPriceRow[]) {
  if (!prices.length) return null;
  const values = prices.map((item) => {
    const player = Array.isArray(item.players) ? item.players[0] : item.players;
    return {
      name: player?.name || "Jogador",
      avatarUrl: player?.avatar_url || null,
      points: Number(item.last_round_points || 0),
      priceChange: Number(item.last_price_change || 0),
      variation: Number(item.variation_rate || 0),
    };
  });
  const topScorer = [...values].sort((a, b) => b.points - a.points)[0];
  const topGain = [...values].sort((a, b) => b.variation - a.variation)[0];
  const topDrop = [...values].sort((a, b) => a.variation - b.variation)[0];
  return {
    topScorer: topScorer?.points > 0 ? topScorer : null,
    topGain: topGain?.variation > 0 ? topGain : null,
    topDrop: topDrop?.variation < 0 ? topDrop : null,
  };
}
