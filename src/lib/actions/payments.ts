"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient, getCurrentAccount } from "../auth";
import { areRoundParticipantsPaid } from "../paymentStatus";
import { createClient as createServerClient } from "../supabase/server";
import { getActiveSeason } from "./seasons";
import { getActiveLeague } from "./rounds";
import { getFinanceApiSession } from "@/modules/finance/infrastructure/finance-api-session";
import {
  changeExpenseItemStatus,
  changePaidInstallments,
  changeRecipientActive,
  createExpenseItemForLeague,
  markObligationPaid,
  markPlayerPayment,
  saveRecipientForLeague,
  syncExpenseItemsForRound,
  updatePaymentDetailsForRound,
} from "@/modules/payments/application/payment-commands";
import { supabasePaymentCommandGateway } from "@/modules/payments/infrastructure/supabase-payment-command-gateway";
import {
  readExpenseItems,
  readLatestFinishedRoundPaymentState,
  readPaymentAuditLog,
  readPaymentRecipients,
  readPaymentRounds,
  readRoundPaymentWorkspace,
  readRoundExpenseSelections,
  readRoundPaymentChargeLines,
  readRoundPaymentObligations,
  readRoundPaymentPlayers,
} from "@/modules/payments/infrastructure/supabase-payment-reader";
import type {
  ExpenseItem,
  ExpenseItemInput,
  PaymentAuditLogEntry,
  PaymentChargeLine,
  PaymentObligation,
  PaymentPlayer,
  PaymentRecipient,
  PaymentRecipientInput,
  PaymentRound,
  RoundExpenseSelection,
  RoundPaymentDetailsInput,
} from "@/modules/payments/domain/payment";

export type {
  ExpenseItem,
  PaymentAuditLogEntry,
  PaymentChargeLine,
  PaymentObligation,
  PaymentPlayer,
  PaymentRecipient,
  PaymentRound,
  RoundExpenseSelection,
} from "@/modules/payments/domain/payment";

function revalidateExpenseManagement() {
  revalidatePath("/mais/caixinha");
  revalidatePath("/rodadas/[id]", "page");
}

function revalidatePaymentManagement(roundId?: string) {
  revalidatePath("/pagamentos");
  revalidatePath("/admin/transfermarket");
  if (roundId) revalidatePath(`/rodadas/${roundId}`);
}

function revalidateFullPaymentFlow() {
  revalidatePath("/pagamentos");
  revalidatePath("/coletiva");
  revalidatePath("/admin/transfermarket");
  revalidatePath("/", "layout");
}

export async function getExpenseItems(includeArchived = false): Promise<ExpenseItem[]> {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.getExpenseItems(league.id, includeArchived);
  }
  const account = await getCurrentAccount();
  if (!account.user) return [];
  const league = await getActiveLeague();
  return readExpenseItems(account.client, league.id, includeArchived);
}

export async function saveExpenseItem(input: ExpenseItemInput) {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    const result = await session.gateway.saveExpenseItem(league.id, input);
    if (result.success) revalidateExpenseManagement();
    return result;
  }
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Somente administradores podem cadastrar itens." };
  const [league, account] = await Promise.all([getActiveLeague(), getCurrentAccount()]);
  if (!account.user) return { success: false as const, error: "Entre novamente." };
  const result = await createExpenseItemForLeague(input, { leagueId: league.id, userId: account.user.id }, supabasePaymentCommandGateway(client));
  if (result.success) revalidateExpenseManagement();
  return result;
}

export async function setExpenseItemStatus(id: string, status: "active" | "archived") {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    const result = await session.gateway.setExpenseItemStatus(league.id, id, status);
    if (result.success) revalidateExpenseManagement();
    return result;
  }
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Acesso negado." };
  const league = await getActiveLeague();
  const result = await changeExpenseItemStatus(id, status, league.id, supabasePaymentCommandGateway(client));
  if (result.success) revalidateExpenseManagement();
  return result;
}

export async function setExpenseItemPaidInstallments(id: string, paidInstallments: number) {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    const result = await session.gateway.setExpenseItemPaidInstallments(league.id, id, paidInstallments);
    if (result.success) {
      revalidatePath("/mais/caixinha");
      revalidatePaymentManagement();
    }
    return result;
  }
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Somente administradores podem editar parcelas." };
  const league = await getActiveLeague();
  const result = await changePaidInstallments(id, paidInstallments, league.id, supabasePaymentCommandGateway(client));
  if (result.success) {
    revalidatePath("/mais/caixinha");
    revalidatePaymentManagement();
  }
  return result;
}

export async function getRoundExpenseSelections(roundId: string): Promise<RoundExpenseSelection[]> {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.getRoundExpenseSelections(league.id, roundId);
  }
  const account = await getCurrentAccount();
  if (!account.user) return [];
  const league = await getActiveLeague();
  return readRoundExpenseSelections(account.client, league.id, roundId);
}

export async function getRoundPaymentChargeLines(roundId: string): Promise<PaymentChargeLine[]> {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.getRoundPaymentChargeLines(league.id, roundId);
  }
  const account = await getCurrentAccount();
  if (!account.user) return [];
  const league = await getActiveLeague();
  return readRoundPaymentChargeLines(account.client, league.id, roundId);
}

