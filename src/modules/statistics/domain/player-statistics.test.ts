import { describe, expect, it } from "vitest";
import {
  canonicalRoundPoints,
  canonicalSeasonPoints,
} from "./player-statistics";

describe("estatísticas canônicas de jogador", () => {
  it("usa ranking_points no Ranked e mantém points no amistoso", () => {
    const row = { points: 12, ranking_points: 18.5 };
    expect(canonicalRoundPoints(row, "official")).toBe(18.5);
    expect(canonicalRoundPoints(row, "friendly")).toBe(12);
  });

  it("mantém compatibilidade com rodadas antigas sem ranking_points", () => {
    expect(canonicalRoundPoints({ points: 9, ranking_points: null }, "official")).toBe(9);
  });

  it("calcula o Ranked pelas seis melhores participações", () => {
    const rows = [4, 18, 7, 13, 2, 10, 11].map((ranking_points) => ({ games: 1, points: 0, ranking_points }));
    expect(canonicalSeasonPoints(rows, "official")).toBe(63);
  });

  it("ignora linhas zeradas de convocados que não jogaram", () => {
    expect(canonicalSeasonPoints([
      { games: 1, ranking_points: 8 },
      { games: 0, ranking_points: 50 },
    ], "official")).toBe(8);
  });
});
