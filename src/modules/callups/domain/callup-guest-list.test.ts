import { describe, expect, it } from "vitest";
import { normalizeCallupGuestName, parseWhatsAppGuestList } from "./callup-guest-list";

describe("lista de convidados do WhatsApp", () => {
  it("remove cabeçalho, numeração, formatação e espaços vazios", () => {
    expect(parseWhatsAppGuestList([
      "⚽ *Pelada BQ – 24/10 - 08:00*",
      "",
      "1. Daniel Andretti",
      "2 -  Pedro  Alencar ",
      "3.",
      "*Lista de espera*",
      "1) Lucas França",
    ].join("\n"))).toEqual([
      { name: "Daniel Andretti", isGoalkeeper: false },
      { name: "Pedro Alencar", isGoalkeeper: false },
      { name: "Lucas França", isGoalkeeper: false },
    ]);
  });

  it("reconhece goleiros e elimina repetições ignorando acentos e caixa", () => {
    expect(parseWhatsAppGuestList("🧤 João Silva\n2. JOAO SILVA\n3. Maria (goleiro)\n4. Ana ✅"))
      .toEqual([
        { name: "João Silva", isGoalkeeper: true },
        { name: "Maria", isGoalkeeper: true },
        { name: "Ana", isGoalkeeper: false },
      ]);
  });

  it("aceita listas sem numeração e descarta links ou linhas sem nome", () => {
    expect(parseWhatsAppGuestList("Confirmados\nCaio\nBruno Souza\nhttps://exemplo.com\n1.\n✅"))
      .toEqual([
        { name: "Caio", isGoalkeeper: false },
        { name: "Bruno Souza", isGoalkeeper: false },
      ]);
  });

  it("normaliza nomes para comparar com o elenco", () => {
    expect(normalizeCallupGuestName("  João   DA Silva ")).toBe("joao da silva");
  });
});