export async function syncRoundExpenseItems(roundId: string, expenseItemIds: string[]) {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    const result = await session.gateway.syncRoundExpenseItems(league.id, roundId, expenseItemIds);
    if (result.success) revalidatePaymentManagement(roundId);
    return result;
  }
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Somente administradores podem editar a cobrança." };
  const league = await getActiveLeague();
  const result = await syncExpenseItemsForRound(roundId, expenseItemIds, league.id, supabasePaymentCommandGateway(client));
  if (result.success) revalidatePaymentManagement(roundId);
  return result;
}

export async function getRoundPaymentObligations(roundId: string): Promise<PaymentObligation[]> {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.getRoundPaymentObligations(league.id, roundId);
  }
  const account = await getCurrentAccount();
  if (!account.user) return [];
  const league = await getActiveLeague();
  return readRoundPaymentObligations(account.client, league.id, roundId);
}

export async function setPaymentObligationPaid(id: string, amountPaid: number) {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    const result = await session.gateway.setPaymentObligationPaid(league.id, id, amountPaid);
    if (result.success) revalidatePaymentManagement();
    return result;
  }
  const account = await getCurrentAccount();
  if (!account.user) return { success: false as const, error: "Entre novamente." };
  const result = await markObligationPaid(id, amountPaid, supabasePaymentCommandGateway(account.client));
  if (result.success) revalidatePaymentManagement();
  return result;
}

export async function getPaymentRecipients(includeInactive = false): Promise<PaymentRecipient[]> {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.getPaymentRecipients(league.id, includeInactive);
  }
  const client = await getAdminClient();
  if (!client) return [];
  const league = await getActiveLeague();
  return readPaymentRecipients(client, league.id, includeInactive);
}

export async function savePaymentRecipient(input: PaymentRecipientInput) {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    const result = await session.gateway.savePaymentRecipient(league.id, input);
    if (result.success) revalidatePath("/mais/pix");
    return result;
  }
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Somente administradores podem gerenciar PIX." };
  const [league, account] = await Promise.all([getActiveLeague(), getCurrentAccount()]);
  if (!account.user) return { success: false as const, error: "Entre novamente." };
  const result = await saveRecipientForLeague(input, { leagueId: league.id, userId: account.user.id }, supabasePaymentCommandGateway(client));
  if (result.success) revalidatePath("/mais/pix");
  return result;
}

export async function setPaymentRecipientActive(id: string, active: boolean) {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    const result = await session.gateway.setPaymentRecipientActive(league.id, id, active);
    if (result.success) revalidatePath("/mais/pix");
    return result;
  }
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Somente administradores podem gerenciar PIX." };
  const league = await getActiveLeague();
  const result = await changeRecipientActive(id, active, league.id, supabasePaymentCommandGateway(client));
  if (result.success) revalidatePath("/mais/pix");
  return result;
}

export async function getPaymentRounds(): Promise<PaymentRound[]> {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.getPaymentRounds(league.id);
  }
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return [];
  return readPaymentRounds(await createServerClient(), season.id);
}

export async function hasPendingPaymentRound(): Promise<boolean> {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.hasPendingPaymentRound(league.id);
  }
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return false;
  const state = await readLatestFinishedRoundPaymentState(await createServerClient(), season.id);
  if (!state) return false;
  if (state.error) {
    console.error("Erro ao verificar pagamentos pendentes:", state.error);
    return false;
  }
  return !areRoundParticipantsPaid(state.participants, state.payments);
}

export async function getRoundPaymentPlayers(roundId: string): Promise<PaymentPlayer[]> {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.getRoundPaymentPlayers(league.id, roundId);
  }
  const league = await getActiveLeague();
  return readRoundPaymentPlayers(await createServerClient(), league.id, roundId);
}

export async function getRoundPaymentWorkspace(roundId: string) {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.getRoundPaymentWorkspace(league.id, roundId);
  }
  const account = await getCurrentAccount();
  if (!account.user) return null;
  return readRoundPaymentWorkspace(account.client, roundId);
}

export async function getPaymentAuditLog(): Promise<PaymentAuditLogEntry[]> {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    return session.gateway.getPaymentAuditLog(league.id);
  }
  const client = await getAdminClient();
  if (!client) return [];
  const league = await getActiveLeague();
  return readPaymentAuditLog(client, league.id);
}

export async function setPlayerPayment(roundId: string, playerId: string, paid: boolean) {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    const result = await session.gateway.setPlayerPayment(league.id, roundId, playerId, paid);
    if (result.success) revalidateFullPaymentFlow();
    return result;
  }
  const account = await getCurrentAccount();
  if (!account.user) return { success: false as const, error: "Entre na sua conta para confirmar pagamentos." };
  const league = await getActiveLeague();
  const result = await markPlayerPayment({ roundId, playerId, paid }, league.id, supabasePaymentCommandGateway(account.client));
  if (result.success) revalidateFullPaymentFlow();
  return result;
}

export async function updateRoundPaymentDetails(input: RoundPaymentDetailsInput) {
  const session = await getFinanceApiSession();
  if (session) {
    const league = await getActiveLeague();
    const result = await session.gateway.updateRoundPaymentDetails(league.id, input);
    if (result.success) revalidateFullPaymentFlow();
    return result;
  }
  const client = await getAdminClient();
  if (!client) return { success: false as const, error: "Somente administradores podem editar os dados do PIX." };
  const league = await getActiveLeague();
  const result = await updatePaymentDetailsForRound(input, league.id, supabasePaymentCommandGateway(client));
  if (result.success) revalidateFullPaymentFlow();
  return result;
}
