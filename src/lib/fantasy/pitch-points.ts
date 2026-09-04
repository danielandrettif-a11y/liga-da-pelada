type FantasyPitchPointsInput = {
  status: string;
  marketRoundPoints: number;
  lastRoundLineupPoints?: number;
  liveLineupPoints?: number;
  isCaptain: boolean;
  captainMultiplier: number;
};

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Resolve a pontuação mostrada no campo do Cartola.
 *
 * Fora de uma rodada ao vivo, a apuração persistida na escalação é a fonte
 * correta porque ela já contém bônus de posição e de capitão. Durante a
 * rodada, a projeção ao vivo continua tendo prioridade.
 */
export function resolveFantasyPitchPoints({
  status,
  marketRoundPoints,
  lastRoundLineupPoints,
  liveLineupPoints,
  isCaptain,
  captainMultiplier,
}: FantasyPitchPointsInput) {
  if (status === "in_progress") {
    if (isFiniteNumber(liveLineupPoints)) return liveLineupPoints;
    return marketRoundPoints * (isCaptain ? captainMultiplier : 1);
  }

  if (isFiniteNumber(lastRoundLineupPoints)) return lastRoundLineupPoints;
  return marketRoundPoints;
}
