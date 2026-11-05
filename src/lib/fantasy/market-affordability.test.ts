import { describe, expect, it } from "vitest";
import { getCheapestValidFantasyLineupCost } from "./market-affordability";

describe("piso de acessibilidade do Cartola", () => {
  it("calcula o time válido mais barato para sete vagas", () => {
    const players = [
      { id: "d1", price: 5, profile: "defensive" },
      { id: "d2", price: 6, profile: "defensive" },
      { id: "d3", price: 7, profile: "defensive" },
      { id: "d4", price: 8, profile: "defensive" },
      { id: "a1", price: 4, profile: "offensive" },
      { id: "a2", price: 9, profile: "offensive" },
      { id: "a3", price: 10, profile: "offensive" },
      { id: "a4", price: 11, profile: "offensive" },
    ];
    expect(getCheapestValidFantasyLineupCost(players, 7)).toBe(49);
  });

  it("retorna nulo quando não existe formação completa", () => {
    expect(getCheapestValidFantasyLineupCost([
      { id: "a1", price: 5, profile: "offensive" },
      { id: "a2", price: 6, profile: "offensive" },
    ], 5)).toBeNull();
  });

  it("escolhe a formação de seis vagas mais barata", () => {
    const players = [
      { id: "d1", price: 5, profile: "defensive" },
      { id: "d2", price: 6, profile: "defensive" },
      { id: "d3", price: 20, profile: "defensive" },
      { id: "a1", price: 4, profile: "offensive" },
      { id: "a2", price: 7, profile: "offensive" },
      { id: "a3", price: 8, profile: "offensive" },
      { id: "a4", price: 9, profile: "offensive" },
    ];
    expect(getCheapestValidFantasyLineupCost(players, 6)).toBe(39);
  });
});
