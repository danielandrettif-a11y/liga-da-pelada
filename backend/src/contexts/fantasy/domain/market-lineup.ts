export type FantasyPlayerMarketStatus = "provavel" | "duvida" | "nulo";

export type FantasyMarketPlayerSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  profile: string | null;
  isGoalkeeper: boolean;
  isGoodGoalkeeper: boolean;
  price: number;
  totalPoints: number;
  roundsPlayed: number;
  averagePoints: number;
  lastRoundPoints: number | null;
  status: FantasyPlayerMarketStatus;
  trend: "up" | "down" | "flat";
};

export type FantasyLineupSlot = {
  slotRole: "GOL" | "DEF" | "MEI" | "ATA";
  playerId: string;
  isCaptain?: boolean;
};

export type SavedFantasyLineup = {
  id?: string;
  userId: string;
  roundId: string;
  leagueId: string;
  captainPlayerId: string;
  slots: FantasyLineupSlot[];
  totalCost: number;
  lockedAt?: string | null;
  score?: number | null;
};

export type FantasyMarketDashboardData = {
  authenticated: boolean;
  available: boolean;
  roundId?: string | null;
  roundNumber?: number | null;
  marketOpen: boolean;
  marketClosesAt?: string | null;
  budget: number;
  spent: number;
  balance: number;
  players: FantasyMarketPlayerSummary[];
  lineup: SavedFantasyLineup | null;
  confirmedCount: number;
  totalPlayersCount: number;
};

export type FantasyPlayerPerformanceDetail = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  profile: string | null;
  price: number;
  averagePoints: number;
  totalPoints: number;
  matchesPlayed: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  formLevel: "hot" | "warm" | "cold";
  recentRounds: Array<{
    roundId: string;
    roundNumber: number;
    score: number;
    priceVariation: number;
  }>;
};

export type FantasyMarketQuickHighlights = {
  topValuedPlayer: { id: string; name: string; price: number; variation: number } | null;
  topScorerPlayer: { id: string; name: string; averagePoints: number } | null;
  bestCostBenefitPlayer: { id: string; name: string; scorePerCoin: number } | null;
};

export type FantasyRoundOverview = {
  roundId: string;
  isRoundOpen: boolean;
  confirmedCount: number;
  revealedLineupsCount: number;
};

export type FantasyUserSummary = {
  userId: string;
  totalPoints: number;
  seasonRank: number;
  patrimony: number;
  lineupsCount: number;
};

export type UserFantasyHistoryEntry = {
  roundId: string;
  roundNumber: number;
  score: number;
  rankInRound: number;
  patrimonyAfter: number;
  captainName: string | null;
};

export function validateLineupSubmission(params: {
  slots: FantasyLineupSlot[];
  captainPlayerId: string;
  availableBudget: number;
  playerPrices: Map<string, number>;
  isMarketOpen: boolean;
}): { valid: boolean; error?: string; totalCost: number } {
  if (!params.isMarketOpen) {
    return { valid: false, error: "O mercado está fechado para esta rodada.", totalCost: 0 };
  }

  if (!params.slots || params.slots.length === 0) {
    return { valid: false, error: "A escalação não pode estar vazia.", totalCost: 0 };
  }

  const playerIds = new Set<string>();
  let totalCostCents = 0;

  for (const slot of params.slots) {
    if (playerIds.has(slot.playerId)) {
      return { valid: false, error: "Não é permitido escalar o mesmo atleta duas vezes.", totalCost: 0 };
    }
    playerIds.add(slot.playerId);

    const price = params.playerPrices.get(slot.playerId) ?? 5.0;
    totalCostCents += Math.round(price * 100);
  }

  if (!playerIds.has(params.captainPlayerId)) {
    return { valid: false, error: "O capitão selecionado deve estar na sua escalação.", totalCost: 0 };
  }

  const budgetCents = Math.round(params.availableBudget * 100);
  if (totalCostCents > budgetCents) {
    const totalCost = totalCostCents / 100;
    return {
      valid: false,
      error: `Orçamento insuficiente. Custo: C$ ${totalCost.toFixed(2)}, disponível: C$ ${params.availableBudget.toFixed(2)}.`,
      totalCost,
    };
  }

  return {
    valid: true,
    totalCost: Math.round(totalCostCents) / 100,
  };
}

export function calculateCostBenefitRatio(points: number, price: number): number {
  if (price <= 0) return 0;
  return Math.round((points / price) * 100) / 100;
}

