import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import {
  calculateMarketDifficulty,
  calculateMarketV11Price,
  getFantasyMarketHealthLevel,
  percentileById,
} from "./market-v11";

describe("Mercado V11", () => {
  it("aumenta a dificuldade em no máximo três pontos por rodada", () => {
    const easy = calculateMarketDifficulty({
      eliteAffordabilityRate: 0.90,
      medianEliteRatio: 1.30,
      previousMultiplier: 1,
    });
    expect(easy.pressure).toBe(1);
    expect(easy.multiplier).toBe(1.03);

    const hard = calculateMarketDifficulty({
      eliteAffordabilityRate: 0,
      medianEliteRatio: 0.40,
      previousMultiplier: 1,
    });
    expect(hard.multiplier).toBeLessThan(1);
    expect(1 - hard.multiplier).toBeLessThanOrEqual(0.03);
  });

  it("respeita os limites absolutos do multiplicador", () => {
    expect(calculateMarketDifficulty({ eliteAffordabilityRate: 1, medianEliteRatio: 2, previousMultiplier: 1.18 }).multiplier).toBe(1.18);
    expect(calculateMarketDifficulty({ eliteAffordabilityRate: 0, medianEliteRatio: 0, previousMultiplier: 0.94 }).multiplier).toBe(0.94);
  });

  it("classifica a saúde do mercado nos limiares públicos", () => {
    expect(getFantasyMarketHealthLevel(-0.20)).toBe("ACCESSIBLE");
    expect(getFantasyMarketHealthLevel(0)).toBe("BALANCED");
    expect(getFantasyMarketHealthLevel(0.20)).toBe("COMPETITIVE");
  });

  it("recompensa uma surpresa barata sem ultrapassar 18%", () => {
    const result = calculateMarketV11Price({
      currentPrice: 7,
      marketQuality: 0.92,
      roundMarketQuality: 0.95,
      priceQuality: 0.10,
      difficultyMultiplier: 1.03,
    });
    expect(result.profile).toBe("CHEAP_BREAKOUT");
    expect(result.recoveryBonus).toBeGreaterThan(1);
    expect(result.nextPrice).toBe(8.26);
  });

  it("aplica risco e queda de até 14% ao caro em rodada ruim", () => {
    const result = calculateMarketV11Price({
      currentPrice: 18,
      marketQuality: 0.20,
      roundMarketQuality: 0.05,
      priceQuality: 0.95,
      difficultyMultiplier: 1.18,
    });
    expect(result.profile).toBe("EXPENSIVE_BAD");
    expect(result.expensiveRisk).toBeGreaterThan(0);
    expect(result.nextPrice).toBe(15.48);
  });

  it("concentra a pressão de dificuldade na elite", () => {
    const cheap = calculateMarketV11Price({ currentPrice: 6, marketQuality: 0.10, roundMarketQuality: 0.10, priceQuality: 0.10, difficultyMultiplier: 1.18 });
    const elite = calculateMarketV11Price({ currentPrice: 18, marketQuality: 1, roundMarketQuality: 1, priceQuality: 1, difficultyMultiplier: 1.18 });
    expect(cheap.adaptiveTarget - cheap.baseTarget).toBeLessThan(0.1);
    expect(elite.adaptiveTarget - elite.baseTarget).toBeGreaterThan(3);
    expect(elite.nextPrice).toBeLessThanOrEqual(18 * 1.10);
    expect(elite.nextPrice).toBeLessThanOrEqual(DEFAULT_FANTASY_SETTINGS.maxPlayerPrice);
  });

  it("usa percentil médio para preços empatados", () => {
    const values = percentileById([
      { id: "a", value: 5 },
      { id: "b", value: 10 },
      { id: "c", value: 10 },
      { id: "d", value: 20 },
    ]);
    expect(values.get("b")).toBe(0.5);
    expect(values.get("c")).toBe(0.5);
  });
});
