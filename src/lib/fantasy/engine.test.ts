import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import { calculateFantasyPlayerPoints, calculateFantasyPrices, predictionIsCorrect, validateFantasyDraft } from "./engine";
import { fantasyChallengeIsCorrect, fantasyChallengeOffer, fantasyPriceBand } from "./challenges";

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

  it("aplica a penalidade configurada por derrota", () => {
    expect(calculateFantasyPlayerPoints({ goals: 0, assists: 0, wins: 0, losses: 3 }, DEFAULT_FANTASY_SETTINGS)).toBe(-3);
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

  it("mantém preços empatados na mesma faixa do desafio", () => {
    const prices = [8, 8, 10, 12, 15];
    expect(fantasyPriceBand(8, prices)).toBe(1);
    expect(fantasyPriceBand(10, prices)).toBe(3);
    expect(fantasyPriceBand(15, prices)).toBe(4);
  });

  it("expõe meta e recompensa dos quatro desafios antes do save", () => {
    const prices = [8, 10, 12, 15];
    expect(fantasyChallengeOffer("REI_DAS_VITORIAS", 10, prices, DEFAULT_FANTASY_SETTINGS)).toMatchObject({ reward: 6 });
    expect(fantasyChallengeOffer("MITO_DA_RODADA", 10, prices, DEFAULT_FANTASY_SETTINGS)).toMatchObject({ reward: 8 });
    expect(fantasyChallengeOffer("APOSTA_DA_RODADA", 15, prices, DEFAULT_FANTASY_SETTINGS)).toMatchObject({ reward: 8, requiredRank: 2 });
    expect(fantasyChallengeOffer("VAI_GUARDAR", 8, prices, DEFAULT_FANTASY_SETTINGS)).toMatchObject({ reward: 7 });
  });

  it("avalia desafios com empate no corte e sem bônus em liderança zerada", () => {
    const performances = [
      { playerId: "a", goals: 2, wins: 2, basePoints: 14 },
      { playerId: "b", goals: 1, wins: 2, basePoints: 10 },
      { playerId: "c", goals: 0, wins: 0, basePoints: 10 },
    ];
    expect(fantasyChallengeIsCorrect({ type: "REI_DAS_VITORIAS", selectedId: "b", performances })).toBe(true);
    expect(fantasyChallengeIsCorrect({ type: "MITO_DA_RODADA", selectedId: "a", performances })).toBe(true);
    expect(fantasyChallengeIsCorrect({ type: "APOSTA_DA_RODADA", selectedId: "c", requiredRank: 2, performances })).toBe(true);
    expect(fantasyChallengeIsCorrect({ type: "VAI_GUARDAR", selectedId: "b", performances })).toBe(true);
    expect(fantasyChallengeIsCorrect({ type: "REI_DAS_VITORIAS", selectedId: "a", performances: performances.map((item) => ({ ...item, wins: 0 })) })).toBe(false);
  });
});
