export type FantasyPlayerIdentity = {
  name: string | null;
  avatar_url: string | null;
};

export type FantasyCosmeticsReadModel = {
  frameKey: string | null;
  auraKey: string | null;
  nameplateKey?: string | null;
  titleName?: string | null;
  backgroundAssetKey: string | null;
};

export type FantasyRoundCardReadModel = {
  slug: string | null;
  name: string;
  rarity: string;
  bonus: number;
  budgetRecovery: number;
  description: string | null;
  status: string;
  details: Record<string, unknown>;
  fallbackBonus: number;
};

/** Contract consumed by the existing Cartola ranking screens. */
export type FantasyRankingReadModel = {
  id?: string;
  user_id: string;
  total_points: number;
  rounds_played: number;
  best_round_points: number;
  captain_bonus_points: number;
  def_points: number;
  mid_points: number;
  mid_selection_count: number;
  mid_average_points: number;
  attack_points: number;
  attack_selection_count: number;
  attack_average_points: number;
  current_budget: number;
  is_live: boolean;
  position: number;
  score_breakdown?: Record<string, unknown> | null;
  player: FantasyPlayerIdentity | null;
  cosmetics: FantasyCosmeticsReadModel | null;
  roundCard: FantasyRoundCardReadModel | null;
};

export type FantasyHistoryLineupReadModel = Record<string, unknown> & {
  id: string;
  fantasyRound: Record<string, unknown>;
  round: Record<string, unknown>;
  activeCard: (Record<string, unknown> & { bonus: number }) | null;
};

export type FantasyUserHistoryReadModel = {
  userId: string;
  player: FantasyPlayerIdentity;
  account: {
    totalPoints: number;
    currentBudget: number;
    roundsPlayed: number;
    bestRoundPoints: number;
  };
  lineups: FantasyHistoryLineupReadModel[];
};

export type FantasyUserRoundHistoryReadModel = {
  history: FantasyUserHistoryReadModel | { player: null };
  lineup: Record<string, unknown> & {
    id: string;
    player_points: number;
    total_points: number;
    fantasy_lineup_players: Array<Record<string, unknown>>;
  };
  round: Record<string, unknown>;
  isLive: boolean;
  scoringVersion: number;
  settingsSnapshot: Record<string, unknown>;
  statsByPlayer: Record<string, Record<string, unknown>>;
  predictionPlayers: Record<string, Record<string, unknown>>;
  activeCard: Record<string, unknown> | null;
};
