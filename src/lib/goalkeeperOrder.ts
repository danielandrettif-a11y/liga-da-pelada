export type GoalkeeperOrderEntry = {
  playerId: string;
  order: number;
};

/**
 * Sorteia uma ordem persistente de rodizio no gol para um unico time.
 * O retorno e separado da lista original para nao alterar a escalacao em tela.
 */
export function drawGoalkeeperOrder(
  playerIds: string[],
  random: () => number = Math.random,
): GoalkeeperOrderEntry[] {
  const shuffled = [...playerIds];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const rawRandom = random();
    const safeRandom = Number.isFinite(rawRandom)
      ? Math.min(Math.max(rawRandom, 0), 0.9999999999999999)
      : 0;
    const target = Math.floor(safeRandom * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return shuffled.map((playerId, index) => ({
    playerId,
    order: index + 1,
  }));
}
