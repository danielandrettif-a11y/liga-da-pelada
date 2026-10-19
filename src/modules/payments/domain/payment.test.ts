import { describe, expect, it } from "vitest";
import {
  normalizeExpenseItemIds,
  validateExpenseItem,
  validatePaidInstallments,
  validatePaymentRecipient,
  validateRoundPaymentDetails,
} from "./payment";

describe("payment domain", () => {
  it("normaliza um item de despesa válido", () => {
    expect(validateExpenseItem({ name: " Bola ", description: " Oficial ", totalAmount: 150, installmentCount: 3, recipientId: "pix-1" }))
      .toEqual({ value: { name: "Bola", description: "Oficial", totalAmount: 150, installmentCount: 3, recipientId: "pix-1" } });
  });

  it("rejeita nome, valor e parcelas inválidos", () => {
    expect(validateExpenseItem({ name: "x", totalAmount: 1, installmentCount: 1, recipientId: "pix" })).toHaveProperty("error");
    expect(validateExpenseItem({ name: "bola", totalAmount: 0, installmentCount: 1, recipientId: "pix" })).toHaveProperty("error");
    expect(validateExpenseItem({ name: "bola", totalAmount: 1, installmentCount: 121, recipientId: "pix" })).toHaveProperty("error");
  });

  it("aceita somente parcelas pagas inteiras e não negativas", () => {
    expect(validatePaidInstallments(3)).toEqual({ value: 3 });
    expect(validatePaidInstallments(-1)).toHaveProperty("error");
    expect(validatePaidInstallments(1.5)).toHaveProperty("error");
  });

  it("normaliza destinatário e exige nome e PIX", () => {
    expect(validatePaymentRecipient({ name: " Tesoureiro ", pixKey: " chave " })).toEqual({
      value: { id: undefined, name: "Tesoureiro", pixKey: "chave", pixType: null, active: true },
    });
    expect(validatePaymentRecipient({ name: "", pixKey: "chave" })).toHaveProperty("error");
  });

  it("deduplica apenas UUIDs de itens", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(normalizeExpenseItemIds([id, "inválido", id])).toEqual([id]);
  });

  it("normaliza detalhes da rodada e exige participantes dos extras", () => {
    const base = { roundId: "round", paymentPix: " chave ", paymentTotal: 100, extraTimeTotal: 20, extraTimePlayerIds: ["p1", "p1"], ballFundTotal: 0, ballFundPlayerIds: ["p2"] };
    expect(validateRoundPaymentDetails(base)).toEqual({ value: {
      roundId: "round", pix: "chave", total: 100, extraTimeTotal: 20,
      extraTimePlayerIds: ["p1"], ballFundTotal: 0, ballFundPlayerIds: [],
    } });
    expect(validateRoundPaymentDetails({ ...base, extraTimePlayerIds: [] })).toHaveProperty("error");
  });
});
