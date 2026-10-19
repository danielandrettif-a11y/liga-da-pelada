import {
  normalizeExpenseItemIds,
  validateExpenseItem,
  validatePaidInstallments,
  validatePaymentRecipient,
  validateRoundPaymentDetails,
  type ExpenseItemInput,
  type NormalizedRoundPaymentDetails,
  type PaymentRecipientInput,
  type RoundPaymentDetailsInput,
} from "../domain/payment";

export type PaymentCommandGateway = {
  recipientIsActive(recipientId: string, leagueId: string): Promise<boolean>;
  createExpenseItem(input: {
    leagueId: string; userId: string; name: string; description: string | null;
    totalAmount: number; installmentCount: number; recipientId: string;
  }): Promise<string | null>;
  setExpenseItemStatus(id: string, leagueId: string, status: "active" | "archived"): Promise<string | null>;
  getExpenseInstallmentState(id: string, leagueId: string): Promise<{ installmentCount: number; registeredCount: number } | null>;
  setPaidInstallmentsBeforeApp(id: string, leagueId: string, value: number): Promise<string | null>;
  getRoundStatus(roundId: string, leagueId: string): Promise<string | null>;
  syncRoundPlan(roundId: string, expenseItemIds: string[]): Promise<string | null>;
  setObligationPaid(id: string, amountPaid: number): Promise<string | null>;
  saveRecipient(input: {
    id?: string; leagueId: string; userId: string; name: string; pixKey: string;
    pixType: string | null; active: boolean;
  }): Promise<string | null>;
  setRecipientActive(id: string, leagueId: string, active: boolean): Promise<string | null>;
  participantExists(roundId: string, playerId: string): Promise<boolean>;
  upsertPlayerPayment(roundId: string, playerId: string, paid: boolean): Promise<string | null>;
  pruneCollectiveHistory(roundId: string): Promise<void>;
  updateRoundPaymentDetails(input: NormalizedRoundPaymentDetails): Promise<{ found: boolean; error: string | null }>;
  listActiveRoundExpenseItemIds(roundId: string): Promise<string[]>;
};

export async function createExpenseItemForLeague(
  input: ExpenseItemInput,
  context: { leagueId: string; userId: string },
  gateway: PaymentCommandGateway,
) {
  const parsed = validateExpenseItem(input);
  if ("error" in parsed) return { success: false as const, error: parsed.error };
  if (!await gateway.recipientIsActive(parsed.value.recipientId, context.leagueId)) {
    return { success: false as const, error: "Escolha um PIX ativo desta pelada." };
  }
  const error = await gateway.createExpenseItem({ ...parsed.value, ...context });
  return error ? { success: false as const, error } : { success: true as const, error: undefined };
}

export async function changeExpenseItemStatus(
  id: string,
  status: "active" | "archived",
  leagueId: string,
  gateway: PaymentCommandGateway,
) {
  if (!id) return { success: false as const, error: "Item não encontrado." };
  const error = await gateway.setExpenseItemStatus(id, leagueId, status);
  return error ? { success: false as const, error } : { success: true as const, error: undefined };
}

export async function changePaidInstallments(
  id: string,
  paidInstallments: number,
  leagueId: string,
  gateway: PaymentCommandGateway,
) {
  const parsed = validatePaidInstallments(paidInstallments);
  if ("error" in parsed) return { success: false as const, error: parsed.error };
  const state = await gateway.getExpenseInstallmentState(id, leagueId);
  if (!state) return { success: false as const, error: "Item não pertence a esta pelada." };
  if (parsed.value + state.registeredCount > state.installmentCount) {
    return { success: false as const, error: "A quantidade informada ultrapassa o total ao considerar as parcelas já lançadas." };
  }
  const error = await gateway.setPaidInstallmentsBeforeApp(id, leagueId, parsed.value);
  return error ? { success: false as const, error } : { success: true as const, error: undefined };
}

