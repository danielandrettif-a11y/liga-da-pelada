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
  it("usa somente o maior OVR entre as posições de linha", () => {
    expect(resolveRankingRoleWeights({ DEF: 80, ALA_MEI: 84, ATA: 82 }, "defensive")).toEqual([
      { role: "MEI", overall: 84, weight: 1 },
    ]);
  });

  it("usa o perfil cadastrado para desempatar OVRs", () => {
    expect(resolveRankingRoleWeights({ DEF: 80, ALA_MEI: 80, ATA: 79 }, "midfield")[0]).toEqual({ role: "MEI", overall: 80, weight: 1 });
  });

  it("usa a característica principal na primeira rodada mesmo sem ser o maior OVR", () => {
    expect(resolveRankingRoleWeights({ DEF: 84, ALA_MEI: 82, ATA: 78 }, "offensive", true)).toEqual([
      { role: "ATA", overall: 78, weight: 1 },
    ]);
  });

  it("aplica tetos 10 para DEF, 8 para ALA e 7 para ATA", () => {
    expect(calculateRankingPositionBonus({
      ...stats,
      roleWeights: [
        { role: "DEF", overall: 90, weight: 1 },
        { role: "MEI", overall: 88, weight: 0.5 },
      ],
    })).toBe(10);

    expect(calculateRankingPositionBonus({
      ...stats,
      roleWeights: [{ role: "MEI", overall: 90, weight: 1 }],
    })).toBe(8);

    expect(calculateRankingPositionBonus({
      ...stats,
      goals: 4,
      roleWeights: [{ role: "ATA", overall: 90, weight: 1 }],
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
    })).toBe(1.25);
  });

  it("dá dois pontos por gol ao ATA até o teto de sete", () => {
    const roleWeights = [{ role: "ATA" as const, overall: 90, weight: 1 as const }];
    expect(calculateRankingPositionBonus({ ...stats, goals: 1, roleWeights })).toBe(2);
    expect(calculateRankingPositionBonus({ ...stats, goals: 2, roleWeights })).toBe(4);
    expect(calculateRankingPositionBonus({ ...stats, goals: 3, roleWeights })).toBe(6);
    expect(calculateRankingPositionBonus({ ...stats, goals: 4, roleWeights })).toBe(7);
  });

  it("ignora pesos persistidos inválidos", () => {
    expect(parseRankingRoleWeights([{ role: "GOL", overall: 99, weight: 1 }, { role: "ATA", overall: 82, weight: 0.5 }])).toEqual([
      { role: "ATA", overall: 82, weight: 0.5 },
    ]);
  });
});
