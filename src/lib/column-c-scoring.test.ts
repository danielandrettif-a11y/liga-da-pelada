import { describe, expect, it } from "vitest";
import {
  calculateColumnCGoalkeeperPoints,
  calculateColumnCLinePoints,
  calculateColumnCRankedPoints,
  inferOneGoalGames,
  inferTwoGoalGames,
} from "./column-c-scoring";

describe("pontuação Coluna C", () => {
  it("aplica os valores distintos de ataque e defesa", () => {
    const stats = { goals: 2, assists: 1, teamGoalsConceded: 3, defensiveCleanGames: 1, defensiveOneGoalGames: 1 };
    expect(calculateColumnCLinePoints("ATA", stats)).toBe(9);
    expect(calculateColumnCLinePoints("DEF", stats)).toBe(14.5);
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

  it("aplica GOL 4/2/0 e clean sheet regressivo do DEF", () => {
    expect(calculateColumnCLinePoints("ATA", { defensiveCleanGames: 2 })).toBe(0);
    expect(calculateColumnCLinePoints("DEF", { defensiveCleanGames: 1 })).toBe(3);
    expect(calculateColumnCLinePoints("DEF", { teamGoalsConceded: 1, defensiveOneGoalGames: 1 })).toBe(0.25);
    expect(calculateColumnCLinePoints("DEF", { teamGoalsConceded: 2 })).toBe(-1.75);
    expect(calculateColumnCGoalkeeperPoints({ goalkeeperGames: 1, goalkeeperCleanSheets: 1 })).toBe(5);
    expect(calculateColumnCGoalkeeperPoints({ goalkeeperGames: 1, goalkeeperGoalsConceded: 1 })).toBe(2.5);
    expect(calculateColumnCGoalkeeperPoints({ goalkeeperGames: 1, goalkeeperGoalsConceded: 2 })).toBe(0);
  });

  it("reconstrói partidas de um gol e preserva a regra v11", () => {
    expect(inferOneGoalGames(5, 2, 5)).toBe(1);
    expect(calculateColumnCGoalkeeperPoints({ goalkeeperGames: 1, goalkeeperCleanSheets: 1 }, 11)).toBe(3);
    expect(calculateColumnCLinePoints("DEF", { teamGoalsConceded: 1, defensiveOneGoalGames: 1 }, 11)).toBe(-0.5);
    expect(calculateColumnCLinePoints("DEF", { teamGoalsConceded: 1, defensiveOneGoalGames: 1 }, 12)).toBe(0.5);
    expect(inferTwoGoalGames(5, 1)).toBe(2);
  });

  it("aceita valores administrativos para as duas faixas do DEF", () => {
    expect(calculateColumnCLinePoints("DEF", {
      teamGoalsConceded: 3,
      defensiveOneGoalGames: 1,
    }, 13, {
      oneGoal: 0.5,
      oneGoalConceded: -1,
      twoGoalsConceded: -2,
    })).toBe(-2.5);
  });

  it("aceita os valores administrativos da atuação no gol", () => {
    expect(calculateColumnCGoalkeeperPoints({
      goalkeeperGames: 1,
      goalkeeperGoals: 1,
      goalkeeperAssists: 1,
      goalkeeperGoalsConceded: 1,
      goalkeeperCleanSheets: 0,
    }, 13, {
      appearance: 2,
      goal: 6,
      assist: 4,
      conceded: -1,
      cleanSheet: 5,
      oneGoal: 3,
      ownGoal: -4,
    })).toBe(14);
  });
});
