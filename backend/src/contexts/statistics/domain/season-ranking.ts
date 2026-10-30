export type RankingRoundRow = {
  playerId: string;
  roundId: string;
  games: number;
  wins: number;
  goals: number;
  assists: number;
  points: number;
  rankingPoints: number | null;
};

export type SeasonRankingCoreEntry = {
  playerId: string;
  points: number;
  wins: number;
  goals: number;
  assists: number;
  games: number;
};

export const roundRankingPoints = (value: number) => Math.round(Number(value || 0) * 100) / 100;

/**
 * Núcleo da classificação oficial atual. O leitor deve entregar apenas rodadas
 * oficiais encerradas da temporada e perfis competitivos da mesma pelada.
 * Detalhamento, premiações e enriquecimentos permanecem fora deste modelo.
 */
export function buildSeasonRankingCore(
  rows: RankingRoundRow[],
  recentRoundIds: string[],
  bestRoundsLimit = 6,
): SeasonRankingCoreEntry[] {
  if (!Number.isInteger(bestRoundsLimit) || bestRoundsLimit < 1) throw new Error("Limite de rodadas inválido.");
  const recent = new Set(recentRoundIds.slice(0, 3));
  const active = new Set(rows.flatMap((row) => recent.has(row.roundId) && Number(row.games || 0) > 0 ? [row.playerId] : []));
  const byPlayer = new Map<string, RankingRoundRow[]>();
  for (const row of rows) {
    if (!active.has(row.playerId) || Number(row.games || 0) <= 0) continue;
    const playerRows = byPlayer.get(row.playerId) || [];
    playerRows.push(row);
    byPlayer.set(row.playerId, playerRows);
  }
  const entries = [...byPlayer].map(([playerId, playerRows]) => {
    const ordered = [...playerRows].sort((a, b) =>
      roundRankingPoints(Number(b.rankingPoints ?? b.points)) - roundRankingPoints(Number(a.rankingPoints ?? a.points)));
    const points = roundRankingPoints(ordered.slice(0, bestRoundsLimit)
      .reduce((total, row) => total + roundRankingPoints(Number(row.rankingPoints ?? row.points)), 0));
    return {
      playerId,
      points,
      wins: playerRows.reduce((total, row) => total + Number(row.wins || 0), 0),
      goals: playerRows.reduce((total, row) => total + Number(row.goals || 0), 0),
      assists: playerRows.reduce((total, row) => total + Number(row.assists || 0), 0),
      games: playerRows.reduce((total, row) => total + Number(row.games || 0), 0),
    };
  });
  return entries.sort((a, b) => b.points - a.points || b.wins - a.wins || b.goals - a.goals || b.assists - a.assists);
}

// -------------------------------------------------------------
// Modelos completos de experiência de ranking
// -------------------------------------------------------------

export type RankingPlayer = {
  id: string;
  name: string;
  nickname?: string | null;
  avatar_url?: string | null;
  photo_url?: string | null;
  jersey_number?: number | null;
  primary_position?: string | null;
  secondary_position?: string | null;
  member_category?: string | null;
  is_selectable?: boolean;
  is_active?: boolean;
  is_competitive_profile_complete?: boolean;
  overall_traits?: string[] | null;
  player_profile?: string | null;
};

export type OverallTrend = "rising" | "steady" | "falling";

export type RankingAwards = {
  roundMvp: number;
  topScorer: number;
  topAssister: number;
  kingOfWins: number;
};

export type RankingRoleWeight = {
  role: "DEF" | "MEI" | "ATA";
  overall: number;
  weight: 1 | 0.5;
};

export type RankingPointBreakdownItem = {
  label: string;
  count: number;
  points: number;
};

