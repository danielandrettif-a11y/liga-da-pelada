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

const roundPoints = (value: number) => Math.round(Number(value || 0) * 100) / 100;

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
      roundPoints(Number(b.rankingPoints ?? b.points)) - roundPoints(Number(a.rankingPoints ?? a.points)));
    const points = roundPoints(ordered.slice(0, bestRoundsLimit)
      .reduce((total, row) => total + roundPoints(Number(row.rankingPoints ?? row.points)), 0));
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