export async function syncExpenseItemsForRound(
  roundId: string,
  expenseItemIds: string[],
  leagueId: string,
  gateway: PaymentCommandGateway,
) {
  if (await gateway.getRoundStatus(roundId, leagueId) !== "finished") {
    return { success: false as const, error: "A cobrança só pode ser alterada em uma rodada finalizada." };
  }
  const error = await gateway.syncRoundPlan(roundId, normalizeExpenseItemIds(expenseItemIds));
  return error ? { success: false as const, error } : { success: true as const, error: undefined };
}

export async function markObligationPaid(id: string, amountPaid: number, gateway: PaymentCommandGateway) {
  const amount = Number(amountPaid);
  if (!id || !Number.isFinite(amount) || amount < 0) return { success: false as const, error: "Informe um valor pago válido." };
  const error = await gateway.setObligationPaid(id, amount);
  return error ? { success: false as const, error } : { success: true as const, error: undefined };
}

export async function saveRecipientForLeague(
  input: PaymentRecipientInput,
  context: { leagueId: string; userId: string },
  gateway: PaymentCommandGateway,
) {
  const parsed = validatePaymentRecipient(input);
  if ("error" in parsed) return { success: false as const, error: parsed.error };
  const error = await gateway.saveRecipient({ ...parsed.value, ...context });
  return error ? { success: false as const, error } : { success: true as const, error: undefined };
}

export async function changeRecipientActive(
  id: string,
  active: boolean,
  leagueId: string,
  gateway: PaymentCommandGateway,
) {
  const error = await gateway.setRecipientActive(id, leagueId, active);
  return error ? { success: false as const, error } : { success: true as const, error: undefined };
}

export async function markPlayerPayment(
  input: { roundId: string; playerId: string; paid: boolean },
  leagueId: string,
  gateway: PaymentCommandGateway,
) {
  if (await gateway.getRoundStatus(input.roundId, leagueId) !== "finished") {
    return { success: false as const, error: "Os pagamentos so podem ser marcados depois do fim da rodada." };
  }
  if (!await gateway.participantExists(input.roundId, input.playerId)) {
    return { success: false as const, error: "Este jogador nao participou da rodada." };
  }
  const error = await gateway.upsertPlayerPayment(input.roundId, input.playerId, input.paid);
  if (error) return { success: false as const, error };
  if (input.paid) await gateway.pruneCollectiveHistory(input.roundId);
  return { success: true as const };
}

export async function updatePaymentDetailsForRound(
  input: RoundPaymentDetailsInput,
  leagueId: string,
  gateway: PaymentCommandGateway,
) {
  const parsed = validateRoundPaymentDetails(input);
  if ("error" in parsed) return { success: false as const, error: parsed.error };
  if (!await gateway.getRoundStatus(input.roundId, leagueId)) {
    return { success: false as const, error: "Rodada fora da pelada selecionada." };
  }
  const update = await gateway.updateRoundPaymentDetails(parsed.value);
  if (update.error) return { success: false as const, error: update.error };
  if (!update.found) return { success: false as const, error: "Rodada finalizada nao encontrada." };
  const expenseItemIds = await gateway.listActiveRoundExpenseItemIds(input.roundId);
  const refreshError = await gateway.syncRoundPlan(input.roundId, expenseItemIds);
  if (refreshError) {
    return { success: false as const, error: `Os dados principais foram salvos, mas o rateio não foi atualizado: ${refreshError}` };
  }
  return {
    success: true as const,
    details: {
      pix: parsed.value.pix,
      total: Math.round(parsed.value.total * 100) / 100,
      extraTimeTotal: Math.round(parsed.value.extraTimeTotal * 100) / 100,
      extraTimePlayerIds: parsed.value.extraTimePlayerIds,
      ballFundTotal: Math.round(parsed.value.ballFundTotal * 100) / 100,
      ballFundPlayerIds: parsed.value.ballFundPlayerIds,
    },
  };
}
