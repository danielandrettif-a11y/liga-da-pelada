type ProjectedPlayerScore = { totalPoints?: number | string | null };
type StoredPlayerScore = { total_points?: number | string | null };

function sumScores(values: Array<number | string | null | undefined>) {
  return values.reduce<number>((total, value) => total + Number(value || 0), 0);
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
