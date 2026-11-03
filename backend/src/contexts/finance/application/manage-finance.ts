import type { Actor } from "../../../shared/actor.js";
import {
  areRoundParticipantsPaid,
  normalizeExpenseItemIds,
  validateExpenseItem,
  validatePaidInstallments,
  validatePaymentRecipient,
  validateRoundPaymentDetails,
  type ExpenseItem,
  type ExpenseItemInput,
  type PaymentAuditLogEntry,
  type PaymentChargeLine,
  type PaymentObligation,
  type PaymentPlayer,
  type PaymentRecipient,
  type PaymentRecipientInput,
  type PaymentRound,
  type RoundExpenseSelection,
  type RoundPaymentDetailsInput,
} from "../domain/finance.js";

export interface FinanceRepository {
  checkCanAccess(actor: Actor, leagueId: string): Promise<boolean>;
  checkIsAdmin(actor: Actor, leagueId: string): Promise<boolean>;
  recipientIsActive(leagueId: string, recipientId: string): Promise<boolean>;
  getExpenseInstallmentState(leagueId: string, id: string): Promise<{ installmentCount: number; registeredCount: number } | null>;
  getRoundStatus(leagueId: string, roundId: string): Promise<string | null>;
  listActiveRoundExpenseItemIds(leagueId: string, roundId: string): Promise<string[]>;
  getExpenseItems(leagueId: string, includeArchived: boolean): Promise<ExpenseItem[]>;
  saveExpenseItem(leagueId: string, userId: string, input: ExpenseItemInput): Promise<{ success: boolean; error?: string }>;
  setExpenseItemStatus(leagueId: string, id: string, status: "active" | "archived", userId: string): Promise<{ success: boolean; error?: string }>;
  setExpenseItemPaidInstallments(leagueId: string, id: string, paidInstallments: number, userId: string): Promise<{ success: boolean; error?: string }>;
  getPaymentRecipients(leagueId: string, includeInactive: boolean): Promise<PaymentRecipient[]>;
  savePaymentRecipient(leagueId: string, userId: string, input: PaymentRecipientInput): Promise<{ success: boolean; error?: string }>;
  setPaymentRecipientActive(leagueId: string, id: string, active: boolean, userId: string): Promise<{ success: boolean; error?: string }>;
  getPaymentRounds(leagueId: string): Promise<PaymentRound[]>;
  getLatestFinishedRoundPaymentState(leagueId: string): Promise<{
    participants: Array<{ id: string; is_monthly_payer?: boolean }>;
    payments: Array<{ player_id: string; paid: boolean }>;
  } | null>;
  getRoundPaymentWorkspace(leagueId: string, roundId: string): Promise<any | null>;
  getRoundPaymentPlayers(leagueId: string, roundId: string): Promise<PaymentPlayer[]>;
  getRoundPaymentObligations(leagueId: string, roundId: string): Promise<PaymentObligation[]>;
  setPaymentObligationPaid(leagueId: string, id: string, amountPaid: number, userId: string): Promise<{ success: boolean; error?: string }>;
  setPlayerPayment(leagueId: string, roundId: string, playerId: string, paid: boolean, changedByUserId: string): Promise<{ success: boolean; error?: string }>;
  getRoundExpenseSelections(leagueId: string, roundId: string): Promise<RoundExpenseSelection[]>;
  syncRoundExpenseItems(leagueId: string, roundId: string, expenseItemIds: string[], userId: string): Promise<{ success: boolean; error?: string }>;
  updateRoundPaymentDetails(leagueId: string, input: RoundPaymentDetailsInput, userId: string): Promise<{
    success: boolean;
    error?: string;
    details?: {
      pix: string;
      total: number;
      extraTimeTotal: number;
      extraTimePlayerIds: string[];
      ballFundTotal: number;
      ballFundPlayerIds: string[];
    };
  }>;
  getRoundPaymentChargeLines(leagueId: string, roundId: string): Promise<PaymentChargeLine[]>;
  getPaymentAuditLog(leagueId: string): Promise<PaymentAuditLogEntry[]>;
}

