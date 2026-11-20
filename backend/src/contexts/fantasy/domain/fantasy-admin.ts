export type FantasyRankingScope = "general" | "season" | "month" | "round";

export type FantasyRankingEntry = {
  rank: number;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  totalPoints: number;
  patrimony: number;
  lastRoundPoints: number | null;
  lineupsCount: number;
};

export type FantasyUserRoundHistoryDetail = {
  userId: string;
  roundId: string;
  roundNumber: number;
  score: number;
  captainPlayerId: string;
  captainMultiplier: number;
  slots: Array<{
    slotRole: "GOL" | "DEF" | "MEI" | "ATA";
    playerId: string;
    playerName: string;
    score: number;
    isCaptain: boolean;
  }>;
};

export type SeasonPassDashboardData = {
  authenticated: boolean;
  available: boolean;
  progress: number;
  maxProgress: 40;
  mode: "athlete" | "community";
  participations: number;
  activeWeeks: number;
  validLineups: number;
  shopCycleRemainder: number;
  shopBonusPoints: number;
  nextMilestone: number | null;
  playerName: string | null;
  playerAvatarUrl: string | null;
  events: Array<{ id: string; eventType: "valid_lineup"; houses: number; roundId: string | null; roundNumber: number | null; roundDate: string | null; createdAt: string }>;
};

export type FantasyAdminConfigData = {
  settings: Record<string, unknown> | null;
  rounds: Array<Record<string, unknown>>;
  testSession: Record<string, unknown> | null;
  friendlyRounds: Array<Record<string, unknown>>;
  marketStatus: unknown | null;
};

export function validateFantasySettingsUpdate(values: {
  initialBudget?: number;
}): { valid: boolean; error?: string; normalizedBudget?: number } {
  if (values.initialBudget !== undefined) {
    if (values.initialBudget < 20 || values.initialBudget > 500) {
      return { valid: false, error: "O patrimônio inicial deve estar entre C$ 20 e C$ 500." };
    }
    return { valid: true, normalizedBudget: Math.round(values.initialBudget * 100) / 100 };
  }
  return { valid: true };
}

export function sortFantasyRankingEntries(
  entries: Array<{ userId: string; userName: string; userAvatarUrl: string | null; totalPoints: number; patrimony: number; lastRoundPoints: number | null; lineupsCount: number }>
): FantasyRankingEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.patrimony !== a.patrimony) return b.patrimony - a.patrimony;
    return a.userName.localeCompare(b.userName);
  });

  return sorted.map((entry, index) => ({
    rank: index + 1,
    ...entry,
    totalPoints: Math.round(entry.totalPoints * 100) / 100,
    patrimony: Math.round(entry.patrimony * 100) / 100,
  }));
}
