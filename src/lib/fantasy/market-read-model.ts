export type FantasyMarketReadModel = {
  prices: any[];
  stats: any[];
  players: any[];
  history: any[];
};

type FantasyMarketEligibilityInput = {
  profileComplete: boolean;
};

export function isFantasyMarketPlayerEligible({
  profileComplete,
}: FantasyMarketEligibilityInput) {
  return profileComplete;
}

export function parseFantasyMarketReadModel(data: unknown, hasError: boolean): FantasyMarketReadModel | null {
  if (hasError || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  return {
    prices: Array.isArray(value.prices) ? value.prices : [],
    stats: Array.isArray(value.stats) ? value.stats : [],
    players: Array.isArray(value.players) ? value.players : [],
    history: Array.isArray(value.history) ? value.history : [],
  };
}
