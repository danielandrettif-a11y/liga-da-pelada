import {
  canonicalRoundPoints,
  type PlayerSeasonTotalsRow,
  type StatisticsRoundType,
} from "../domain/player-statistics";

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildPlayerSeasonStatistics<TPlayer extends { id: string }>(
  players: TPlayer[],
  rows: PlayerSeasonTotalsRow[],
  roundType: StatisticsRoundType,
) {
  const totalsByPlayer = new Map(rows.map((row) => [row.player_id, row]));

  return players.map((player) => {
    const row = totalsByPlayer.get(player.id);
    return {
      ...player,
      rounds: numeric(row?.rounds_count),
      games: numeric(row?.games),
      goals: numeric(row?.goals),
      assists: numeric(row?.assists),
      wins: numeric(row?.wins),
      draws: numeric(row?.draws),
      losses: numeric(row?.losses),
      points: canonicalRoundPoints(row || {}, roundType),
      legacyPoints: numeric(row?.points),
    };
  });
}
