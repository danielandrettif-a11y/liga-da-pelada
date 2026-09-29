import { describe, expect, it } from "vitest";
import { calculateRankingPositionBonus, parseRankingRoleWeights, resolveRankingRoleWeights } from "./ranking-position-bonus";

const stats = {
  goals: 2,
  assists: 2,
  draws: 3,
  defensiveCleanGames: 4,
  defensiveOneGoalGames: 1,
  goalkeeperGames: 0,
  cleanSheets: 0,
};

describe("ranking position bonus", () => {
  it("usa o maior OVR inteiro e o segundo pela metade, sem GOL", () => {
    expect(resolveRankingRoleWeights({ DEF: 80, ALA_MEI: 84, ATA: 82 }, "defensive")).toEqual([
      { role: "MEI", overall: 84, weight: 1 },
      { role: "ATA", overall: 82, weight: 0.5 },
    ]);
  });

  it("usa o perfil cadastrado para desempatar OVRs", () => {
    expect(resolveRankingRoleWeights({ DEF: 80, ALA_MEI: 80, ATA: 79 }, "midfield")[0]).toEqual({ role: "MEI", overall: 80, weight: 1 });
  });

  it("aplica o teto de cada posição antes do peso secundário", () => {
    expect(calculateRankingPositionBonus({
      ...stats,
      roleWeights: [
        { role: "DEF", overall: 90, weight: 1 },
        { role: "MEI", overall: 88, weight: 0.5 },
      ],
    })).toBe(13);
  });

  it("ignora pesos persistidos inválidos", () => {
    expect(parseRankingRoleWeights([{ role: "GOL", overall: 99, weight: 1 }, { role: "ATA", overall: 82, weight: 0.5 }])).toEqual([
      { role: "ATA", overall: 82, weight: 0.5 },
    ]);
  });
});
