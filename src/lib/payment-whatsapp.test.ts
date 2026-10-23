import { describe, expect, it } from "vitest";
import { buildDetailedPaymentWhatsAppMessage, buildSimplePaymentWhatsAppMessage } from "./payment-whatsapp";

const round = {
  number: 9,
  date: "2026-10-24",
  round_type: "ranked",
  payment_pix: "admin@example.com",
  payment_recipient_name: "Daniel",
};

describe("mensagem de pagamento para WhatsApp", () => {
  it("lista jogadores, valores e PIX na cobrança simples", () => {
    const message = buildSimplePaymentWhatsAppMessage({
      round,
      players: [
        { id: "p1", name: "João", paid: false },
        { id: "p2", name: "Maria", paid: true },
      ],
      amountByPlayer: { p1: 25, p2: 25 },
    });

    expect(message).toContain("Rodada 09");
    expect(message).toContain("João — *R$ 25,00*");
    expect(message).toContain("✅ 2. Maria");
    expect(message).toContain("PIX de Daniel:* admin@example.com");
  });

  it("soma as obrigações e detalha mais de um destinatário", () => {
    const message = buildDetailedPaymentWhatsAppMessage({
      round,
      players: [{ id: "p1", name: "João" }],
      obligations: [
        { player_id: "p1", recipient_name: "Daniel", recipient_pix: "pix-admin", amount_due: 20, amount_paid: 0 },
        { player_id: "p1", recipient_name: "Matheus", recipient_pix: "pix-bola", amount_due: 5, amount_paid: 0 },
      ],
    });

    expect(message).toContain("João — *R$ 25,00*");
    expect(message).toContain("↳ Daniel: R$ 20,00");
    expect(message).toContain("↳ Matheus: R$ 5,00");
    expect(message).toContain("PIX de Daniel:* pix-admin");
    expect(message).toContain("PIX de Matheus:* pix-bola");
  });
});
