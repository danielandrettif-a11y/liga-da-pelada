import { describe, expect, it } from "vitest";
import { areRoundParticipantsPaid, findLatestReleasedPaymentRound, isPaymentChecklistComplete } from "./paymentStatus";

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
