type ProjectedPlayerScore = { totalPoints?: number | string | null };
type StoredPlayerScore = { total_points?: number | string | null };

type ProjectedLineupPlayerScore = ProjectedPlayerScore & {
  playerId: string;
};

type StoredLineupPlayerScore = StoredPlayerScore & {
  player_id: string;
  slot_role?: string | null;
};

function sumScores(values: Array<number | string | null | undefined>) {
  return values.reduce<number>((total, value) => total + Number(value || 0), 0);
}

/**
 * Na rodada finalizada, a apuração persistida do goleiro é a fonte oficial.
 * Ela já considera as partidas disputadas no gol e é reconciliada pelas
 * migrations de fechamento. Os jogadores de linha continuam refletindo a
 * reconstrução atual dos scouts.
 */
export function resolveFantasyFinishedPlayerScores({
  projectedPlayers,
  storedPlayers,
}: {
  projectedPlayers?: ProjectedLineupPlayerScore[] | null;
  storedPlayers?: StoredLineupPlayerScore[] | null;
}) {
  const projectedByPlayerId = new Map(
    (projectedPlayers || []).map((player) => [
      player.playerId,
      Number(player.totalPoints || 0),
    ]),
  );

  if (storedPlayers?.length) {
    return storedPlayers.map((player) => ({
      playerId: player.player_id,
      points: player.slot_role === "GOL"
        ? Number(player.total_points || 0)
        : (projectedByPlayerId.get(player.player_id) ?? Number(player.total_points || 0)),
    }));
  }

  return (projectedPlayers || []).map((player) => ({
    playerId: player.playerId,
    points: Number(player.totalPoints || 0),
  }));
}

/**
 * A pontuação da escalação exibida no campo é a soma final de cada atleta.
 * O total individual já contém bônus de posição e, no capitão, o adicional
 * da faixa. Cartas e palpites pertencem à escalação e ficam fora desta soma.
 */
export function resolveFantasyLineupPlayerTotal({
  projectedPlayers,
  storedPlayers,
  storedPlayerPoints,
  storedTotalPoints,
}: {
  projectedPlayers?: ProjectedPlayerScore[] | null;
  storedPlayers?: StoredPlayerScore[] | null;
  storedPlayerPoints?: number | string | null;
  storedTotalPoints?: number | string | null;
}) {
  if (projectedPlayers?.length) {
    return sumScores(projectedPlayers.map((player) => player.totalPoints));
  }
  if (storedPlayers?.length) {
    return sumScores(storedPlayers.map((player) => player.total_points));
  }
  return Number(storedPlayerPoints ?? storedTotalPoints ?? 0);
}

/** O número principal do boletim soma o campo e o bônus final da carta. */
export function resolveFantasyBulletinTotal({
  playerPoints,
  cardPoints,
}: {
  playerPoints?: number | string | null;
  cardPoints?: number | string | null;
}) {
  return Number(playerPoints || 0) + Number(cardPoints || 0);
}

export function shouldUseFantasyRoundProjection({
  projectionRoundId,
  targetRoundId,
}: {
  projectionRoundId?: string | null;
  targetRoundId?: string | null;
}) {
  return Boolean(
    projectionRoundId
    && targetRoundId
    && targetRoundId === projectionRoundId,
  );
}
