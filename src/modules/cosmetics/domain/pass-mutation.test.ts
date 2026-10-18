import { describe, expect, it } from "vitest";
import { claimPassError, purchasePassError, validatePassShopItemId } from "./pass-mutation";

describe("mensagens do Passe", () => {
  it("valida a compra e preserva os erros amigáveis", () => {
    expect(validatePassShopItemId("")).toBe("Item da loja inválido.");
    expect(validatePassShopItemId("item-1")).toBeNull();
    expect(claimPassError("Recompensa ainda nao desbloqueada")).toBe("Esta recompensa ainda não foi desbloqueada.");
    expect(claimPassError("Esta recompensa ja teve uma escolha permanente")).toBe("Você já escolheu a recompensa desta casa.");
    expect(claimPassError("falha desconhecida")).toContain("Atualize a página");
    expect(purchasePassError("Pontos extras insuficientes")).toBe("Você ainda não tem pontos extras suficientes.");
    expect(purchasePassError("falha desconhecida")).toBe("Não foi possível guardar o item agora. Tente novamente.");
  });
});
