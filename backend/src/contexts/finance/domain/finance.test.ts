import { describe, expect, it } from "vitest";
import {
  areRoundParticipantsPaid,
  validateExpenseItem,
  validatePaidInstallments,
  validatePaymentRecipient,
  validateRoundPaymentDetails,
} from "./finance.js";

describe("Finance Domain", () => {
  it("validates expense item input", () => {
    expect(
      validateExpenseItem({
        name: "A",
        totalAmount: 100,
        installmentCount: 2,
        recipientId: "rec-1",
      }),
    ).toHaveProperty("error");

    expect(
      validateExpenseItem({
        name: "Churrasco",
        totalAmount: 0,
        installmentCount: 2,
        recipientId: "rec-1",
      }),
    ).toHaveProperty("error");

    expect(
      validateExpenseItem({
        name: "Bolas de Futebol",
        totalAmount: 300,
        installmentCount: 3,
        recipientId: "rec-1",
      }),
    ).toEqual({
      value: {
        name: "Bolas de Futebol",
        description: null,
        totalAmount: 300,
        installmentCount: 3,
        recipientId: "rec-1",
      },
    });
  });

  it("validates paid installments", () => {
    expect(validatePaidInstallments(-1)).toHaveProperty("error");
    expect(validatePaidInstallments(1.5)).toHaveProperty("error");
    expect(validatePaidInstallments(4)).toEqual({ value: 4 });
  });

  it("validates payment recipient input", () => {
    expect(validatePaymentRecipient({ name: "", pixKey: "" })).toHaveProperty("error");
    expect(
      validatePaymentRecipient({
        name: "Tesoureiro",
        pixKey: "12345678900",
        pixType: "cpf",
      }),
    ).toEqual({
      value: {
        id: undefined,
        name: "Tesoureiro",
        pixKey: "12345678900",
        pixType: "cpf",
        active: true,
      },
    });
  });

  it("validates round payment details input", () => {
    expect(
      validateRoundPaymentDetails({
        roundId: "r-1",
        paymentPix: "",
        paymentTotal: 100,
        extraTimeTotal: 0,
        extraTimePlayerIds: [],
        ballFundTotal: 0,
        ballFundPlayerIds: [],
      }),
    ).toHaveProperty("error");

    expect(
      validateRoundPaymentDetails({
        roundId: "r-1",
        paymentPix: "pix@chave",
        paymentTotal: 150,
        extraTimeTotal: 20,
        extraTimePlayerIds: ["p1"],
        ballFundTotal: 10,
        ballFundPlayerIds: ["p1", "p2"],
      }),
    ).toEqual({
      value: {
        roundId: "r-1",
        pix: "pix@chave",
        total: 150,
        extraTimeTotal: 20,
        extraTimePlayerIds: ["p1"],
        ballFundTotal: 10,
        ballFundPlayerIds: ["p1", "p2"],
      },
    });
  });

  it("checks if round participants are paid", () => {
    const participants = [
      { id: "p1", is_monthly_payer: true },
      { id: "p2", is_monthly_payer: false },
    ];
    expect(areRoundParticipantsPaid(participants, [{ player_id: "p2", paid: false }])).toBe(false);
    expect(areRoundParticipantsPaid(participants, [{ player_id: "p2", paid: true }])).toBe(true);
  });
});