export type ManageFinanceService = {
  getExpenseItems(actor: Actor, leagueId: string, includeArchived?: boolean): Promise<ExpenseItem[]>;
  saveExpenseItem(actor: Actor, leagueId: string, input: ExpenseItemInput): Promise<{ success: boolean; error?: string }>;
  setExpenseItemStatus(actor: Actor, leagueId: string, id: string, status: "active" | "archived"): Promise<{ success: boolean; error?: string }>;
  setExpenseItemPaidInstallments(actor: Actor, leagueId: string, id: string, paidInstallments: number): Promise<{ success: boolean; error?: string }>;
  getPaymentRecipients(actor: Actor, leagueId: string, includeInactive?: boolean): Promise<PaymentRecipient[]>;
  savePaymentRecipient(actor: Actor, leagueId: string, input: PaymentRecipientInput): Promise<{ success: boolean; error?: string }>;
  setPaymentRecipientActive(actor: Actor, leagueId: string, id: string, active: boolean): Promise<{ success: boolean; error?: string }>;
  getPaymentRounds(actor: Actor, leagueId: string): Promise<PaymentRound[]>;
  hasPendingPaymentRound(actor: Actor, leagueId: string): Promise<boolean>;
  getRoundPaymentWorkspace(actor: Actor, leagueId: string, roundId: string): Promise<any | null>;
  getRoundPaymentPlayers(actor: Actor, leagueId: string, roundId: string): Promise<PaymentPlayer[]>;
  getRoundPaymentObligations(actor: Actor, leagueId: string, roundId: string): Promise<PaymentObligation[]>;
  setPaymentObligationPaid(actor: Actor, leagueId: string, id: string, amountPaid: number): Promise<{ success: boolean; error?: string }>;
  setPlayerPayment(actor: Actor, leagueId: string, roundId: string, playerId: string, paid: boolean): Promise<{ success: boolean; error?: string }>;
  getRoundExpenseSelections(actor: Actor, leagueId: string, roundId: string): Promise<RoundExpenseSelection[]>;
  syncRoundExpenseItems(actor: Actor, leagueId: string, roundId: string, expenseItemIds: string[]): Promise<{ success: boolean; error?: string }>;
  updateRoundPaymentDetails(actor: Actor, leagueId: string, input: RoundPaymentDetailsInput): Promise<{
    success: boolean;
    error?: string;
    details?: {
      pix: string;
      total: number;
      extraTimeTotal: number;
      extraTimePlayerIds: string[];
      ballFundTotal: number;
      ballFundPlayerIds: string[];
    };
  }>;
  getRoundPaymentChargeLines(actor: Actor, leagueId: string, roundId: string): Promise<PaymentChargeLine[]>;
  getPaymentAuditLog(actor: Actor, leagueId: string): Promise<PaymentAuditLogEntry[]>;
};

