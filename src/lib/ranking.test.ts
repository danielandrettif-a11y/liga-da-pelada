import { describe, expect, it } from "vitest";
import { formatRankingPoints, rankingActivePlayerIds, roundRankingPoints, sortRankingRounds } from "./ranking";

describe("rankingActivePlayerIds", () => {
  const rows = [
    { round_id: "r1", player_id: "active", games: 1 },
    { round_id: "r1", player_id: "absent", games: 0 },
    { round_id: "r0", player_id: "stale", games: 2 },
    { round_id: "r3", player_id: "returned", games: 1 },
  ];

  it("mantém quem jogou em ao menos uma das três últimas peladas", () => {
    expect([...rankingActivePlayerIds(["r3", "r2", "r1"], rows)].sort()).toEqual(["active", "returned"]);
  });

  it("volta a incluir imediatamente após uma nova atuação", () => {
    expect(rankingActivePlayerIds(["r3", "r2", "r1"], rows).has("returned")).toBe(true);
  });
});

describe("sortRankingRounds", () => {
  it("permite que Oficial e Legado tenham seis melhores diferentes", () => {
    const rows = [
      { id: "base", legacy: 10, official: 10 },
      { id: "bonus", legacy: 8, official: 13 },
    ];
    expect(sortRankingRounds(rows, (row) => row.official)[0].id).toBe("bonus");
    expect(sortRankingRounds(rows, (row) => row.legacy)[0].id).toBe("base");
  });
});

describe("ranking points precision", () => {
  it("normaliza resíduos de ponto flutuante em duas casas", () => {
    expect(roundRankingPoints(110.00999999999999)).toBe(110.01);
    expect(formatRankingPoints(21.99000000000001)).toBe("21,99");
  });

  it("não força casas decimais em números inteiros", () => {
    expect(formatRankingPoints(131)).toBe("131");
  });
});
