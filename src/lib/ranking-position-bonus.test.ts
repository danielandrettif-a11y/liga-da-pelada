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

  it("normaliza pacotes diferentes para o mesmo teto de 7 pontos", () => {
    expect(calculateRankingPositionBonus({
      ...stats,
      roleWeights: [
        { role: "DEF", overall: 90, weight: 1 },
        { role: "MEI", overall: 88, weight: 0.5 },
      ],
    })).toBe(7);

    expect(calculateRankingPositionBonus({
      ...stats,
      roleWeights: [
        { role: "MEI", overall: 90, weight: 1 },
        { role: "ATA", overall: 88, weight: 0.5 },
      ],
    })).toBe(7);
  });

  it("preserva proporcionalmente bônus abaixo do teto", () => {
    expect(calculateRankingPositionBonus({
      ...stats,
      goals: 0,
      assists: 0,
      draws: 0,
      defensiveCleanGames: 1,
      defensiveOneGoalGames: 0,
      roleWeights: [
        { role: "DEF", overall: 90, weight: 1 },
        { role: "MEI", overall: 88, weight: 0.5 },
      ],
    })).toBe(0.81);
  });

  it("ignora pesos persistidos inválidos", () => {
    expect(parseRankingRoleWeights([{ role: "GOL", overall: 99, weight: 1 }, { role: "ATA", overall: 82, weight: 0.5 }])).toEqual([
      { role: "ATA", overall: 82, weight: 0.5 },
    ]);
  });
});