export type RankingBestRound = {
  roundId: string;
  roundNumber: number;
  date: string;
  points: number;
  legacyPoints: number;
  positionBonus: number;
  roleWeights: RankingRoleWeight[];
  goals: number;
  assists: number;
  teamGoalsConceded: number;
  defensiveCleanGames: number;
  defensiveOneGoalGames: number;
  goalkeeperGames: number;
  goalkeeperGoals: number;
  goalkeeperAssists: number;
  goalkeeperGoalsConceded: number;
  goalkeeperCleanSheets: number;
  wins: number;
  draws: number;
  losses: number;
  games: number;
  pointBreakdown: RankingPointBreakdownItem[];
  countedInTop6: boolean;
  playerProfile: "defensive" | "offensive" | null;
  profileDecisionSource: "initial" | "overall" | null;
  profileAppearanceNumber: number | null;
  profileDefOverall: number | null;
  profileAtaOverall: number | null;
};

export type PlayerAwardType =
  | "roundMvp"
  | "topScorer"
  | "topAssister"
  | "kingOfWins"
  | "bestGoalkeeper"
  | "bestDefender"
  | "seasonTopScorer"
  | "seasonTopAssister";

export type PlayerAward = {
  type: PlayerAwardType;
  roundId: string;
  roundNumber: number;
  roundDate: string;
};

export type PlayerAwardSeason = {
  seasonId: string;
  seasonNumber: number;
  seasonStatus: string;
  awards: PlayerAward[];
};

export type PlayerAchievementBelt = {
  beltId: string;
  name: string;
  category: string;
  icon?: string | null;
  awardedAt?: string | null;
};

export type PlayerEquippedCosmetics = {
  frameKey: string | null;
  auraKey: string | null;
  titleName: string | null;
  bannerAssetKey: string | null;
  nameplateKey: string | null;
};

export type RankingEnrichment = {
  overall?: number | null;
  overallTrend?: OverallTrend | null;
  overallPositions?: { DEF: number; ALA_MEI: number; ATA: number; GOL: number } | null;
  overallPositionTrends?: Record<"DEF" | "ALA_MEI" | "ATA" | "GOL", OverallTrend> | null;
  overallGoalkeeperGames?: number;
  overallGoalkeeperRounds?: number;
  speedRating?: 1 | 2 | 3 | null;
  fitness?: { distanceKm: number; averageSpeedKmh: number; entries: number } | null;
  achievementBelts?: PlayerAchievementBelt[];
  cosmetics?: PlayerEquippedCosmetics | null;
};

export type RankingEntry = RankingEnrichment & {
  player: RankingPlayer;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  points: number;
  legacyPoints: number;
  positionBonus: number;
  goalkeeperStats?: {
    games: number;
    goalsConceded: number;
    cleanSheets: number;
  } | null;
  totalRawPoints?: number;
  bestRounds?: RankingBestRound[];
  legacyBestRounds?: RankingBestRound[];
  minPointsToEnterTop6?: number | null;
  legacyMinPointsToEnterTop6?: number | null;
  winRate: number;
  awards: RankingAwards;
  awardSeasons: PlayerAwardSeason[];
  seasonPosition: number;
  positionChange: number | null;
};

export type RankingExperienceData = {
  seasonLabel: string;
  general: RankingEntry[];
  monthly: {
    key: string;
    label: string;
    entries: RankingEntry[];
  } | null;
  latestRound: {
    id: string;
    number: number;
    date: string;
    entries: RankingEntry[];
  } | null;
};

export type RankingDetailStatsRow = {
  player_id: string;
  round_id: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  points: number;
  goalkeeper_games: number;
  goalkeeper_goals: number;
  goalkeeper_assists: number;
  goalkeeper_own_goals: number;
  goals_conceded: number;
  clean_sheets: number;
  own_goals: number;
  defensive_clean_games: number;
  defensive_one_goal_games: number;
  team_goals_conceded: number;
  ranking_defensive_clean_games: number;
  ranking_defensive_one_goal_games: number;
  ranking_role_weights: unknown;
  ranking_position_bonus: number;
  ranking_points: number | null;
  player_profile_locked: "defensive" | "midfield" | "offensive" | null;
  profile_decision_source: "initial" | "overall" | null;
  profile_appearance_number: number | null;
  profile_def_overall: number | null;
  profile_ata_overall: number | null;
  player: RankingPlayer;
};

