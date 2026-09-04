import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./fantasy/config";
import { calculateFantasyPlayerPoints } from "./fantasy/engine";
import { buildRankedPointBreakdown, calculateRankedPoints, RANKED_SCORING } from "./ranked-scoring";

describe("Pontuação Ranked — BQ v5", () => {
  it("TESTE 1: vitória vale +3", () => {
    expect(calculateRankedPoints({ wins: 1 })).toBe(3);
  });

  it("TESTE 2: empate vale +1", () => {
    expect(calculateRankedPoints({ draws: 1 })).toBe(1);
  });

  it("TESTE 3: derrota vale -2.5", () => {
    expect(calculateRankedPoints({ losses: 1 })).toBe(-2.5);
  });

  it("TESTE 4: gol vale +4", () => {
    expect(calculateRankedPoints({ goals: 1 })).toBe(4);
  });

  it("TESTE 5: assistência vale +2.5", () => {
    expect(calculateRankedPoints({ assists: 1 })).toBe(2.5);
  });

  it("TESTE 6: gol contra vale -3", () => {
    expect(calculateRankedPoints({ ownGoals: 1 })).toBe(-3);
  });

  it.each([
    [0, 2],
    [1, 1],
    [2, 0],
    [3, -1],
    [4, -2],
  ])("TESTES 7-10: uma atuação no gol e %i sofridos resulta em %i", (conceded, expected) => {
    expect(calculateRankedPoints({ goalkeeperAppearances: 1, goalkeeperGoalsConceded: conceded })).toBe(expected);
  });

  it("TESTE 11: cenário A (5 gols, 2 assist, 5V 5D) resulta em 27.5 pontos", () => {
    expect(calculateRankedPoints({ goals: 5, assists: 2, wins: 5, losses: 5 })).toBe(27.5);
  });

  it("TESTE 12: cenário B (1 gol, 2 assist, 6V 1E 3D) resulta em 20.5 pontos", () => {
    expect(calculateRankedPoints({ goals: 1, assists: 2, wins: 6, draws: 1, losses: 3 })).toBe(20.5);
  });

  it("TESTE 13: tag DEF não altera a Ranked", () => {
    const stats = { wins: 1, playerProfile: "defensive" };
    expect(calculateRankedPoints(stats)).toBe(3);
  });

  it("TESTE 14: clean sheet e um gol sofrido na linha não geram bônus Ranked", () => {
    const stats = { wins: 1, defensiveCleanGames: 4, defensiveOneGoalGames: 3 };
    expect(calculateRankedPoints(stats)).toBe(3);
    expect(buildRankedPointBreakdown(stats).map((item) => item.label)).not.toContain("Defesa sem sofrer gol");
  });

  it.each(["offensive", "midfield"])("TESTE 15: tag %s não altera a Ranked", (playerProfile) => {
    const stats = { goals: 1, playerProfile };
    expect(calculateRankedPoints(stats)).toBe(4);
  });

  it("é idempotente com os mesmos scouts", () => {
    const stats = { goals: 2, assists: 1, wins: 3, draws: 1, losses: 2, ownGoals: 1 };
    expect(calculateRankedPoints(stats)).toBe(calculateRankedPoints(stats));
  });

  it("mantém a configuração em uma fonte única e sem regra DEF", () => {
    expect(RANKED_SCORING).toEqual({
      win: 3,
      goal: 4,
      assist: 2.5,
      draw: 1,
      loss: -2.5,
      ownGoal: -3,
      goalkeeperAppearance: 2,
      goalkeeperGoalConceded: -1,
    });
    expect(Object.keys(RANKED_SCORING).some((key) => /def|clean|position/i.test(key))).toBe(false);
  });
});

describe("TESTE 16: paridade Cartola BQ v5", () => {
  it("preserva todos os valores sincronizados com BQ v5 e sem DEF na base", () => {
    expect(DEFAULT_FANTASY_SETTINGS).toMatchObject({
      goalPoints: 4,
      assistPoints: 2.5,
      winPoints: 3,
      drawPoints: 1,
      lossPoints: -2.5,
      goalkeeperAppearancePoints: 2,
      goalConcededPoints: -1,
      ownGoalPoints: -3,
      captainMultiplier: 1.5,
    });
    // BQ v5: base uniforme sem bônus defensivo embutido
    expect(calculateFantasyPlayerPoints({
      goals: 0,
      assists: 0,
      wins: 0,
      losses: 0,
      playerProfile: "defensive",
      defensiveCleanGames: 2,
      defensiveOneGoalGames: 1,
    }, DEFAULT_FANTASY_SETTINGS)).toBe(0);
  });
});
