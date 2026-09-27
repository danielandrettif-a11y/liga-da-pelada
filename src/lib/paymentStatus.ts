export function isPaymentChecklistComplete(payments: Array<{ paid: boolean }>) {
  return payments.length > 0 && payments.every((payment) => payment.paid);
}

export function areRoundParticipantsPaid(
  participants: Array<{ player_id: string }>,
  payments: Array<{ player_id: string; paid: boolean }>,
) {
  const paidPlayers = new Set(payments.filter((payment) => payment.paid).map((payment) => payment.player_id));
  return participants.length > 0 && participants.every((participant) => paidPlayers.has(participant.player_id));
}

type ReleasablePaymentRound = {
  status: string;
  payment_pix: string | null;
  payment_total: number | null;
};

export function findLatestReleasedPaymentRound<T extends ReleasablePaymentRound>(rounds: T[]): T | null {
  return rounds.find((round) => (
    round.status === "finished"
    && Boolean(round.payment_pix?.trim())
    && Number(round.payment_total) > 0
  )) || null;
}

export function calculateRoundPaymentAmounts({
  playerIds,
  baseTotal,
  extraTimeTotal = 0,
  extraTimePlayerIds = [],
  ballFundTotal = 0,
  ballFundPlayerIds = [],
}: {
  playerIds: string[];
  baseTotal: number;
  extraTimeTotal?: number;
  extraTimePlayerIds?: string[];
  ballFundTotal?: number;
  ballFundPlayerIds?: string[];
}) {
  const ids = [...new Set(playerIds)];
  const validIds = new Set(ids);
  const centsByPlayer = Object.fromEntries(ids.map((id) => [id, 0])) as Record<string, number>;

  function distribute(total: number, selectedIds: string[]) {
    const selected = [...new Set(selectedIds)].filter((id) => validIds.has(id));
    const cents = Math.max(0, Math.round(Number(total || 0) * 100));
    if (!selected.length || !cents) return;
    const base = Math.floor(cents / selected.length);
    const remainder = cents % selected.length;
    selected.forEach((id, index) => { centsByPlayer[id] += base + (index < remainder ? 1 : 0); });
  }

  distribute(baseTotal, ids);
  distribute(extraTimeTotal, extraTimePlayerIds);
  distribute(ballFundTotal, ballFundPlayerIds);

  return {
    amountByPlayer: Object.fromEntries(ids.map((id) => [id, centsByPlayer[id] / 100])) as Record<string, number>,
    grandTotal: Object.values(centsByPlayer).reduce((sum, cents) => sum + cents, 0) / 100,
  };
}
