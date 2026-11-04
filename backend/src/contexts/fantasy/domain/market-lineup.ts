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
  slotRole: "GOL" | "DEF" | "ATA";
  slotIndex: number;
  playerId: string;
  isCaptain?: boolean;
};

export type FantasyLineupSubmission = {
  roundId: string;
  playerIds: string[];
  slotAssignments: FantasyLineupSlot[];
  captainId: string;
  scorerId?: string | null;
  assistId?: string | null;
  challengeId?: string | null;
  reservePlayerId?: string | null;
  reserveRole?: "GOL" | "DEF" | "ATA" | null;
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
  player: {
    id: string;
    name: string;
    avatarUrl: string | null;
    profile: string | null;
    memberCategory: string | null;
  };
  price: number;
  totalPoints: number;
  roundsPlayed: number;
  averagePoints: number;
  stats: Record<string, number>;
  trend: string;
  trendLabel: string;
  trendIcon: string;
  form: string;
  formLabel: string;
  formIcon: string;
  formColorClass: string;
  costBenefitScore: number;
  costBenefitRatio: number;
  costBenefitFormatted: string;
  expectedPoints: number;
  recentPointsList: number[];
  allTags: unknown[];
  compactTags: unknown[];
  history: Array<Record<string, unknown>>;
  roundDetail: Record<string, unknown> | null;
  cosmetics: { bannerAssetKey: string | null; frameKey: string | null };
};

export type FantasyMarketQuickHighlights = {
  topScorer: { name: string; avatarUrl: string | null; points: number } | null;
  topGain: { name: string; avatarUrl: string | null; variation: number; priceChange: number } | null;
  topDrop: { name: string; avatarUrl: string | null; variation: number; priceChange: number } | null;
};

export type FantasyRoundOverview = {
  roundId?: string | null;
  roundNumber?: number | null;
  roundDate?: string | null;
  isRoundOpen: boolean;
  confirmedCount: number;
  pendingCount: number;
  confirmed: FantasyLineupStatusEntry[];
  pending: FantasyLineupStatusEntry[];
  ranking: Array<Record<string, unknown>>;
};

export type FantasyLineupStatusEntry = {
  userId: string;
  playerName: string;
  avatarUrl: string | null;
  hasSaved: boolean;
  savedAt: string | null;
  points?: number | null;
  isCurrentUser: boolean;
  cosmetics: {
    frameKey: string | null;
    auraKey: string | null;
    backgroundAssetKey: string | null;
  } | null;
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
  input: FantasyLineupSubmission;
  playersPerTeam: number;
  availableBudget: number;
  playerPrices: Map<string, number>;
  isMarketOpen: boolean;
}): { valid: boolean; error?: string; totalCost: number } {
  if (!params.isMarketOpen) {
    return { valid: false, error: "O mercado está fechado para esta rodada.", totalCost: 0 };
  }

  const { input } = params;
  if (!input.slotAssignments || input.slotAssignments.length !== params.playersPerTeam
    || input.playerIds.length !== params.playersPerTeam) {
    return { valid: false, error: `Escolha exatamente ${params.playersPerTeam} titulares.`, totalCost: 0 };
  }

  const slotsAreValid = input.slotAssignments.every((slot) =>
    input.playerIds.includes(slot.playerId) && Number.isInteger(slot.slotIndex) && slot.slotIndex >= 0)
    && new Set(input.slotAssignments.map((slot) => slot.slotIndex)).size === params.playersPerTeam;
  if (!slotsAreValid) return { valid: false, error: "As posições da escalação são inválidas.", totalCost: 0 };

  if (Boolean(input.reservePlayerId) !== Boolean(input.reserveRole)) {
    return { valid: false, error: "Escolha o jogador e a posição do banco de reserva.", totalCost: 0 };
  }
  if (input.reservePlayerId && input.playerIds.includes(input.reservePlayerId)) {
    return { valid: false, error: "O jogador do banco não pode estar entre os titulares.", totalCost: 0 };
  }

  const playerIds = new Set<string>();
  let totalCostCents = 0;

  for (const slot of input.slotAssignments) {
    if (playerIds.has(slot.playerId)) {
      return { valid: false, error: "Não é permitido escalar o mesmo atleta duas vezes.", totalCost: 0 };
    }
    playerIds.add(slot.playerId);

    const price = params.playerPrices.get(slot.playerId);
    if (price == null || !Number.isFinite(price) || price < 0) {
      return { valid: false, error: "A escalação contém atleta fora do mercado atual.", totalCost: 0 };
    }
    totalCostCents += Math.round(price * 100);
  }

  if (!playerIds.has(input.captainId)) {
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

