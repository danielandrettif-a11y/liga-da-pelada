import { describe, expect, it } from "vitest";
import { calculateMarketV15Price } from "./market-v15";

const base = {
  officialPoints: 24,
  positionMedianPoints: 18,
  roundQuality: 0.75,
  formQuality: 0.60,
  seasonQuality: 0.55,
  games: 6,
};

describe("Mercado V15 por expectativa de preço e posição", () => {
  it("valoriza mais o barato que entrega a mesma pontuação do caro", () => {
    const cheap = calculateMarketV15Price({ ...base, currentPrice: 8, positionPriceQuality: 0.15 });
    const expensive = calculateMarketV15Price({ ...base, currentPrice: 17, positionPriceQuality: 0.90 });
    expect(cheap.deliveryQuality).toBeGreaterThan(expensive.deliveryQuality);
    expect(cheap.variation).toBeGreaterThan(expensive.variation);
  });

  it("limita uma valorização normal a C$ 1,50", () => {
    const result = calculateMarketV15Price({
      ...base, currentPrice: 22, officialPoints: 60, roundQuality: 1,
      formQuality: 1, seasonQuality: 1, positionPriceQuality: 0.60, maxPrice: 30,
    });
    expect(result.priceChange).toBeLessThanOrEqual(1.5);
  });

  it("permite até C$ 1,80 para revelação barata", () => {
    const result = calculateMarketV15Price({
      ...base, currentPrice: 14, officialPoints: 60, roundQuality: 1,
      formQuality: 1, seasonQuality: 1, positionPriceQuality: 0.10,
    });
    expect(result.priceChange).toBeGreaterThan(1.5);
    expect(result.priceChange).toBeLessThanOrEqual(1.8);
  });

  it("limita a perda absoluta a C$ 1,20", () => {
    const result = calculateMarketV15Price({
      ...base, currentPrice: 20, officialPoints: -8, roundQuality: 0,
      formQuality: 0, seasonQuality: 0, positionPriceQuality: 1,
    });
    expect(result.priceChange).toBe(-1.2);
  });

  it("protege o top 15% e atuações positivas acima da mediana", () => {
    const top = calculateMarketV15Price({
      ...base, currentPrice: 18, officialPoints: 12, roundQuality: 0.90,
      formQuality: 0, seasonQuality: 0, positionPriceQuality: 1,
    });
    const median = calculateMarketV15Price({
      ...base, currentPrice: 18, officialPoints: 1, roundQuality: 0.50,
      formQuality: 0, seasonQuality: 0, positionPriceQuality: 1,
    });
    expect(top.variation).toBeGreaterThanOrEqual(0.03 - 0.001);
    expect(top.guardrail).toBe("TOP_15");
    expect(median.priceChange).toBeGreaterThanOrEqual(0);
    expect(median.guardrail).toBe("POSITIVE_ABOVE_MEDIAN");
  });

  it("mantém o preço de quem não participou", () => {
    const result = calculateMarketV15Price({
      ...base, currentPrice: 12.48, positionPriceQuality: 0.5, games: 0,
    });
    expect(result.nextPrice).toBe(12.48);
    expect(result.guardrail).toBe("DID_NOT_PLAY");
  });
});
