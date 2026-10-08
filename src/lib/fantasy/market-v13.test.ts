import { describe, expect, it } from "vitest";
import { calculateMarketV13Price } from "./market-v13";

describe("Mercado V13 por posição", () => {
  it("não desvaloriza quem pontua positivo e fica no top 40% da posição", () => {
    const result = calculateMarketV13Price({
      currentPrice: 18, roundPoints: 4, roundQuality: 0.60,
      formQuality: 0.35, seasonQuality: 0.35, priceQuality: 1, games: 6,
    });
    expect(result.nextPrice).toBeGreaterThanOrEqual(18);
    expect(result.guardrail).toBe("GOOD_ROUND");
  });

  it("garante pelo menos 3% para o top 15%", () => {
    const result = calculateMarketV13Price({
      currentPrice: 10, roundPoints: 8, roundQuality: 0.90,
      formQuality: 0.50, seasonQuality: 0.50, priceQuality: 0.95, games: 6,
    });
    expect(result.nextPrice).toBeGreaterThanOrEqual(10.30);
    expect(result.guardrail).toBe("TOP_15");
  });

  it("permite que rodada ruim desvalorize jogador caro", () => {
    const result = calculateMarketV13Price({
      currentPrice: 18, roundPoints: -2, roundQuality: 0.10,
      formQuality: 0.25, seasonQuality: 0.55, priceQuality: 0.95, games: 6,
    });
    expect(result.nextPrice).toBeLessThan(18);
    expect(result.band).toBe("DOWN");
  });

  it("mantém o preço de quem não participou", () => {
    const result = calculateMarketV13Price({
      currentPrice: 12.48, roundPoints: 0, roundQuality: 0,
      formQuality: 0, seasonQuality: 0, priceQuality: 0.5, games: 0,
    });
    expect(result.nextPrice).toBe(12.48);
    expect(result.guardrail).toBe("DID_NOT_PLAY");
  });
});
