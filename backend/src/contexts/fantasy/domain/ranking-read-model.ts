export type FantasyRankingAccountRow = {
  id?: string;
  user_id: string;
  total_points?: number | null;
  current_budget?: number | null;
  rounds_played?: number | null;
  best_round_points?: number | null;
};

export type FantasyRankingLineupRow = {
  user_id: string;
  total_points?: number | null;
  fantasy_lineup_players?: Array<{
    total_points?: number | null;
    captain_bonus?: number | null;
    slot_role?: string | null;
    player_profile_locked?: string | null;
  }> | null;
};

export type FantasyRankingLiveProjection = {
  userId: string;
  lineupId?: string | null;
  totalPoints?: number | null;
  captainBonus?: number | null;
  players?: Array<{ slotRole?: string | null; totalPoints?: number | null }>;
};

type HistoricalFantasyMetrics = {
  totalPoints: number;
  roundsPlayed: number;
  bestRound: number;
  captainBonusPoints: number;
  defPoints: number;
  attackPoints: number;
  attackSelections: number;
};

function emptyHistoricalMetrics(): HistoricalFantasyMetrics {
  return {
    totalPoints: 0,
    roundsPlayed: 0,
    bestRound: 0,
    captainBonusPoints: 0,
    defPoints: 0,
    attackPoints: 0,
    attackSelections: 0,
  };
}

function roleOf(player: NonNullable<FantasyRankingLineupRow["fantasy_lineup_players"]>[number]) {
  const rawRole = player.slot_role || (
    player.player_profile_locked === "defensive" ? "DEF"
      : player.player_profile_locked === "midfield" || player.player_profile_locked === "offensive" ? "ATA"
        : null
  );
  return rawRole === "MEI" ? "ATA" : rawRole;
}

export function aggregateFantasyRankingHistory(lineups: FantasyRankingLineupRow[]) {
  const byUser = new Map<string, HistoricalFantasyMetrics>();
  for (const lineup of lineups) {
    const current = byUser.get(lineup.user_id) || emptyHistoricalMetrics();
    const roundPoints = Number(lineup.total_points || 0);
    current.totalPoints += roundPoints;
    current.roundsPlayed += 1;
    current.bestRound = Math.max(current.bestRound, roundPoints);
    for (const player of lineup.fantasy_lineup_players || []) {
      current.captainBonusPoints += Number(player.captain_bonus || 0);
      const role = roleOf(player);
      if (role === "DEF") current.defPoints += Number(player.total_points || 0);
      if (role === "ATA") {
        current.attackPoints += Number(player.total_points || 0);
        current.attackSelections += 1;
      }
    }
    byUser.set(lineup.user_id, current);
  }
  return byUser;
}

function liveMetrics(projection?: FantasyRankingLiveProjection) {
  const metrics = {
    totalPoints: Number(projection?.totalPoints || 0),
    captainBonusPoints: Number(projection?.captainBonus || 0),
    defPoints: 0,
    attackPoints: 0,
    attackSelections: 0,
  };
  for (const player of projection?.players || []) {
    if (player.slotRole === "DEF") metrics.defPoints += Number(player.totalPoints || 0);
    if (player.slotRole === "ATA") {
      metrics.attackPoints += Number(player.totalPoints || 0);
      metrics.attackSelections += 1;
    }
  }
  return metrics;
}

export function buildSeasonFantasyRanking(input: {
  accounts: FantasyRankingAccountRow[];
  scoredLineups: FantasyRankingLineupRow[];
  liveProjections?: Iterable<FantasyRankingLiveProjection>;
}) {
  const historicalByUser = aggregateFantasyRankingHistory(input.scoredLineups);
  const liveProjections = input.liveProjections ? [...input.liveProjections] : [];
  const liveByUser = new Map(liveProjections.map((item) => [item.userId, item]));
  const userIds = new Set([
    ...input.accounts.map((item) => item.user_id),
    ...historicalByUser.keys(),
    ...liveByUser.keys(),
  ]);
  const accountByUser = new Map(input.accounts.map((item) => [item.user_id, item]));

  return [...userIds].map((userId) => {
    const account = accountByUser.get(userId);
    const historical = historicalByUser.get(userId) || emptyHistoricalMetrics();
    const projection = liveByUser.get(userId);
    const currentLive = liveMetrics(projection);
    const attackSelections = historical.attackSelections + currentLive.attackSelections;
    return {
      ...account,
      id: account?.id || projection?.lineupId || undefined,
      user_id: userId,
      total_points: historical.totalPoints + currentLive.totalPoints,
      rounds_played: historical.roundsPlayed,
      best_round_points: Math.max(historical.bestRound, currentLive.totalPoints),
      captain_bonus_points: historical.captainBonusPoints + currentLive.captainBonusPoints,
      def_points: historical.defPoints + currentLive.defPoints,
      mid_points: 0,
      mid_selection_count: 0,
      mid_average_points: 0,
      attack_points: historical.attackPoints + currentLive.attackPoints,
      attack_selection_count: attackSelections,
      attack_average_points: (historical.attackPoints + currentLive.attackPoints) / Math.max(1, attackSelections),
      current_budget: Number(account?.current_budget || 0),
      is_live: Boolean(projection),
    };
  });
}

export function assignFantasyRankingPositions<T extends { total_points?: number | null }>(entries: T[]) {
  const ordered = [...entries].sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0));
  let previousPoints: number | null = null;
  let previousPosition = 0;
  return ordered.map((entry, index) => {
    const points = Number(entry.total_points || 0);
    const position = previousPoints === points ? previousPosition : index + 1;
    previousPoints = points;
    previousPosition = position;
    return { ...entry, position };
  });
}
