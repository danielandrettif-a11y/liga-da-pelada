import { describe, expect, it } from "vitest";
import {
  calculateColumnCGoalkeeperPoints,
  calculateColumnCLinePoints,
  calculateColumnCRankedPoints,
} from "./column-c-scoring";

describe("pontuação Coluna C v11", () => {
  it("aplica os valores distintos de ataque e defesa", () => {
    const stats = { goals: 2, assists: 1, teamGoalsConceded: 3, defensiveCleanGames: 1 };
    expect(calculateColumnCLinePoints("ATA", stats)).toBe(9);
    expect(calculateColumnCLinePoints("DEF", stats)).toBe(13.5);
  });

  it("faz uma derrota por 0 a 2 valer zero para o goleiro", () => {
    expect(calculateColumnCGoalkeeperPoints({ goalkeeperGames: 1, goalkeeperGoalsConceded: 2 })).toBe(0);
  });

  it("soma linha e gol sem contar os mesmos eventos duas vezes", () => {
    expect(calculateColumnCRankedPoints("ATA", {
      goals: 3,
      assists: 2,
      ownGoals: 1,
      teamGoalsConceded: 5,
      goalkeeperGames: 1,
      goalkeeperGoals: 1,
      goalkeeperAssists: 1,
      goalkeeperOwnGoals: 1,
      goalkeeperGoalsConceded: 2,
      goalkeeperCleanSheets: 0,
    })).toBe(14);
  });

  it("premia clean sheet somente em DEF e GOL", () => {
    expect(calculateColumnCLinePoints("ATA", { defensiveCleanGames: 2 })).toBe(0);
    expect(calculateColumnCLinePoints("DEF", { defensiveCleanGames: 2 })).toBe(4);
    expect(calculateColumnCGoalkeeperPoints({ goalkeeperGames: 2, goalkeeperCleanSheets: 2 })).toBe(6);
  });
});
