import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changePaidInstallments,
  createExpenseItemForLeague,
  markPlayerPayment,
  syncExpenseItemsForRound,
  updatePaymentDetailsForRound,
  type PaymentCommandGateway,
} from "./payment-commands";

const gateway = {
  recipientIsActive: vi.fn(), createExpenseItem: vi.fn(), setExpenseItemStatus: vi.fn(),
  getExpenseInstallmentState: vi.fn(), setPaidInstallmentsBeforeApp: vi.fn(), getRoundStatus: vi.fn(),
  syncRoundPlan: vi.fn(), setObligationPaid: vi.fn(), saveRecipient: vi.fn(), setRecipientActive: vi.fn(),
  participantExists: vi.fn(), upsertPlayerPayment: vi.fn(), pruneCollectiveHistory: vi.fn(),
  updateRoundPaymentDetails: vi.fn(), listActiveRoundExpenseItemIds: vi.fn(),
} satisfies PaymentCommandGateway;

beforeEach(() => {
  vi.clearAllMocks();
  gateway.recipientIsActive.mockResolvedValue(true);
  gateway.createExpenseItem.mockResolvedValue(null);
  gateway.setExpenseItemStatus.mockResolvedValue(null);
  gateway.getExpenseInstallmentState.mockResolvedValue({ installmentCount: 4, registeredCount: 1 });
  gateway.setPaidInstallmentsBeforeApp.mockResolvedValue(null);
  gateway.getRoundStatus.mockResolvedValue("finished");
  gateway.syncRoundPlan.mockResolvedValue(null);
  gateway.participantExists.mockResolvedValue(true);
  gateway.upsertPlayerPayment.mockResolvedValue(null);
  gateway.pruneCollectiveHistory.mockResolvedValue(undefined);
  gateway.updateRoundPaymentDetails.mockResolvedValue({ found: true, error: null });
  gateway.listActiveRoundExpenseItemIds.mockResolvedValue(["item-1"]);
});

describe("payment commands", () => {
  it("não grava item com destinatário de outra pelada", async () => {
    gateway.recipientIsActive.mockResolvedValueOnce(false);
    const result = await createExpenseItemForLeague(
      { name: "Bola", totalAmount: 100, installmentCount: 2, recipientId: "pix" },
      { leagueId: "league-a", userId: "user-a" }, gateway,
    );
    expect(result.success).toBe(false);
    expect(gateway.createExpenseItem).not.toHaveBeenCalled();
  });

  it("grava o item normalizado e escopado", async () => {
    await createExpenseItemForLeague(
      { name: " Bola ", totalAmount: 100, installmentCount: 2, recipientId: "pix" },
      { leagueId: "league-a", userId: "user-a" }, gateway,
    );
    expect(gateway.createExpenseItem).toHaveBeenCalledWith(expect.objectContaining({ leagueId: "league-a", userId: "user-a", name: "Bola" }));
  });

  it("impede que parcelas anteriores ultrapassem o total", async () => {
    const result = await changePaidInstallments("item", 4, "league-a", gateway);
    expect(result.success).toBe(false);
    expect(gateway.setPaidInstallmentsBeforeApp).not.toHaveBeenCalled();
  });

  it("só sincroniza itens em rodada finalizada e remove IDs inválidos", async () => {
    gateway.getRoundStatus.mockResolvedValueOnce("active");
    expect((await syncExpenseItemsForRound("round", [], "league-a", gateway)).success).toBe(false);
    const id = "11111111-1111-1111-1111-111111111111";
    await syncExpenseItemsForRound("round", [id, "x", id], "league-a", gateway);
    expect(gateway.syncRoundPlan).toHaveBeenCalledWith("round", [id]);
  });

  it("confirma pagamento e só então limpa o histórico", async () => {
    const result = await markPlayerPayment({ roundId: "round", playerId: "player", paid: true }, "league-a", gateway);
    expect(result).toEqual({ success: true });
    expect(gateway.pruneCollectiveHistory).toHaveBeenCalledAfter(gateway.upsertPlayerPayment);
  });

  it("salva os dados principais e recompõe o rateio", async () => {
    const result = await updatePaymentDetailsForRound({
      roundId: "round", paymentPix: "pix", paymentTotal: 100, extraTimeTotal: 0,
      extraTimePlayerIds: [], ballFundTotal: 0, ballFundPlayerIds: [],
    }, "league-a", gateway);
    expect(result.success).toBe(true);
    expect(gateway.syncRoundPlan).toHaveBeenCalledWith("round", ["item-1"]);
  });

  it("informa gravação parcial quando o rateio falha", async () => {
    gateway.syncRoundPlan.mockResolvedValueOnce("falha");
    const result = await updatePaymentDetailsForRound({
      roundId: "round", paymentPix: "pix", paymentTotal: 100, extraTimeTotal: 0,
      extraTimePlayerIds: [], ballFundTotal: 0, ballFundPlayerIds: [],
    }, "league-a", gateway);
    expect(result).toEqual({ success: false, error: "Os dados principais foram salvos, mas o rateio não foi atualizado: falha" });
  });
});
