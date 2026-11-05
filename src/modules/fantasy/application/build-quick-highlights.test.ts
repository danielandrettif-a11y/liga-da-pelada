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

  it("considera somente o registro mais recente de cada jogador", () => {
    const result = buildFantasyQuickHighlights([
      { player_id: "p1", round_points: 2, variation_rate: 1, players: { name: "Atual" } },
      { player_id: "p1", round_points: 99, variation_rate: 9, players: { name: "Antigo" } },
      { player_id: "p2", round_points: 4, variation_rate: -1, players: { name: "Outro" } },
    ]);
    expect(result?.topScorer?.name).toBe("Outro");
    expect(result?.topGain?.name).toBe("Atual");
  });
});
