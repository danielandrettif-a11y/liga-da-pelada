import { describe, expect, it } from "vitest";
import { buildFantasyQuickHighlights } from "./build-quick-highlights";

describe("destaques rápidos do Cartola", () => {
  it("escolhe pontuação, valorização e desvalorização", () => {
    const result = buildFantasyQuickHighlights([
      { last_round_points: 9, variation_rate: 2, last_price_change: 1, players: { name: "A" } },
      { last_round_points: 4, variation_rate: -3, last_price_change: -2, players: [{ name: "B" }] },
    ]);
    expect(result?.topScorer?.name).toBe("A");
    expect(result?.topGain?.name).toBe("A");
    expect(result?.topDrop?.name).toBe("B");
  });

  it("não inventa destaques quando todos os valores são neutros", () => {
    expect(buildFantasyQuickHighlights([{ players: null }])).toEqual({
      topScorer: null,
      topGain: null,
      topDrop: null,
    });
  });
});
