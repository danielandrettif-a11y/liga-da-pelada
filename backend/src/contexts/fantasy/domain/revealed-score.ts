type Card = { slug?: string | null; status?: string | null; bonus?: unknown; fallbackBonus?: unknown; details?: Record<string, unknown> | null } | null;

function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export function revealedLineupScore(players: Array<{ points?: unknown }>, reserve: { pointsGain?: unknown } | null, card: Card) {
  const playerPoints = players.reduce((sum, player) => sum + number(player.points), 0) + number(reserve?.pointsGain);
  const details = card?.details || {};
  const isPending = ["RESERVED", "LOCKED"].includes((card?.status || "").toUpperCase());
  const isNonScoring = number(details.budgetRecovery) > 0 || card?.slug === "bargain"
    || number(details.discountAmount) > 0 || number(details.discountPercent) > 0
    || card?.slug === "extra_credit" || number(details.budgetBonus) > 0;
  const cardPoints = !card || isPending || isNonScoring ? 0 : Math.max(number(card.bonus), number(card.fallbackBonus));
  return { playerPoints, totalPoints: playerPoints + cardPoints };
}