export function createManageFinanceService(repository: FinanceRepository): ManageFinanceService {
  return {
    async getExpenseItems(actor, leagueId, includeArchived = false) {
      if (!await repository.checkCanAccess(actor, leagueId)) return [];
      return repository.getExpenseItems(leagueId, includeArchived);
    },

    async saveExpenseItem(actor, leagueId, input) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem cadastrar itens." };
      const validation = validateExpenseItem(input);
      if ("error" in validation) return { success: false, error: validation.error };
      if (!await repository.recipientIsActive(leagueId, validation.value.recipientId)) {
        return { success: false, error: "Escolha um PIX ativo desta pelada." };
      }
      return repository.saveExpenseItem(leagueId, actor.userId, {
        ...validation.value,
        description: validation.value.description ?? undefined,
      });
    },

    async setExpenseItemStatus(actor, leagueId, id, status) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Acesso negado." };
      if (!id) return { success: false, error: "Item não encontrado." };
      if (status !== "active" && status !== "archived") return { success: false, error: "Status inválido." };
      return repository.setExpenseItemStatus(leagueId, id, status, actor.userId);
    },

    async setExpenseItemPaidInstallments(actor, leagueId, id, paidInstallments) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem editar parcelas." };
      const validation = validatePaidInstallments(paidInstallments);
      if ("error" in validation) return { success: false, error: validation.error };
      const state = await repository.getExpenseInstallmentState(leagueId, id);
      if (!state) return { success: false, error: "Item não pertence a esta pelada." };
      if (validation.value + state.registeredCount > state.installmentCount) {
        return { success: false, error: "A quantidade informada ultrapassa o total ao considerar as parcelas já lançadas." };
      }
      return repository.setExpenseItemPaidInstallments(leagueId, id, validation.value, actor.userId);
    },

    async getPaymentRecipients(actor, leagueId, includeInactive = false) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return [];
      return repository.getPaymentRecipients(leagueId, includeInactive);
    },

    async savePaymentRecipient(actor, leagueId, input) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem gerenciar PIX." };
      const validation = validatePaymentRecipient(input);
      if ("error" in validation) return { success: false, error: validation.error };
      return repository.savePaymentRecipient(leagueId, actor.userId, validation.value);
    },

    async setPaymentRecipientActive(actor, leagueId, id, active) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem gerenciar PIX." };
      if (!id) return { success: false, error: "Destinatário não encontrado." };
      return repository.setPaymentRecipientActive(leagueId, id, active, actor.userId);
    },

    async getPaymentRounds(actor, leagueId) {
      if (!await repository.checkCanAccess(actor, leagueId)) return [];
      return repository.getPaymentRounds(leagueId);
    },

    async hasPendingPaymentRound(actor, leagueId) {
      if (!await repository.checkCanAccess(actor, leagueId)) return false;
      const state = await repository.getLatestFinishedRoundPaymentState(leagueId);
      if (!state) return false;
      return !areRoundParticipantsPaid(state.participants, state.payments);
    },

    async getRoundPaymentWorkspace(actor, leagueId, roundId) {
      if (!roundId) return null;
      if (!await repository.checkCanAccess(actor, leagueId)) return null;
      return repository.getRoundPaymentWorkspace(leagueId, roundId);
    },

    async getRoundPaymentPlayers(actor, leagueId, roundId) {
      if (!roundId) return [];
      if (!await repository.checkCanAccess(actor, leagueId)) return [];
      return repository.getRoundPaymentPlayers(leagueId, roundId);
    },

    async getRoundPaymentObligations(actor, leagueId, roundId) {
      if (!roundId) return [];
      if (!await repository.checkCanAccess(actor, leagueId)) return [];
      return repository.getRoundPaymentObligations(leagueId, roundId);
    },

    async setPaymentObligationPaid(actor, leagueId, id, amountPaid) {
      if (!id) return { success: false, error: "Obrigação não encontrada." };
      if (!Number.isFinite(amountPaid) || amountPaid < 0) {
        return { success: false, error: "Valor de pagamento inválido." };
      }
      if (!await repository.checkCanAccess(actor, leagueId)) return { success: false, error: "Acesso negado." };
      return repository.setPaymentObligationPaid(leagueId, id, amountPaid, actor.userId);
    },

    async setPlayerPayment(actor, leagueId, roundId, playerId, paid) {
      if (!roundId || !playerId) {
        return { success: false, error: "Dados incompletos para confirmar pagamento." };
      }
      if (!await repository.checkCanAccess(actor, leagueId)) return { success: false, error: "Acesso negado." };
      if (await repository.getRoundStatus(leagueId, roundId) !== "finished") {
        return { success: false, error: "Os pagamentos so podem ser marcados depois do fim da rodada." };
      }
      return repository.setPlayerPayment(leagueId, roundId, playerId, paid, actor.userId);
    },

    async getRoundExpenseSelections(actor, leagueId, roundId) {
      if (!roundId) return [];
      if (!await repository.checkCanAccess(actor, leagueId)) return [];
      return repository.getRoundExpenseSelections(leagueId, roundId);
    },

    async syncRoundExpenseItems(actor, leagueId, roundId, expenseItemIds) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem editar a cobrança." };
      if (await repository.getRoundStatus(leagueId, roundId) !== "finished") {
        return { success: false, error: "A cobrança só pode ser alterada em uma rodada finalizada." };
      }
      return repository.syncRoundExpenseItems(leagueId, roundId, normalizeExpenseItemIds(expenseItemIds), actor.userId);
    },

    async updateRoundPaymentDetails(actor, leagueId, input) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem editar os dados do PIX." };
      const validation = validateRoundPaymentDetails(input);
      if ("error" in validation) return { success: false, error: validation.error };
      if (!await repository.getRoundStatus(leagueId, validation.value.roundId)) {
        return { success: false, error: "Rodada fora da pelada selecionada." };
      }
      const update = await repository.updateRoundPaymentDetails(leagueId, {
        roundId: validation.value.roundId,
        paymentPix: validation.value.pix,
        paymentTotal: validation.value.total,
        extraTimeTotal: validation.value.extraTimeTotal,
        extraTimePlayerIds: validation.value.extraTimePlayerIds,
        ballFundTotal: validation.value.ballFundTotal,
        ballFundPlayerIds: validation.value.ballFundPlayerIds,
      }, actor.userId);
      if (!update.success) return update;
      const expenseItemIds = await repository.listActiveRoundExpenseItemIds(leagueId, validation.value.roundId);
      const refresh = await repository.syncRoundExpenseItems(
        leagueId, validation.value.roundId, expenseItemIds, actor.userId,
      );
      if (!refresh.success) {
        return { success: false, error: `Os dados principais foram salvos, mas o rateio não foi atualizado: ${refresh.error}` };
      }
      return update;
    },

    async getRoundPaymentChargeLines(actor, leagueId, roundId) {
      if (!roundId) return [];
      if (!await repository.checkCanAccess(actor, leagueId)) return [];
      return repository.getRoundPaymentChargeLines(leagueId, roundId);
    },

    async getPaymentAuditLog(actor, leagueId) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return [];
      return repository.getPaymentAuditLog(leagueId);
    },
  };
}
