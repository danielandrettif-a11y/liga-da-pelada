import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import { calculateFantasyPlayerPoints, calculateFantasyPrices, predictionIsCorrect, validateFantasyDraft } from "./engine";

describe("Fantasy da Pelada", () => {
  const prices = new Map(["a", "b", "c", "d", "e", "f"].map((id) => [id, 10]));

  it("valida rascunhos, cinco jogadores, capitão e orçamento", () => {
    expect(validateFantasyDraft({ playerIds: ["a", "b", "c", "d"], captainPlayerId: "a", prices, budget: 55 })).toMatchObject({ valid: true, complete: false });
    expect(validateFantasyDraft({ playerIds: ["a", "b", "c", "d", "e"], captainPlayerId: "a", prices, budget: 55 })).toMatchObject({ valid: true, complete: true, cost: 50 });
    expect(validateFantasyDraft({ playerIds: ["a", "b", "c", "d", "e", "f"], captainPlayerId: "a", prices, budget: 100 }).valid).toBe(false);
    expect(validateFantasyDraft({ playerIds: ["a", "a"], prices, budget: 55 }).valid).toBe(false);
    expect(validateFantasyDraft({ playerIds: ["a"], captainPlayerId: "b", prices, budget: 55 }).valid).toBe(false);
    expect(validateFantasyDraft({ playerIds: ["a", "b", "c", "d", "e"], captainPlayerId: "a", prices, budget: 49 }).valid).toBe(false);
  });

  it("calcula gols, assistências e vitórias sem usar o ranking principal", () => {
    expect(calculateFantasyPlayerPoints({ goals: 2, assists: 1, wins: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(17);
  });

  it("aceita líderes empatados, mas não concede bônus em empate zerado", () => {
    expect(predictionIsCorrect("a", ["a", "b"], 2)).toBe(true);
    expect(predictionIsCorrect("a", ["a", "b"], 0)).toBe(false);
  });

  it("valoriza relativamente, mantém ausente e respeita limites", () => {
    const results = calculateFantasyPrices([
      { playerId: "a", games: 3, wins: 3, draws: 0, goals: 3, assists: 1, recentPoints: [8, 12], seasonPoints: [8, 12], currentPrice: 24.9 },
      { playerId: "b", games: 3, wins: 0, draws: 0, goals: 0, assists: 0, recentPoints: [2, 1], seasonPoints: [2, 1], currentPrice: 5.1 },
      { playerId: "c", games: 0, wins: 0, draws: 0, goals: 0, assists: 0, recentPoints: [], seasonPoints: [], currentPrice: 10 },
    ], DEFAULT_FANTASY_SETTINGS);
    expect(results[0].nextPrice).toBeGreaterThanOrEqual(24.9);
    expect(results[0].nextPrice).toBeLessThanOrEqual(25);
    expect(results[1].nextPrice).toBeGreaterThanOrEqual(5);
    expect(results[2].nextPrice).toBe(10);
  });
});
