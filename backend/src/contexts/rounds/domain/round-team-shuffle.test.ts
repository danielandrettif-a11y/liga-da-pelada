import { describe, expect, it } from "vitest";
import { previewRoundReshuffle } from "./round-team-shuffle.js";

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const players = Array.from({ length: 12 }, (_, index) => ({
  id: `p-${index + 1}`,
  overall: 66 + index,
  speedRating: ([1, 2, 3] as const)[index % 3]!,
  playerProfile: (["defensive", "midfield", "offensive"] as const)[index % 3]!,
  isGoalkeeper: index === 0 || index === 6,
}));

describe("round team shuffle domain", () => {
  it.each(["random", "balanced", "speed", "adaptive"] as const)(
    "preserves capacity and player uniqueness in %s mode",
    (mode) => {
      const result = previewRoundReshuffle({
        players,
        capacities: [6, 6],
        mode,
        random: seededRandom(42),
      });

      expect(result.teams.map((team) => team.length)).toEqual([6, 6]);
      expect(new Set(result.teams.flat()).size).toBe(12);
      expect(result.summaries).toHaveLength(2);
      expect(result.balanceScore).toBeGreaterThanOrEqual(0);
    },
  );

  it("spreads private balance tags in adaptive mode", () => {
    const tagged = players.map((player, index) => ({
      ...player,
      overall: 70,
      balanceTag: index < 2 ? "craque_2" as const : index < 4 ? "bagre_2" as const : null,
    }));
    const result = previewRoundReshuffle({
      players: tagged,
      capacities: [6, 6],
      mode: "adaptive",
      random: seededRandom(12),
    });

    for (const team of result.teams) {
      expect(team.filter((id) => tagged.find((player) => player.id === id)?.balanceTag === "craque_2")).toHaveLength(1);
      expect(team.filter((id) => tagged.find((player) => player.id === id)?.balanceTag === "bagre_2")).toHaveLength(1);
    }
  });
});
