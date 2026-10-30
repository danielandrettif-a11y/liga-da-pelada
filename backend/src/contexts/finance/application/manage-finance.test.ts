import { describe, expect, it, vi } from "vitest";
import { createManageFinanceService, type FinanceRepository } from "./manage-finance.js";
import type { Actor } from "../../../shared/actor.js";

describe("Finance Application: manage-finance", () => {
  const adminActor: Actor = { userId: "admin-1" };
  const playerActor: Actor = { userId: "player-1" };

  function createMockRepo(overrides: Partial<FinanceRepository> = {}): FinanceRepository {
    return {
      checkIsAdmin: vi.fn(async (actor: Actor) => actor.userId === "admin-1"),
      getExpenseItems: vi.fn().mockResolvedValue([]),
      saveExpenseItem: vi.fn().mockResolvedValue({ success: true }),
      setExpenseItemStatus: vi.fn().mockResolvedValue({ success: true }),
      setExpenseItemPaidInstallments: vi.fn().mockResolvedValue({ success: true }),
      getPaymentRecipients: vi.fn().mockResolvedValue([]),
      savePaymentRecipient: vi.fn().mockResolvedValue({ success: true }),
      setPaymentRecipientActive: vi.fn().mockResolvedValue({ success: true }),
      getPaymentRounds: vi.fn().mockResolvedValue([]),
      getLatestFinishedRoundPaymentState: vi.fn().mockResolvedValue(null),
      getRoundPaymentWorkspace: vi.fn().mockResolvedValue({ roundId: "r1" }),
      getRoundPaymentPlayers: vi.fn().mockResolvedValue([]),
      getRoundPaymentObligations: vi.fn().mockResolvedValue([]),
      setPaymentObligationPaid: vi.fn().mockResolvedValue({ success: true }),
      setPlayerPayment: vi.fn().mockResolvedValue({ success: true }),
      getRoundExpenseSelections: vi.fn().mockResolvedValue([]),
      syncRoundExpenseItems: vi.fn().mockResolvedValue({ success: true }),
      updateRoundPaymentDetails: vi.fn().mockResolvedValue({ success: true }),
      getRoundPaymentChargeLines: vi.fn().mockResolvedValue([]),
      getPaymentAuditLog: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  it("blocks non-admin from saving expense items", async () => {
    const service = createManageFinanceService(createMockRepo());
    const result = await service.saveExpenseItem(playerActor, "l1", {
      name: "Bolas",
      totalAmount: 100,
      installmentCount: 2,
      recipientId: "rec-1",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Somente administradores");
  });

  it("allows admin to save expense item with valid data", async () => {
    const repo = createMockRepo();
    const service = createManageFinanceService(repo);
    const result = await service.saveExpenseItem(adminActor, "l1", {
      name: "Bolas",
      totalAmount: 100,
      installmentCount: 2,
      recipientId: "rec-1",
    });
    expect(result.success).toBe(true);
    expect(repo.saveExpenseItem).toHaveBeenCalledWith("l1", "admin-1", expect.any(Object));
  });

  it("checks pending payment round correctly", async () => {
    const repo = createMockRepo({
      getLatestFinishedRoundPaymentState: vi.fn().mockResolvedValue({
        participants: [{ id: "p1", is_monthly_payer: false }],
        payments: [{ player_id: "p1", paid: false }],
      }),
    });
    const service = createManageFinanceService(repo);
    const hasPending = await service.hasPendingPaymentRound(playerActor, "l1");
    expect(hasPending).toBe(true);
  });

  it("blocks non-admin from updating payment details", async () => {
    const service = createManageFinanceService(createMockRepo());
    const result = await service.updateRoundPaymentDetails(playerActor, "l1", {
      roundId: "r1",
      paymentPix: "pix@chave",
      paymentTotal: 100,
      extraTimeTotal: 0,
      extraTimePlayerIds: [],
      ballFundTotal: 0,
      ballFundPlayerIds: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Somente administradores");
  });

  it("allows player to set player payment", async () => {
    const repo = createMockRepo();
    const service = createManageFinanceService(repo);
    const result = await service.setPlayerPayment(playerActor, "l1", "r1", "p1", true);
    expect(result.success).toBe(true);
    expect(repo.setPlayerPayment).toHaveBeenCalledWith("l1", "r1", "p1", true, "player-1");
  });
});
