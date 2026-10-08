import { describe, expect, it } from "vitest";
import { calculateMarketV14Price } from "./market-v14";

describe("Mercado V14 com pontuação oficial", () => {
  it("não desvaloriza pontuação positiva a partir da mediana da posição", () => {
    const result = calculateMarketV14Price({
      currentPrice: 18, officialPoints: 30.8, roundQuality: 0.50,
      formQuality: 0.20, seasonQuality: 0.25, priceQuality: 1, games: 6,
    });
    expect(result.nextPrice).toBeGreaterThanOrEqual(18);
    expect(result.guardrail).toBe("POSITIVE_ABOVE_MEDIAN");
  });

  it("a forma ruim reduz a alta, mas não transforma uma boa rodada em queda", () => {
    const result = calculateMarketV14Price({
      currentPrice: 14, officialPoints: 21, roundQuality: 0.60,
      formQuality: 0.05, seasonQuality: 0.10, priceQuality: 0.95, games: 6,
    });
    expect(result.nextPrice).toBeGreaterThanOrEqual(14);
  });

  it("ainda desvaloriza atuação abaixo da mediana", () => {
    const result = calculateMarketV14Price({
      currentPrice: 18, officialPoints: 1.5, roundQuality: 0.10,
      formQuality: 0.25, seasonQuality: 0.55, priceQuality: 0.95, games: 6,
    });
    expect(result.nextPrice).toBeLessThan(18);
    expect(result.band).toBe("DOWN");
  });

  it("mantém o preço de quem não participou", () => {
    const result = calculateMarketV14Price({
      currentPrice: 12.48, officialPoints: 0, roundQuality: 0,
      formQuality: 0, seasonQuality: 0, priceQuality: 0.5, games: 0,
    });
    expect(result.nextPrice).toBe(12.48);
    expect(result.guardrail).toBe("DID_NOT_PLAY");
  });
});
