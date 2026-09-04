import { describe, expect, it } from "vitest";
import { BQ_SCORING_V5, calculateBQBasePoints, applyCaptainMultiplier, rankingRulesToSnapshot, snapshotToRankingRules } from "./bq-scoring";
import { calculateRankedPoints, RANKED_SCORING } from "./ranked-scoring";
import { DEFAULT_FANTASY_SETTINGS } from "./fantasy/config";
import { calculateFantasyPlayerPoints } from "./fantasy/engine";

describe("BQ Scoring v5 — Paridade Ranked/Cartola", () => {
  it("usa exatamente os mesmos 8 valores BQ para Ranked e Cartola", () => {
    expect(RANKED_SCORING.goal).toBe(BQ_SCORING_V5.goal);
    expect(RANKED_SCORING.assist).toBe(BQ_SCORING_V5.assist);
    expect(RANKED_SCORING.win).toBe(BQ_SCORING_V5.win);
    expect(RANKED_SCORING.draw).toBe(BQ_SCORING_V5.draw);
    expect(RANKED_SCORING.loss).toBe(BQ_SCORING_V5.loss);
    expect(RANKED_SCORING.ownGoal).toBe(BQ_SCORING_V5.ownGoal);
    expect(RANKED_SCORING.goalkeeperAppearance).toBe(BQ_SCORING_V5.goalkeeperAppearance);
    expect(RANKED_SCORING.goalkeeperGoalConceded).toBe(BQ_SCORING_V5.goalkeeperGoalConceded);

    expect(DEFAULT_FANTASY_SETTINGS.goalPoints).toBe(BQ_SCORING_V5.goal);
    expect(DEFAULT_FANTASY_SETTINGS.assistPoints).toBe(BQ_SCORING_V5.assist);
    expect(DEFAULT_FANTASY_SETTINGS.winPoints).toBe(BQ_SCORING_V5.win);
    expect(DEFAULT_FANTASY_SETTINGS.lossPoints).toBe(BQ_SCORING_V5.loss);
    expect(DEFAULT_FANTASY_SETTINGS.ownGoalPoints).toBe(BQ_SCORING_V5.ownGoal);
    expect(DEFAULT_FANTASY_SETTINGS.goalkeeperAppearancePoints).toBe(BQ_SCORING_V5.goalkeeperAppearance);
    expect(DEFAULT_FANTASY_SETTINGS.goalConcededPoints).toBe(BQ_SCORING_V5.goalkeeperGoalConceded);
  });

  it("calcula a base BQ idêntica entre Ranked e Cartola", () => {
    const stats = { goals: 2, assists: 1, wins: 3, draws: 1, losses: 2, ownGoals: 1, goalkeeperAppearances: 0, goalkeeperGoalsConceded: 0 };
    const rankedPoints = calculateRankedPoints(stats);
    const bqPoints = calculateBQBasePoints(BQ_SCORING_V5, {
      goals: 2, assists: 1, wins: 3, draws: 1, losses: 2, ownGoals: 1, goalkeeperAppearances: 0, goalkeeperGoalsConceded: 0,
    });
    const cartolaPoints = calculateFantasyPlayerPoints({
      goals: 2, assists: 1, wins: 3, draws: 1, losses: 2, goalkeeperGames: 0, goalsConceded: 0,
      ownGoals: 1, defensiveCleanGames: 0, defensiveOneGoalGames: 0,
    }, DEFAULT_FANTASY_SETTINGS);

    expect(rankedPoints).toBe(bqPoints);
    expect(cartolaPoints).toBe(bqPoints);
  });

  it("gol +4, assistência +2.5, vitória +3", () => {
    expect(calculateBQBasePoints(BQ_SCORING_V5, {
      goals: 1, assists: 1, wins: 1, draws: 0, losses: 0, ownGoals: 0,
      goalkeeperAppearances: 0, goalkeeperGoalsConceded: 0,
    })).toBe(9.5);
  });

  it("derrota -2.5 e gol contra -3", () => {
    expect(calculateBQBasePoints(BQ_SCORING_V5, {
      goals: 0, assists: 0, wins: 0, draws: 0, losses: 1, ownGoals: 1,
      goalkeeperAppearances: 0, goalkeeperGoalsConceded: 0,
    })).toBe(-5.5);
  });

  it("4 vitórias e 6 derrotas = -3", () => {
    expect(calculateBQBasePoints(BQ_SCORING_V5, {
      goals: 0, assists: 0, wins: 4, draws: 0, losses: 6, ownGoals: 0,
      goalkeeperAppearances: 0, goalkeeperGoalsConceded: 0,
    })).toBe(-3);
  });

  it("goleiro: atuação +2, gol sofrido -1", () => {
    expect(calculateBQBasePoints(BQ_SCORING_V5, {
      goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, ownGoals: 0,
      goalkeeperAppearances: 1, goalkeeperGoalsConceded: 2,
    })).toBe(0);
  });

  it("capitão aplica razão exata 3/2 produzindo 3.75 e 5.25", () => {
    // 2.5 * 1.5 = 3.75
    expect(applyCaptainMultiplier(2.5, 1.5)).toBe(3.75);
    // 3.5 * 1.5 = 5.25
    expect(applyCaptainMultiplier(3.5, 1.5)).toBe(5.25);
  });

  it("snapshot BQ converte ida e volta com ranking_rules", () => {
    const rules = snapshotToRankingRules(BQ_SCORING_V5);
    const restored = rankingRulesToSnapshot(rules, 5);
    expect(restored).toEqual(BQ_SCORING_V5);
  });

  it("empate +1 funciona corretamente", () => {
    expect(calculateBQBasePoints(BQ_SCORING_V5, {
      goals: 0, assists: 0, wins: 0, draws: 3, losses: 0, ownGoals: 0,
      goalkeeperAppearances: 0, goalkeeperGoalsConceded: 0,
    })).toBe(3);
  });

  it("cenário complexo: 2 gols, 1 assistência, 3V 1E 2D 1GC", () => {
    // 2*4 + 1*2.5 + 3*3 + 1*1 + 2*(-2.5) + 1*(-3) = 8 + 2.5 + 9 + 1 - 5 - 3 = 12.5
    expect(calculateBQBasePoints(BQ_SCORING_V5, {
      goals: 2, assists: 1, wins: 3, draws: 1, losses: 2, ownGoals: 1,
      goalkeeperAppearances: 0, goalkeeperGoalsConceded: 0,
    })).toBe(12.5);
  });
});
