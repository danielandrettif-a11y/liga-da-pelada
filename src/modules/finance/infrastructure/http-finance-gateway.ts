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

export class FinanceApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "FinanceApiError";
  }
}

export interface FinanceGateway {
  getExpenseItems(leagueId: string, includeArchived?: boolean): Promise<ExpenseItem[]>;
  saveExpenseItem(leagueId: string, input: ExpenseItemInput): Promise<{ success: boolean; error?: string }>;
  setExpenseItemStatus(leagueId: string, id: string, status: "active" | "archived"): Promise<{ success: boolean; error?: string }>;
  setExpenseItemPaidInstallments(leagueId: string, id: string, paidInstallments: number): Promise<{ success: boolean; error?: string }>;
  getPaymentRecipients(leagueId: string, includeInactive?: boolean): Promise<PaymentRecipient[]>;
  savePaymentRecipient(leagueId: string, input: PaymentRecipientInput): Promise<{ success: boolean; error?: string }>;
  setPaymentRecipientActive(leagueId: string, id: string, active: boolean): Promise<{ success: boolean; error?: string }>;
  getPaymentRounds(leagueId: string): Promise<PaymentRound[]>;
  hasPendingPaymentRound(leagueId: string): Promise<boolean>;
  getRoundPaymentWorkspace(leagueId: string, roundId: string): Promise<any | null>;
  getRoundPaymentPlayers(leagueId: string, roundId: string): Promise<PaymentPlayer[]>;
  getRoundPaymentObligations(leagueId: string, roundId: string): Promise<PaymentObligation[]>;
  setPaymentObligationPaid(leagueId: string, id: string, amountPaid: number): Promise<{ success: boolean; error?: string }>;
  setPlayerPayment(leagueId: string, roundId: string, playerId: string, paid: boolean): Promise<{ success: boolean; error?: string }>;
  getRoundExpenseSelections(leagueId: string, roundId: string): Promise<RoundExpenseSelection[]>;
  syncRoundExpenseItems(leagueId: string, roundId: string, expenseItemIds: string[]): Promise<{ success: boolean; error?: string }>;
  updateRoundPaymentDetails(leagueId: string, input: RoundPaymentDetailsInput): Promise<
    | {
        success: true;
        details: {
          pix: string;
          total: number;
          extraTimeTotal: number;
          extraTimePlayerIds: string[];
          ballFundTotal: number;
          ballFundPlayerIds: string[];
        };
        error?: undefined;
      }
    | {
        success: false;
        error: string;
        details?: undefined;
      }
  >;
  getRoundPaymentChargeLines(leagueId: string, roundId: string): Promise<PaymentChargeLine[]>;
  getPaymentAuditLog(leagueId: string): Promise<PaymentAuditLogEntry[]>;
}

export type FinanceHttpGateway = FinanceGateway;

export function httpFinanceGateway(
  baseUrlOrOptions: string | { baseUrl: string; accessToken?: string },
  maybeToken?: string,
): FinanceGateway {
  const options =
    typeof baseUrlOrOptions === "string"
      ? { baseUrl: baseUrlOrOptions, accessToken: maybeToken }
      : baseUrlOrOptions;

  const normalizedBase = options.baseUrl.replace(/\/+$/, "");

  function authHeaders(withJson = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (options.accessToken) {
      headers.authorization = `Bearer ${options.accessToken}`;
    }
    if (withJson) {
      headers["content-type"] = "application/json";
    }
    return headers;
  }

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${normalizedBase}${path}`;
    const response = await fetch(url, init);
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? body.message
          : body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : `HTTP ${response.status}`;
      throw new FinanceApiError(message, response.status);
    }

    return body as T;
  }

  return {
    async getExpenseItems(leagueId, includeArchived = false) {
      const query = includeArchived ? "?includeArchived=true" : "";
      return requestJson<ExpenseItem[]>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/expenses${query}`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async saveExpenseItem(leagueId, input) {
      return requestJson<any>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/expenses`,
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify(input),
        },
      );
    },

    async setExpenseItemStatus(leagueId, id, status) {
      return requestJson<{ success: boolean; error?: string }>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/expenses/${encodeURIComponent(id)}/status`,
        {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ status }),
        },
      );
    },

    async setExpenseItemPaidInstallments(leagueId, id, paidInstallments) {
      return requestJson<{ success: boolean; error?: string }>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/expenses/${encodeURIComponent(id)}/paid-installments`,
        {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ paidInstallments }),
        },
      );
    },

    async getPaymentRecipients(leagueId, includeInactive = false) {
      const query = includeInactive ? "?includeInactive=true" : "";
      return requestJson<PaymentRecipient[]>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/recipients${query}`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async savePaymentRecipient(leagueId, input) {
      return requestJson<{ success: boolean; error?: string }>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/recipients`,
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify(input),
        },
      );
    },

    async setPaymentRecipientActive(leagueId, id, active) {
      return requestJson<{ success: boolean; error?: string }>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/recipients/${encodeURIComponent(id)}/active`,
        {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ active }),
        },
      );
    },

    async getPaymentRounds(leagueId) {
      return requestJson<PaymentRound[]>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async hasPendingPaymentRound(leagueId) {
      const res = await requestJson<{ hasPending: boolean }>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds/has-pending`,
        { headers: authHeaders(), cache: "no-store" },
      );
      return Boolean(res?.hasPending);
    },

    async getRoundPaymentWorkspace(leagueId, roundId) {
      return requestJson<any>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/workspace`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async getRoundPaymentPlayers(leagueId, roundId) {
      return requestJson<PaymentPlayer[]>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/players`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async getRoundPaymentObligations(leagueId, roundId) {
      return requestJson<PaymentObligation[]>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/obligations`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async setPaymentObligationPaid(leagueId, id, amountPaid) {
      return requestJson<{ success: boolean; error?: string }>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/obligations/${encodeURIComponent(id)}/paid`,
        {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ amountPaid }),
        },
      );
    },

    async setPlayerPayment(leagueId, roundId, playerId, paid) {
      return requestJson<{ success: boolean; error?: string }>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/payments`,
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ playerId, paid }),
        },
      );
    },

    async getRoundExpenseSelections(leagueId, roundId) {
      return requestJson<RoundExpenseSelection[]>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/expense-selections`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async syncRoundExpenseItems(leagueId, roundId, expenseItemIds) {
      return requestJson<{ success: boolean; error?: string }>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/expense-selections`,
        {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ expenseItemIds }),
        },
      );
    },

    async updateRoundPaymentDetails(leagueId, input) {
      return requestJson<any>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(input.roundId)}/details`,
        {
          method: "PUT",
          headers: authHeaders(true),
          body: JSON.stringify(input),
        },
      );
    },

    async getRoundPaymentChargeLines(leagueId, roundId) {
      return requestJson<PaymentChargeLine[]>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/rounds/${encodeURIComponent(roundId)}/charge-lines`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },

    async getPaymentAuditLog(leagueId) {
      return requestJson<PaymentAuditLogEntry[]>(
        `/api/finance/leagues/${encodeURIComponent(leagueId)}/audit-log`,
        { headers: authHeaders(), cache: "no-store" },
      );
    },
  };
}
