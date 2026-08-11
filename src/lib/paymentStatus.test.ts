import { describe, expect, it } from "vitest";
import { isPaymentChecklistComplete } from "./paymentStatus";

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
