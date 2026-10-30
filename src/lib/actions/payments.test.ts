import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const getFinanceApiSessionMock = vi.fn();
const getActiveLeagueMock = vi.fn();
const getActiveSeasonMock = vi.fn();
const getCurrentAccountMock = vi.fn();
const getAdminClientMock = vi.fn();

vi.mock("@/modules/finance/infrastructure/finance-api-session", () => ({
  getFinanceApiSession: () => getFinanceApiSessionMock(),
}));

vi.mock("./rounds", () => ({
  getActiveLeague: () => getActiveLeagueMock(),
}));

vi.mock("./seasons", () => ({
  getActiveSeason: () => getActiveSeasonMock(),
}));

vi.mock("../auth", () => ({
  getCurrentAccount: () => getCurrentAccountMock(),
  getAdminClient: () => getAdminClientMock(),
}));

vi.mock("../supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));

import {
  getExpenseItems,
  saveExpenseItem,
  setExpenseItemStatus,
  setExpenseItemPaidInstallments,
  getPaymentRecipients,
  savePaymentRecipient,
  setPaymentRecipientActive,
  getPaymentRounds,
  hasPendingPaymentRound,
  getRoundPaymentWorkspace,
  getRoundPaymentPlayers,
  getRoundPaymentObligations,
  setPaymentObligationPaid,
  setPlayerPayment,
  getRoundExpenseSelections,
  syncRoundExpenseItems,
  updateRoundPaymentDetails,
  getRoundPaymentChargeLines,
  getPaymentAuditLog,
} from "./payments";

describe("Server Actions: payments (Finance Context)", () => {
  const leagueId = "league-finance-1";

  beforeEach(() => {
    vi.clearAllMocks();
    getActiveLeagueMock.mockResolvedValue({ id: leagueId });
    getActiveSeasonMock.mockResolvedValue({ id: "season-1" });
  });

  describe("Subfatia 1: Despesas e Destinatários PIX", () => {
    it("delegates getExpenseItems to gateway when api session is enabled", async () => {
      const mockGateway = {
        getExpenseItems: vi.fn().mockResolvedValue([{ id: "ei-1", name: "Bolas" }]),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await getExpenseItems(true);
      expect(result).toEqual([{ id: "ei-1", name: "Bolas" }]);
      expect(mockGateway.getExpenseItems).toHaveBeenCalledWith(leagueId, true);
    });

    it("delegates saveExpenseItem to gateway when api session is enabled", async () => {
      const mockGateway = {
        saveExpenseItem: vi.fn().mockResolvedValue({ success: true }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const input = { name: "Bolas", totalAmount: 100, installmentCount: 2, recipientId: "rec-1" };
      const result = await saveExpenseItem(input);
      expect(result).toEqual({ success: true });
      expect(mockGateway.saveExpenseItem).toHaveBeenCalledWith(leagueId, input);
    });

    it("delegates setExpenseItemStatus to gateway when api session is enabled", async () => {
      const mockGateway = {
        setExpenseItemStatus: vi.fn().mockResolvedValue({ success: true }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await setExpenseItemStatus("ei-1", "archived");
      expect(result).toEqual({ success: true });
      expect(mockGateway.setExpenseItemStatus).toHaveBeenCalledWith(leagueId, "ei-1", "archived");
    });

    it("delegates setExpenseItemPaidInstallments to gateway when api session is enabled", async () => {
      const mockGateway = {
        setExpenseItemPaidInstallments: vi.fn().mockResolvedValue({ success: true }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await setExpenseItemPaidInstallments("ei-1", 3);
      expect(result).toEqual({ success: true });
      expect(mockGateway.setExpenseItemPaidInstallments).toHaveBeenCalledWith(leagueId, "ei-1", 3);
    });

    it("delegates getPaymentRecipients to gateway when api session is enabled", async () => {
      const mockGateway = {
        getPaymentRecipients: vi.fn().mockResolvedValue([{ id: "rec-1", name: "Tesouraria" }]),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await getPaymentRecipients(false);
      expect(result).toHaveLength(1);
      expect(mockGateway.getPaymentRecipients).toHaveBeenCalledWith(leagueId, false);
    });

    it("delegates savePaymentRecipient to gateway when api session is enabled", async () => {
      const mockGateway = {
        savePaymentRecipient: vi.fn().mockResolvedValue({ success: true }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const input = { name: "Tesouraria", pixKey: "pix@chave" };
      const result = await savePaymentRecipient(input);
      expect(result).toEqual({ success: true });
      expect(mockGateway.savePaymentRecipient).toHaveBeenCalledWith(leagueId, input);
    });

    it("delegates setPaymentRecipientActive to gateway when api session is enabled", async () => {
      const mockGateway = {
        setPaymentRecipientActive: vi.fn().mockResolvedValue({ success: true }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await setPaymentRecipientActive("rec-1", false);
      expect(result).toEqual({ success: true });
      expect(mockGateway.setPaymentRecipientActive).toHaveBeenCalledWith(leagueId, "rec-1", false);
    });

    it("delegates getPaymentRounds to gateway when api session is enabled", async () => {
      const mockGateway = {
        getPaymentRounds: vi.fn().mockResolvedValue([{ id: "r1", number: 1 }]),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await getPaymentRounds();
      expect(result).toHaveLength(1);
      expect(mockGateway.getPaymentRounds).toHaveBeenCalledWith(leagueId);
    });

    it("delegates hasPendingPaymentRound to gateway when api session is enabled", async () => {
      const mockGateway = {
        hasPendingPaymentRound: vi.fn().mockResolvedValue(true),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await hasPendingPaymentRound();
      expect(result).toBe(true);
      expect(mockGateway.hasPendingPaymentRound).toHaveBeenCalledWith(leagueId);
    });
  });

  describe("Subfatia 2: Workspace de Rodada, Obrigações e Auditoria", () => {
    it("delegates getRoundPaymentWorkspace to gateway when api session is enabled", async () => {
      const mockGateway = {
        getRoundPaymentWorkspace: vi.fn().mockResolvedValue({ id: "r1", number: 1 }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await getRoundPaymentWorkspace("r1");
      expect(result).toEqual({ id: "r1", number: 1 });
      expect(mockGateway.getRoundPaymentWorkspace).toHaveBeenCalledWith(leagueId, "r1");
    });

    it("delegates getRoundPaymentPlayers to gateway when api session is enabled", async () => {
      const mockGateway = {
        getRoundPaymentPlayers: vi.fn().mockResolvedValue([{ id: "p1", name: "Jogador", paid: true }]),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await getRoundPaymentPlayers("r1");
      expect(result).toHaveLength(1);
      expect(mockGateway.getRoundPaymentPlayers).toHaveBeenCalledWith(leagueId, "r1");
    });

    it("delegates getRoundPaymentObligations to gateway when api session is enabled", async () => {
      const mockGateway = {
        getRoundPaymentObligations: vi.fn().mockResolvedValue([{ id: "ob-1", amount_due: 25 }]),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await getRoundPaymentObligations("r1");
      expect(result).toHaveLength(1);
      expect(mockGateway.getRoundPaymentObligations).toHaveBeenCalledWith(leagueId, "r1");
    });

    it("delegates setPaymentObligationPaid to gateway when api session is enabled", async () => {
      const mockGateway = {
        setPaymentObligationPaid: vi.fn().mockResolvedValue({ success: true }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await setPaymentObligationPaid("ob-1", 25);
      expect(result).toEqual({ success: true });
      expect(mockGateway.setPaymentObligationPaid).toHaveBeenCalledWith(leagueId, "ob-1", 25);
    });

    it("delegates setPlayerPayment to gateway when api session is enabled", async () => {
      const mockGateway = {
        setPlayerPayment: vi.fn().mockResolvedValue({ success: true }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await setPlayerPayment("r1", "p1", true);
      expect(result).toEqual({ success: true });
      expect(mockGateway.setPlayerPayment).toHaveBeenCalledWith(leagueId, "r1", "p1", true);
    });

    it("delegates getRoundExpenseSelections to gateway when api session is enabled", async () => {
      const mockGateway = {
        getRoundExpenseSelections: vi.fn().mockResolvedValue([{ expense_item_id: "ei-1", installment_number: 1 }]),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await getRoundExpenseSelections("r1");
      expect(result).toHaveLength(1);
      expect(mockGateway.getRoundExpenseSelections).toHaveBeenCalledWith(leagueId, "r1");
    });

    it("delegates syncRoundExpenseItems to gateway when api session is enabled", async () => {
      const mockGateway = {
        syncRoundExpenseItems: vi.fn().mockResolvedValue({ success: true }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await syncRoundExpenseItems("r1", ["ei-1", "ei-2"]);
      expect(result).toEqual({ success: true });
      expect(mockGateway.syncRoundExpenseItems).toHaveBeenCalledWith(leagueId, "r1", ["ei-1", "ei-2"]);
    });

    it("delegates updateRoundPaymentDetails to gateway when api session is enabled", async () => {
      const mockGateway = {
        updateRoundPaymentDetails: vi.fn().mockResolvedValue({ success: true }),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const input = {
        roundId: "r1",
        paymentPix: "pix@chave",
        paymentTotal: 100,
        extraTimeTotal: 0,
        extraTimePlayerIds: [],
        ballFundTotal: 0,
        ballFundPlayerIds: [],
      };
      const result = await updateRoundPaymentDetails(input);
      expect(result).toEqual({ success: true });
      expect(mockGateway.updateRoundPaymentDetails).toHaveBeenCalledWith(leagueId, input);
    });

    it("delegates getRoundPaymentChargeLines to gateway when api session is enabled", async () => {
      const mockGateway = {
        getRoundPaymentChargeLines: vi.fn().mockResolvedValue([{ id: 1, amount: 20 }]),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await getRoundPaymentChargeLines("r1");
      expect(result).toHaveLength(1);
      expect(mockGateway.getRoundPaymentChargeLines).toHaveBeenCalledWith(leagueId, "r1");
    });

    it("delegates getPaymentAuditLog to gateway when api session is enabled", async () => {
      const mockGateway = {
        getPaymentAuditLog: vi.fn().mockResolvedValue([{ id: 1, target_player_name: "Jogador" }]),
      };
      getFinanceApiSessionMock.mockResolvedValue({ enabled: true, gateway: mockGateway });

      const result = await getPaymentAuditLog();
      expect(result).toHaveLength(1);
      expect(mockGateway.getPaymentAuditLog).toHaveBeenCalledWith(leagueId);
    });
  });

  describe("Fallback legado quando flag desabilitada", () => {
    it("returns empty array for getExpenseItems if user is not logged in", async () => {
      getFinanceApiSessionMock.mockResolvedValue(null);
      getCurrentAccountMock.mockResolvedValue({ user: null });

      const result = await getExpenseItems();
      expect(result).toEqual([]);
    });

    it("fails saveExpenseItem if user is not admin in legacy flow", async () => {
      getFinanceApiSessionMock.mockResolvedValue(null);
      getAdminClientMock.mockResolvedValue(null);

      const result = await saveExpenseItem({
        name: "Item",
        totalAmount: 100,
        installmentCount: 1,
        recipientId: "rec-1",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Somente administradores");
    });
  });
});

