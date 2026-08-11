export function isPaymentChecklistComplete(payments: Array<{ paid: boolean }>) {
  return payments.length > 0 && payments.every((payment) => payment.paid);
}
