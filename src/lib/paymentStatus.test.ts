import { describe, expect, it } from "vitest";
import { areRoundParticipantsPaid, calculateRoundPaymentAmounts, findLatestReleasedPaymentRound, isPaymentChecklistComplete } from "./paymentStatus";

describe("isPaymentChecklistComplete", () => {
  it("mantem o Transfermarket aberto enquanto existe pagamento pendente", () => {
    expect(isPaymentChecklistComplete([{ paid: true }, { paid: false }])).toBe(false);
  });

  it("encerra o Transfermarket quando todos pagaram", () => {
    expect(isPaymentChecklistComplete([{ paid: true }, { paid: true }])).toBe(true);
  });

  it("nao considera uma lista vazia como concluida", () => {
    expect(isPaymentChecklistComplete([])).toBe(false);
  });
});

describe("areRoundParticipantsPaid", () => {
  it("exige confirmação de cada participante da rodada", () => {
    const participants = [{ player_id: "a" }, { player_id: "b" }];
    expect(areRoundParticipantsPaid(participants, [{ player_id: "a", paid: true }])).toBe(false);
    expect(areRoundParticipantsPaid(participants, [
      { player_id: "a", paid: true },
      { player_id: "b", paid: true },
    ])).toBe(true);
  });
});

describe("rodada liberada no Transfermarket", () => {
  const finishedRound = {
    id: "finished",
    status: "finished",
    payment_pix: "pix@example.com",
    payment_total: 150,
  };

  it("usa a rodada finalizada mesmo quando existe uma pre-lista futura", () => {
    const futureRound = {
      id: "future",
      status: "draft",
      payment_pix: null,
      payment_total: null,
    };

    expect(findLatestReleasedPaymentRound([futureRound, finishedRound])?.id).toBe("finished");
  });

  it("ignora rodadas sem PIX ou valor", () => {
    expect(findLatestReleasedPaymentRound([
      { ...finishedRound, id: "without-pix", payment_pix: null },
      { ...finishedRound, id: "without-total", payment_total: null },
    ])).toBeNull();
  });
});

describe("rateio dos pagamentos", () => {
  it("soma tempo extra e caixinha somente para os participantes escolhidos sem perder centavos", () => {
    const result = calculateRoundPaymentAmounts({
      playerIds: ["a", "b", "c"],
      baseTotal: 100,
      extraTimeTotal: 30,
      extraTimePlayerIds: ["b", "c"],
      ballFundTotal: 12,
      ballFundPlayerIds: ["a", "c"],
    });

    expect(result.amountByPlayer).toEqual({ a: 39.34, b: 48.33, c: 54.33 });
    expect(result.baseByPlayer).toEqual({ a: 33.34, b: 33.33, c: 33.33 });
    expect(result.extraTimeByPlayer).toEqual({ a: 0, b: 15, c: 15 });
    expect(result.ballFundByPlayer).toEqual({ a: 6, b: 0, c: 6 });
    expect(result.grandTotal).toBe(142);
  });
});
