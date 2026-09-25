import { describe, expect, it } from "vitest";
import { getOverallComposition } from "./overall-explanation";

const positions = {
  DEF: 73.1,
  ALA_MEI: 70.5,
  ATA: 69.7,
  GOL: 73.5,
};

describe("getOverallComposition", () => {
  it("usa as três melhores posições de linha em 50/35/15", () => {
    const result = getOverallComposition(["offensive", "defensive"], positions);

    expect(result?.items.map((item) => [item.role, item.weight])).toEqual([
      ["DEF", 0.5],
      ["ALA_MEI", 0.35],
      ["ATA", 0.15],
    ]);
    expect(result?.value).toBe(71.7);
  });

  it("não deixa a ordem das características alterar a composição", () => {
    const result = getOverallComposition(["midfield", "defensive"], {
      DEF: 73.1,
      ALA_MEI: 70.2,
      ATA: 67.9,
      GOL: 73.4,
    });

    expect(result?.items.map((item) => [item.role, item.weight])).toEqual([
      ["DEF", 0.5],
      ["ALA_MEI", 0.35],
      ["ATA", 0.15],
    ]);
    expect(result?.value).toBe(71.3);
  });

  it("calcula normalmente sem características definidas", () => {
    expect(getOverallComposition([], positions)?.value).toBe(71.7);
  });

  it("inclui GOL entre as três melhores somente depois de oito jogos", () => {
    const result = getOverallComposition(["defensive"], { ...positions, GOL: 76.4 }, {
      goalkeeperGames: 8,
    });

    expect(result).toMatchObject({
      source: "positions",
      value: 74.4,
      items: [{ role: "GOL", weight: 0.5 }, { role: "DEF", weight: 0.35 }, { role: "ALA_MEI", weight: 0.15 }],
    });
  });

  it("mantém a ordenação 50/35/15 em qualquer ordem das quatro notas", () => {
    const variants = [
      { DEF: 80, ALA_MEI: 75, ATA: 70, GOL: 90 },
      { DEF: 70, ALA_MEI: 90, ATA: 80, GOL: 75 },
      { DEF: 75, ALA_MEI: 70, ATA: 90, GOL: 80 },
      { DEF: 90, ALA_MEI: 80, ATA: 75, GOL: 70 },
    ];
    for (const values of variants) {
      const result = getOverallComposition([], values, { goalkeeperGames: 8 });
      expect(result?.items.map((item) => item.value)).toEqual([90, 80, 75]);
      expect(result?.value).toBe(84.3);
    }
  });

  it("mantém GOL fora no sétimo jogo e libera exatamente no oitavo", () => {
    const values = { DEF: 72, ALA_MEI: 71, ATA: 70, GOL: 90 };
    expect(getOverallComposition([], values, { goalkeeperGames: 7 })?.items.map((item) => item.role)).toEqual(["DEF", "ALA_MEI", "ATA"]);
    expect(getOverallComposition([], values, { goalkeeperGames: 8 })?.items.map((item) => item.role)).toEqual(["GOL", "DEF", "ALA_MEI"]);
  });
});