export type OfficialRoundMeta = {
  id: string;
  number: number;
  date: string;
  seasonId?: string;
  bestGoalkeeperPlayerId?: string | null;
  scoringSnapshot?: Record<string, unknown> | null;
};

export type VisibleSeasonMeta = {
  id: string;
  number: number;
  status: string;
  startedAt?: string;
};

export function isOfficialAwardAthlete(player: RankingPlayer | null | undefined): boolean {
  if (!player) return true;
  return player.is_selectable !== false && player.member_category === "player";
}

export function sortRankingEntries<T extends Pick<RankingEntry, "points" | "wins" | "goals" | "assists">>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goals !== a.goals) return b.goals - a.goals;
    return b.assists - a.assists;
  });
}

export function sortRankingRounds<T>(rows: T[], pointsFn: (row: T) => number): T[] {
  return [...rows].sort((a, b) => pointsFn(b) - pointsFn(a));
}

export function parseRankingRoleWeights(raw: unknown): RankingRoleWeight[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = (item as any).role;
      if (role !== "DEF" && role !== "MEI" && role !== "ATA") return null;
      const overall = Number((item as any).overall || 0);
      const weight = Number((item as any).weight || 1);
      return {
        role,
        overall,
        weight: weight === 0.5 ? 0.5 : 1,
      } as RankingRoleWeight;
    })
    .filter((w): w is RankingRoleWeight => w !== null);
}

export function buildAwardSeasonsByPlayer(
  rounds: OfficialRoundMeta[],
  stats: Array<Pick<RankingDetailStatsRow, "player_id" | "round_id" | "goals" | "assists" | "wins" | "points" | "games" | "player">>,
  visibleSeasonsMap: Map<string, VisibleSeasonMeta>,
): Map<string, PlayerAwardSeason[]> {
  const roundsById = new Map(rounds.map((r) => [r.id, r]));
  const statsByRound = new Map<string, typeof stats>();
  const seasonsByPlayer = new Map<string, Map<string, PlayerAwardSeason>>();

  function ensureSeason(playerId: string, round: OfficialRoundMeta) {
    const roundSeason = round.seasonId ? visibleSeasonsMap.get(round.seasonId) : undefined;
    const seasonId = roundSeason?.id || round.seasonId || "unknown";
    const seasonNumber = roundSeason?.number || 1;
    const seasonStatus = roundSeason?.status || "active";

    const playerSeasons = seasonsByPlayer.get(playerId) || new Map<string, PlayerAwardSeason>();
    const season = playerSeasons.get(seasonId) || {
      seasonId,
      seasonNumber,
      seasonStatus,
      awards: [],
    };
    playerSeasons.set(seasonId, season);
    seasonsByPlayer.set(playerId, playerSeasons);
    return season;
  }

  for (const stat of stats) {
    const round = roundsById.get(stat.round_id);
    if (!round || !isOfficialAwardAthlete(stat.player)) continue;
    ensureSeason(stat.player_id, round);
    const roundStats = statsByRound.get(stat.round_id) || [];
    roundStats.push(stat);
    statsByRound.set(stat.round_id, roundStats);
  }

  for (const round of rounds) {
    const roundStats = statsByRound.get(round.id) || [];
    const mostGoals = Math.max(0, ...roundStats.map((s) => s.goals));
    const mostAssists = Math.max(0, ...roundStats.map((s) => s.assists));
    const mostPoints = Math.max(0, ...roundStats.map((s) => Number(s.points || 0)));
    const mostWins = Math.max(0, ...roundStats.map((s) => Number(s.wins || 0)));

    for (const stat of roundStats) {
      const season = ensureSeason(stat.player_id, round);
      if (mostPoints > 0 && Number(stat.points || 0) === mostPoints) {
        season.awards.push({ type: "roundMvp", roundId: round.id, roundNumber: round.number, roundDate: round.date });
      }
      if (mostGoals > 0 && stat.goals === mostGoals) {
        season.awards.push({ type: "topScorer", roundId: round.id, roundNumber: round.number, roundDate: round.date });
      }
      if (mostAssists > 0 && stat.assists === mostAssists) {
        season.awards.push({ type: "topAssister", roundId: round.id, roundNumber: round.number, roundDate: round.date });
      }
      if (mostWins > 0 && Number(stat.wins || 0) === mostWins) {
        season.awards.push({ type: "kingOfWins", roundId: round.id, roundNumber: round.number, roundDate: round.date });
      }
    }
  }

  return new Map(
    Array.from(seasonsByPlayer, ([playerId, seasons]) => [
      playerId,
      Array.from(seasons.values()).sort((a, b) => b.seasonNumber - a.seasonNumber),
    ]),
  );
}

