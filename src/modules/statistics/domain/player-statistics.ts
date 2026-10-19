export type StatisticsRoundType = "official" | "friendly";

export type PlayerSeasonTotalsRow = {
  player_id: string;
  rounds_count?: number | null;
  games?: number | null;
  goals?: number | null;
  assists?: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  points?: number | null;
  ranking_points?: number | null;
};

export type PlayerRoundPoints = {
  points?: number | null;
  ranking_points?: number | null;
  games?: number | null;
};

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Ranked has one canonical score: ranking_points. The legacy points column is
 * only a compatibility fallback for rounds created before the ranked score
 * was persisted. Friendlies keep their scout total because they are unranked.
 */
export function canonicalRoundPoints(row: PlayerRoundPoints, roundType: StatisticsRoundType) {
  return roundType === "official"
    ? numeric(row.ranking_points ?? row.points)
    : numeric(row.points);
}

export function canonicalSeasonPoints(
  rows: PlayerRoundPoints[],
  roundType: StatisticsRoundType,
  bestRoundsLimit = 6,
) {
  const values = rows
    .filter((row) => numeric(row.games) > 0)
    .map((row) => canonicalRoundPoints(row, roundType));

  if (roundType === "official") {
    values.sort((a, b) => b - a);
    return values.slice(0, bestRoundsLimit).reduce((total, value) => total + value, 0);
  }

  return values.reduce((total, value) => total + value, 0);
}

