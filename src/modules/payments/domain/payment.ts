import type { Player, RoundStatus, RoundType } from "@/lib/types";

export type PaymentRound = {
  id: string;
  number: number;
  date: string;
  status: RoundStatus;
  round_type: RoundType;
  payment_pix: string | null;
  payment_total: number | null;
  payment_recipient_name: string | null;
  payment_extra_time_total: number;
  payment_extra_time_player_ids: string[];
  payment_ball_fund_total: number;
  payment_ball_fund_player_ids: string[];
};

export type PaymentRecipient = {
  id: string;
  name: string;
  pix_key: string;
  pix_type: string | null;
  is_active: boolean;
};

export type ExpenseItem = {
  id: string;
  name: string;
  description: string | null;
  total_amount: number;
  installment_count: number;
  status: "active" | "completed" | "archived";
  recipient_id: string;
  created_at: string;
  recipient: { name: string; pix_key: string } | null;
  paid_installments: number;
  paid_installments_before_app: number;
};

export type RoundExpenseSelection = { expense_item_id: string; installment_number: number };

export type PaymentChargeLine = {
  id: number;
  player_id: string;
  recipient_name: string;
  recipient_pix: string;
  label: string;
  amount: number;
  charge_type: string;
};

export type PaymentObligation = {
  id: string;
  round_id: string;
  player_id: string;
  recipient_name: string;
  recipient_pix: string;
  amount_due: number;
  amount_paid: number;
  status: "pending" | "partial" | "paid" | "credit";
};

export type PaymentPlayer = Player & { paid: boolean; paid_at: string | null };

export type PaymentAuditLogEntry = {
  id: number;
  round_id: string;
  target_player_id: string | null;
  target_player_name: string;
  paid: boolean;
  changed_by_player_id: string | null;
  changed_by_name: string;
  created_at: string;
  round: { id: string; number: number; date: string; round_type: RoundType } | null;
};

export type ExpenseItemInput = {
  name: string;
  description?: string;
  totalAmount: number;
  installmentCount: number;
  recipientId: string;
};

export type PaymentRecipientInput = {
  id?: string;
  name: string;
  pixKey: string;
  pixType?: string | null;
  active?: boolean;
};

export type RoundPaymentDetailsInput = {
  roundId: string;
  paymentPix: string;
  paymentTotal: number;
  extraTimeTotal: number;
  extraTimePlayerIds: string[];
  ballFundTotal: number;
  ballFundPlayerIds: string[];
};

export type NormalizedRoundPaymentDetails = {
  roundId: string;
  pix: string;
  total: number;
  extraTimeTotal: number;
  extraTimePlayerIds: string[];
  ballFundTotal: number;
  ballFundPlayerIds: string[];
};

export function validateExpenseItem(input: ExpenseItemInput) {
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  const totalAmount = Number(input.totalAmount);
  const installmentCount = Number(input.installmentCount);
  if (name.length < 2) return { error: "Informe o nome do item." } as const;
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return { error: "Informe um valor válido." } as const;
  if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 120) {
    return { error: "Escolha entre 1 e 120 parcelas." } as const;
  }
  if (!input.recipientId) return { error: "Escolha um PIX ativo desta pelada." } as const;
  return { value: { name, description, totalAmount, installmentCount, recipientId: input.recipientId } } as const;
}

export function validatePaidInstallments(value: number) {
  const paidInstallments = Number(value);
  if (!Number.isInteger(paidInstallments) || paidInstallments < 0) {
    return { error: "Informe uma quantidade inteira de parcelas." } as const;
  }
  return { value: paidInstallments } as const;
}

export function validatePaymentRecipient(input: PaymentRecipientInput) {
  const name = input.name.trim();
  const pixKey = input.pixKey.trim();
  if (!name || !pixKey) return { error: "Informe o nome e a chave PIX." } as const;
  return {
    value: {
      id: input.id,
      name,
      pixKey,
      pixType: input.pixType || null,
      active: input.active !== false,
    },
  } as const;
}

export function normalizeExpenseItemIds(ids: string[]) {
  return [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
}

export function validateRoundPaymentDetails(input: RoundPaymentDetailsInput) {
  const pix = input.paymentPix.trim();
  const total = Number(input.paymentTotal);
  const extraTimeTotal = Number(input.extraTimeTotal);
  const ballFundTotal = Number(input.ballFundTotal);
  if (!pix) return { error: "Informe a chave PIX." } as const;
  if (pix.length > 200) return { error: "A chave PIX deve ter no máximo 200 caracteres." } as const;
  if (!Number.isFinite(total) || total <= 0) return { error: "Informe um valor total valido." } as const;
  if (!Number.isFinite(extraTimeTotal) || extraTimeTotal < 0 || !Number.isFinite(ballFundTotal) || ballFundTotal < 0) {
    return { error: "Informe valores extras válidos." } as const;
  }
  const extraTimePlayerIds = extraTimeTotal > 0 ? [...new Set(input.extraTimePlayerIds.filter(Boolean))] : [];
  const ballFundPlayerIds = ballFundTotal > 0 ? [...new Set(input.ballFundPlayerIds.filter(Boolean))] : [];
  if (extraTimeTotal > 0 && !extraTimePlayerIds.length) return { error: "Selecione quem ficou no tempo extra." } as const;
  if (ballFundTotal > 0 && !ballFundPlayerIds.length) return { error: "Selecione quem participa da caixinha da bola." } as const;
  return {
    value: { roundId: input.roundId, pix, total, extraTimeTotal, extraTimePlayerIds, ballFundTotal, ballFundPlayerIds },
  } as const;
}