export function countAwards(seasons: PlayerAwardSeason[], status?: string): RankingAwards {
  const counts: RankingAwards = { roundMvp: 0, topScorer: 0, topAssister: 0, kingOfWins: 0 };
  for (const season of seasons) {
    if (status && season.seasonStatus !== status) continue;
    for (const award of season.awards) {
      if (
        award.type === "roundMvp" ||
        award.type === "topScorer" ||
        award.type === "topAssister" ||
        award.type === "kingOfWins"
      ) {
        counts[award.type] += 1;
      }
    }
  }
  return counts;
}

export function aggregateRankingRows(
  rows: RankingDetailStatsRow[],
  roundsMap?: Map<string, OfficialRoundMeta>,
  maxBestRounds: number = 6,
): Omit<RankingEntry, "awards" | "awardSeasons" | "seasonPosition" | "positionChange">[] {
  const playerRowsMap = new Map<string, RankingDetailStatsRow[]>();
  for (const row of rows) {
    if (Number(row.games || 0) <= 0) continue;
    const list = playerRowsMap.get(row.player_id) || [];
    list.push(row);
    playerRowsMap.set(row.player_id, list);
  }

  const entries: Omit<RankingEntry, "awards" | "awardSeasons" | "seasonPosition" | "positionChange">[] = [];

  for (const [, playerRows] of playerRowsMap.entries()) {
    if (!playerRows.length || !playerRows[0]) continue;
    const first = playerRows[0];

    const officialRows = sortRankingRounds(playerRows, (row) => roundRankingPoints(Number(row.ranking_points ?? row.points)));
    const legacyRows = sortRankingRounds(playerRows, (row) => row.points);

    let totalRawPoints = 0;
    let games = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goals = 0;
    let assists = 0;
    let goalkeeperGames = 0;
    let goalsConceded = 0;
    let cleanSheets = 0;

    for (const r of playerRows) {
      totalRawPoints += r.points;
      games += r.games;
      wins += r.wins;
      draws += r.draws;
      losses += r.losses;
      goals += r.goals;
      assists += r.assists;
      goalkeeperGames += r.goalkeeper_games;
      goalsConceded += r.goals_conceded;
      cleanSheets += r.clean_sheets;
    }

    const mapRound = (r: RankingDetailStatsRow, countedInTop6: boolean, legacy = false): RankingBestRound => {
      const roundInfo = roundsMap?.get(r.round_id);
      const playerProfile: "defensive" | "offensive" | null =
        r.player_profile_locked === "defensive"
          ? "defensive"
          : r.player_profile_locked === "offensive"
            ? "offensive"
            : null;
      const roleWeights = parseRankingRoleWeights(r.ranking_role_weights);
      const positionBonus = roundRankingPoints(Number(r.ranking_position_bonus || 0));

      const pointBreakdown: RankingPointBreakdownItem[] = [];
      if (r.goals > 0) pointBreakdown.push({ label: "Gols", count: r.goals, points: r.goals * 4 });
      if (r.assists > 0) pointBreakdown.push({ label: "Assistências", count: r.assists, points: r.assists * 2.5 });
      if (r.wins > 0) pointBreakdown.push({ label: "Vitórias", count: r.wins, points: r.wins * 3 });
      if (r.draws > 0) pointBreakdown.push({ label: "Empates", count: r.draws, points: r.draws * 1 });
      if (r.losses > 0) pointBreakdown.push({ label: "Derrotas", count: r.losses, points: r.losses * -2.5 });
      if (positionBonus !== 0 && !legacy) {
        pointBreakdown.push({ label: "Bônus posicional", count: 1, points: positionBonus });
      }

      return {
        roundId: r.round_id,
        roundNumber: roundInfo?.number ?? 0,
        date: roundInfo?.date ?? "",
        points: roundRankingPoints(legacy ? r.points : Number(r.ranking_points ?? r.points)),
        legacyPoints: roundRankingPoints(r.points),
        positionBonus,
        roleWeights,
        goals: r.goals,
        assists: r.assists,
        teamGoalsConceded: r.team_goals_conceded,
        defensiveCleanGames: r.ranking_defensive_clean_games,
        defensiveOneGoalGames: r.ranking_defensive_one_goal_games,
        goalkeeperGames: r.goalkeeper_games,
        goalkeeperGoals: r.goalkeeper_goals,
        goalkeeperAssists: r.goalkeeper_assists,
        goalkeeperGoalsConceded: r.goals_conceded,
        goalkeeperCleanSheets: r.clean_sheets,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        games: r.games,
        pointBreakdown,
        countedInTop6,
        playerProfile,
        profileDecisionSource: r.profile_decision_source,
        profileAppearanceNumber: r.profile_appearance_number,
        profileDefOverall: r.profile_def_overall !== null && Number.isFinite(Number(r.profile_def_overall)) ? Number(r.profile_def_overall) : null,
        profileAtaOverall: r.profile_ata_overall !== null && Number.isFinite(Number(r.profile_ata_overall)) ? Number(r.profile_ata_overall) : null,
      };
    };

    const bestRounds = officialRows.map((row, index) => mapRound(row, index < maxBestRounds));
    const legacyBestRounds = legacyRows.map((row, index) => mapRound(row, index < maxBestRounds, true));

    const top6Points = roundRankingPoints(
      bestRounds.filter((r) => r.countedInTop6).reduce((sum, r) => sum + r.points, 0),
    );

    const minPointsToEnterTop6 = bestRounds.length >= maxBestRounds && bestRounds[maxBestRounds - 1]
      ? bestRounds[maxBestRounds - 1]!.points
      : null;
    const legacyMinPointsToEnterTop6 = legacyBestRounds.length >= maxBestRounds && legacyBestRounds[maxBestRounds - 1]
      ? legacyBestRounds[maxBestRounds - 1]!.points
      : null;
    const legacyPoints = roundRankingPoints(
      legacyBestRounds.filter((r) => r.countedInTop6).reduce((sum, r) => sum + r.points, 0),
    );
    const positionBonus = roundRankingPoints(
      bestRounds.filter((r) => r.countedInTop6).reduce((sum, r) => sum + r.positionBonus, 0),
    );

    const winRate = games === 0 ? 0 : Math.round(((wins * 3 + draws) / (games * 3)) * 100);

    entries.push({
      player: first.player,
      games,
      wins,
      draws,
      losses,
      goals,
      assists,
      goalkeeperStats: goalkeeperGames > 0 ? { games: goalkeeperGames, goalsConceded, cleanSheets } : null,
      points: top6Points,
      legacyPoints,
      positionBonus,
      totalRawPoints: roundRankingPoints(totalRawPoints),
      bestRounds,
      legacyBestRounds,
      minPointsToEnterTop6,
      legacyMinPointsToEnterTop6,
      winRate,
    });
  }

  return sortRankingEntries(entries);
}

export function rankingActivePlayerIds(
  recentRoundIds: string[],
  stats: Array<{ player_id: string; round_id: string; games: number }>,
): Set<string> {
  const recent = new Set(recentRoundIds);
  return new Set(stats.flatMap((row) => (recent.has(row.round_id) && Number(row.games || 0) > 0 ? [row.player_id] : [])));
}
