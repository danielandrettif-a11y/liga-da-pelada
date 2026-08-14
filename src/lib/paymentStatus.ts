export function isPaymentChecklistComplete(payments: Array<{ paid: boolean }>) {
  return payments.length > 0 && payments.every((payment) => payment.paid);
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
