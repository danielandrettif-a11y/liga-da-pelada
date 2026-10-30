import type { Actor } from "../../../shared/actor.js";
import {
  areRoundParticipantsPaid,
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
  checkIsAdmin(actor: Actor, leagueId: string): Promise<boolean>;
  getExpenseItems(leagueId: string, includeArchived: boolean): Promise<ExpenseItem[]>;
  saveExpenseItem(leagueId: string, userId: string, input: ExpenseItemInput): Promise<{ success: boolean; error?: string }>;
  setExpenseItemStatus(leagueId: string, id: string, status: "active" | "archived"): Promise<{ success: boolean; error?: string }>;
  setExpenseItemPaidInstallments(leagueId: string, id: string, paidInstallments: number): Promise<{ success: boolean; error?: string }>;
  getPaymentRecipients(leagueId: string, includeInactive: boolean): Promise<PaymentRecipient[]>;
  savePaymentRecipient(leagueId: string, userId: string, input: PaymentRecipientInput): Promise<{ success: boolean; error?: string }>;
  setPaymentRecipientActive(leagueId: string, id: string, active: boolean): Promise<{ success: boolean; error?: string }>;
  getPaymentRounds(leagueId: string): Promise<PaymentRound[]>;
  getLatestFinishedRoundPaymentState(leagueId: string): Promise<{
    participants: Array<{ id: string; is_monthly_payer?: boolean }>;
    payments: Array<{ player_id: string; paid: boolean }>;
  } | null>;
  getRoundPaymentWorkspace(roundId: string): Promise<any | null>;
  getRoundPaymentPlayers(leagueId: string, roundId: string): Promise<PaymentPlayer[]>;
  getRoundPaymentObligations(leagueId: string, roundId: string): Promise<PaymentObligation[]>;
  setPaymentObligationPaid(id: string, amountPaid: number): Promise<{ success: boolean; error?: string }>;
  setPlayerPayment(leagueId: string, roundId: string, playerId: string, paid: boolean, changedByUserId: string): Promise<{ success: boolean; error?: string }>;
  getRoundExpenseSelections(leagueId: string, roundId: string): Promise<RoundExpenseSelection[]>;
  syncRoundExpenseItems(leagueId: string, roundId: string, expenseItemIds: string[]): Promise<{ success: boolean; error?: string }>;
  updateRoundPaymentDetails(leagueId: string, input: RoundPaymentDetailsInput): Promise<{
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
      return repository.getExpenseItems(leagueId, includeArchived);
    },

    async saveExpenseItem(actor, leagueId, input) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem cadastrar itens." };
      const validation = validateExpenseItem(input);
      if ("error" in validation) return { success: false, error: validation.error };
      return repository.saveExpenseItem(leagueId, actor.userId, input);
    },

    async setExpenseItemStatus(actor, leagueId, id, status) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Acesso negado." };
      if (!id) return { success: false, error: "Item não encontrado." };
      return repository.setExpenseItemStatus(leagueId, id, status);
    },

    async setExpenseItemPaidInstallments(actor, leagueId, id, paidInstallments) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem editar parcelas." };
      const validation = validatePaidInstallments(paidInstallments);
      if ("error" in validation) return { success: false, error: validation.error };
      return repository.setExpenseItemPaidInstallments(leagueId, id, paidInstallments);
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
      return repository.savePaymentRecipient(leagueId, actor.userId, input);
    },

    async setPaymentRecipientActive(actor, leagueId, id, active) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem gerenciar PIX." };
      if (!id) return { success: false, error: "Destinatário não encontrado." };
      return repository.setPaymentRecipientActive(leagueId, id, active);
    },

    async getPaymentRounds(actor, leagueId) {
      return repository.getPaymentRounds(leagueId);
    },

    async hasPendingPaymentRound(actor, leagueId) {
      const state = await repository.getLatestFinishedRoundPaymentState(leagueId);
      if (!state) return false;
      return !areRoundParticipantsPaid(state.participants, state.payments);
    },

    async getRoundPaymentWorkspace(actor, leagueId, roundId) {
      if (!roundId) return null;
      return repository.getRoundPaymentWorkspace(roundId);
    },

    async getRoundPaymentPlayers(actor, leagueId, roundId) {
      if (!roundId) return [];
      return repository.getRoundPaymentPlayers(leagueId, roundId);
    },

    async getRoundPaymentObligations(actor, leagueId, roundId) {
      if (!roundId) return [];
      return repository.getRoundPaymentObligations(leagueId, roundId);
    },

    async setPaymentObligationPaid(actor, leagueId, id, amountPaid) {
      if (!id) return { success: false, error: "Obrigação não encontrada." };
      if (!Number.isFinite(amountPaid) || amountPaid < 0) {
        return { success: false, error: "Valor de pagamento inválido." };
      }
      return repository.setPaymentObligationPaid(id, amountPaid);
    },

    async setPlayerPayment(actor, leagueId, roundId, playerId, paid) {
      if (!roundId || !playerId) {
        return { success: false, error: "Dados incompletos para confirmar pagamento." };
      }
      return repository.setPlayerPayment(leagueId, roundId, playerId, paid, actor.userId);
    },

    async getRoundExpenseSelections(actor, leagueId, roundId) {
      if (!roundId) return [];
      return repository.getRoundExpenseSelections(leagueId, roundId);
    },

    async syncRoundExpenseItems(actor, leagueId, roundId, expenseItemIds) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem editar a cobrança." };
      return repository.syncRoundExpenseItems(leagueId, roundId, expenseItemIds || []);
    },

    async updateRoundPaymentDetails(actor, leagueId, input) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return { success: false, error: "Somente administradores podem editar os dados do PIX." };
      const validation = validateRoundPaymentDetails(input);
      if ("error" in validation) return { success: false, error: validation.error };
      return repository.updateRoundPaymentDetails(leagueId, input);
    },

    async getRoundPaymentChargeLines(actor, leagueId, roundId) {
      if (!roundId) return [];
      return repository.getRoundPaymentChargeLines(leagueId, roundId);
    },

    async getPaymentAuditLog(actor, leagueId) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return [];
      return repository.getPaymentAuditLog(leagueId);
    },
  };
}
